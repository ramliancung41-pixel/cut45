export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Spoken = "burmese" | "english";
type Caption = Spoken | "dual" | "none";
type VoiceType = "male" | "male_elder" | "female" | "female_elder" | "child_boy" | "child_girl";
type Line = { speaker: "A" | "B"; voiceType: VoiceType; voiceText: string; subtitleText: string; imageIndex: number };

type Body = {
  news?: unknown;
  language?: unknown;
  voiceLanguage?: unknown;
  subtitleLanguage?: unknown;
  preset?: unknown;
  imageCount?: unknown;
  videoUrl?: unknown;
  videoDurationSec?: unknown;
  audioBase64?: unknown;
  audioMimeType?: unknown;
  chunkOffsetSec?: unknown;
  chunkDurationSec?: unknown;
};

const PRIMARY_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
let cachedGeminiModel = "";

class QuotaError extends Error {}
class UnavailableModelError extends Error {}

const PRESETS = {
  "father-son": "Father and son. Host A is the son, curious and asking short questions. Host B is the father, calm and explaining clearly.",
  hosts: "Male and female news hosts. Host A asks short questions. Host B explains the news clearly.",
} as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const news = typeof body?.news === "string" ? body.news.trim().slice(0, 8000) : "";
  const legacy = body?.language === "burmese" ? "burmese" : body?.language === "english" ? "english" : "";
  const voiceLanguage: Spoken | "" = body?.voiceLanguage === "burmese" || body?.voiceLanguage === "english" ? body.voiceLanguage : legacy;
  const subtitleLanguage: Caption =
    body?.subtitleLanguage === "burmese" || body?.subtitleLanguage === "english" || body?.subtitleLanguage === "dual" || body?.subtitleLanguage === "none"
      ? body.subtitleLanguage
      : voiceLanguage || "english";
  const preset = body?.preset === "father-son" || body?.preset === "hosts" ? body.preset : "";
  const imageCount = typeof body?.imageCount === "number" ? Math.max(0, Math.min(3, Math.floor(body.imageCount))) : 0;
  const videoUrl = typeof body?.videoUrl === "string" && body.videoUrl.startsWith("https://") ? body.videoUrl : "";
  const videoDurationSec = typeof body?.videoDurationSec === "number" && body.videoDurationSec > 0 ? Math.min(3600, body.videoDurationSec) : 0;
  const audioBase64 = typeof body?.audioBase64 === "string" ? body.audioBase64.replace(/\s/g, "") : "";
  const audioMimeType = body?.audioMimeType === "audio/wav" || body?.audioMimeType === "audio/webm" ? body.audioMimeType : "";
  const chunkOffsetSec = typeof body?.chunkOffsetSec === "number" && body.chunkOffsetSec >= 0 ? Math.min(3600, body.chunkOffsetSec) : 0;
  const chunkDurationSec = typeof body?.chunkDurationSec === "number" && body.chunkDurationSec > 0 ? Math.min(480, body.chunkDurationSec) : 0;
  const audioChunk = Boolean(audioBase64 && audioMimeType && chunkDurationSec);
  if (audioBase64.length > 6_000_000) {
    return Response.json({ error: "That audio chunk is too large to transcribe." }, { status: 400 });
  }
  if (videoUrl || audioChunk) {
    if (subtitleLanguage !== "burmese" && subtitleLanguage !== "english" && subtitleLanguage !== "dual") {
      return Response.json({ error: "Choose Burmese, English, or dual subtitles." }, { status: 400 });
    }
  } else if (news.length < 8 || !voiceLanguage || !preset) {
    return Response.json({ error: "Add a news topic, a voice language, and a character preset." }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!geminiKey && !openaiKey) {
    return Response.json({ error: "A language model key is not configured yet." }, { status: 500 });
  }
  if (!geminiKey && (videoUrl || audioChunk)) {
    return Response.json({ error: "Gemini is required to write commentary from a video." }, { status: 500 });
  }

  const dubbing = Boolean(videoUrl || audioChunk);
  const spoken: Spoken = voiceLanguage === "burmese" ? "burmese" : "english";
  const presetKey = preset || "hosts";
  const system = dubbing
    ? `You write subtitles for the spoken dialogue in this video. Do not invent a host conversation and do not assign voices.
Listen from 0 seconds through ${audioChunk ? `${chunkDurationSec.toFixed(1)} seconds of this audio chunk` : videoDurationSec ? `${videoDurationSec.toFixed(1)} seconds` : "the end"}.
Return chronological subtitle cues covering that span. Times are relative to the start of this audio.
${subtitleInstruction(subtitleLanguage === "none" ? "english" : subtitleLanguage, spoken)}
Return JSON only, an array of {"startSec":number,"endSec":number,"subtitleText":string}.`
    : `You write an original news commentary. Do not copy dialogue, narration, or captions from the source. Describe what happens in the hosts' own words.
${PRESETS[presetKey]}
"voiceText" is what is spoken. Write it as original commentary in ${spoken === "burmese" ? "natural spoken Burmese (စကားပြောဟန်), not formal written Burmese" : "natural spoken English"}. Do not transcribe the source.
${subtitleInstruction(subtitleLanguage, spoken)}
For every line set "voiceType" to "male", "female", or "child" from who is speaking or narrating that moment. A child character uses "child".
Host A only asks questions. Host B only explains. Alternate speakers, starting with A.
Return 8 to 14 short lines.
Return JSON only, an array of {"speaker":"A"|"B","voiceType":"male"|"female"|"child","voiceText":string,"subtitleText":string,"imageIndex":number}.
imageIndex is an integer from 0 to ${Math.max(imageCount - 1, 0)}. Use 0 when there are no images.`;

  let raw = "";
  try {
    raw = geminiKey ? await geminiChain(geminiKey, system, news, videoUrl, audioChunk ? { mime: audioMimeType, inline: audioBase64 } : null) : await openaiScript(openaiKey, system, news);
  } catch (error) {
    if (error instanceof QuotaError) {
      const groqKey = process.env.GROQ_API_KEY?.trim() ?? "";
      if (dubbing && groqKey && (videoUrl || audioChunk)) {
        try {
          const heard = videoUrl ? await groqDub(groqKey, videoUrl, spoken, subtitleLanguage) : await groqAudio(groqKey, audioBase64, audioMimeType, spoken, subtitleLanguage);
          const shifted = audioChunk ? heard.map((line) => ({ ...line, startSec: line.startSec + chunkOffsetSec, endSec: Math.min(3600, line.endSec + chunkOffsetSec) })) : heard;
          return Response.json({ lines: shifted });
        } catch (groqError) {
          const groqMessage = groqError instanceof Error ? groqError.message : error.message;
          return Response.json({ error: groqMessage }, { status: 502 });
        }
      }
      if (dubbing) return Response.json({ error: error.message }, { status: 502 });
      return Response.json({ lines: localScript(news, spoken, subtitleLanguage) });
    }
    const message = error instanceof Error ? error.message : "The script could not be written.";
    if (geminiKey && openaiKey) {
      try {
        raw = await openaiScript(openaiKey, system, news);
      } catch (fallback) {
        const second = fallback instanceof Error ? fallback.message : message;
        return Response.json({ error: second }, { status: 502 });
      }
    } else {
      return Response.json({ error: message }, { status: 502 });
    }
  }

  const parsed = dubbing ? parseDubCues(raw, subtitleLanguage, spoken) : parseLines(raw, imageCount, subtitleLanguage, spoken);
  const lines = parsed && audioChunk ? parsed.map((line) => ("startSec" in line ? { ...line, startSec: line.startSec + chunkOffsetSec, endSec: Math.min(3600, line.endSec + chunkOffsetSec) } : line)) : parsed;
  if (!lines) {
    if (dubbing) return Response.json({ error: "Gemini did not return the spoken lines for this video." }, { status: 502 });
    return Response.json({ lines: localScript(news, spoken, subtitleLanguage) });
  }
  return Response.json({ lines });
}

async function geminiChain(apiKey: string, system: string, news: string, videoUrl: string, audio: { mime: string; inline: string } | null = null) {
  const video = audio ? audio : videoUrl ? await prepareGeminiVideo(apiKey, videoUrl) : null;
  if (audio) return rotateAudioModels(apiKey, system, news, video);
  const first = cachedGeminiModel && !PRIMARY_MODELS.includes(cachedGeminiModel) ? [cachedGeminiModel, ...PRIMARY_MODELS] : cachedGeminiModel ? [cachedGeminiModel, ...PRIMARY_MODELS.filter((model) => model !== cachedGeminiModel)] : [...PRIMARY_MODELS];
  let last = "Gemini quota exceeded.";
  let primaryFailures = 0;
  for (const model of first) {
    const result = await tryGeminiModel(apiKey, model, system, news, video);
    if (result.ok) {
      cachedGeminiModel = model;
      return result.text;
    }
    last = result.message;
    if (PRIMARY_MODELS.includes(model)) primaryFailures += 1;
  }
  if (primaryFailures < PRIMARY_MODELS.length) throw new QuotaError(last);
  const discovered = (await discoverFlashModels(apiKey)).filter((model) => !first.includes(model));
  for (const model of discovered) {
    const result = await tryGeminiModel(apiKey, model, system, news, video);
    if (result.ok) {
      cachedGeminiModel = model;
      return result.text;
    }
    last = result.message;
  }
  throw new QuotaError(last);
}

async function rotateAudioModels(apiKey: string, system: string, news: string, video: { mime: string; inline?: string; uri?: string } | null) {
  const discovered = await discoverFlashModels(apiKey);
  const models = [...PRIMARY_MODELS];
  for (const model of discovered) if (!models.includes(model)) models.push(model);
  if (cachedGeminiModel) {
    const rest = models.filter((model) => model !== cachedGeminiModel);
    models.splice(0, models.length, cachedGeminiModel, ...rest);
  }
  const waits = [1500, 3000, 5000];
  let last = "Gemini is currently experiencing high demand.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const model = models[attempt % models.length] || PRIMARY_MODELS[0];
    try {
      const text = await geminiScript(apiKey, model, system, news, video);
      cachedGeminiModel = model;
      return text;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      const busy = error instanceof QuotaError || /high demand|overloaded|unavailable|503|429/i.test(last);
      if (!busy || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt] ?? 5000));
    }
  }
  throw new QuotaError(last);
}

async function tryGeminiModel(apiKey: string, model: string, system: string, news: string, video: { mime: string; inline?: string; uri?: string } | null) {
  let message = "Gemini could not write the script.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { ok: true as const, text: await geminiScript(apiKey, model, system, news, video) };
    } catch (error) {
      message = error instanceof Error ? error.message : message;
      const busy = error instanceof QuotaError || /high demand|overloaded|unavailable|503|429/i.test(message);
      if (!busy || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1200 + Math.floor(Math.random() * 400)));
    }
  }
  return { ok: false as const, message };
}

async function discoverFlashModels(apiKey: string) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": apiKey },
  });
  const payload = (await response.json().catch(() => null)) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  } | null;
  if (!response.ok || !payload?.models) return [];
  return payload.models
    .map((model) => ({
      id: (model.name || "").replace(/^models\//, ""),
      methods: model.supportedGenerationMethods || [],
    }))
    .filter((model) => model.methods.includes("generateContent"))
    .filter((model) => /flash/i.test(model.id))
    .filter((model) => !/2\.5|2\.0|1\.5|embedding|audio-only/i.test(model.id))
    .sort((left, right) => flashRank(right.id) - flashRank(left.id))
    .slice(0, 4)
    .map((model) => model.id);
}

function flashRank(id: string) {
  const match = id.match(/(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 1000 + Number(match[2] || 0) : 0;
}

async function prepareGeminiVideo(apiKey: string, videoUrl: string) {
  const source = await fetch(videoUrl);
  if (!source.ok) throw new Error(`The uploaded video could not be read (${source.status}).`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const mime = sniffVideoMime(bytes) || fallbackVideoMime(source.headers.get("content-type") || "", videoUrl);
  if (bytes.byteLength < 1000 || bytes.byteLength > 80_000_000) {
    throw new Error("The video must be under 80 MB so it can be analyzed.");
  }
  if (bytes.byteLength <= 18_000_000) return { mime, inline: bytes.toString("base64") };
  const uploaded = await uploadVideoToGemini(apiKey, bytes, mime);
  await waitUntilActive(apiKey, uploaded.name);
  return { mime, uri: uploaded.uri };
}

async function waitUntilActive(apiKey: string, name: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    const payload = (await response.json().catch(() => null)) as { state?: string; error?: { message?: string } } | null;
    if (!response.ok) throw new Error(payload?.error?.message || `Gemini could not check the video (${response.status}).`);
    if (payload?.state === "ACTIVE") return;
    if (payload?.state === "FAILED") throw new Error("Gemini could not process the video.");
  }
  throw new Error("Gemini did not finish processing the video.");
}

async function uploadVideoToGemini(apiKey: string, bytes: Buffer, mime: string) {
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mime,
    },
    body: JSON.stringify({ file: { display_name: "news-source" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`Gemini could not accept the video (${start.status}).`);
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(bytes),
  });
  const payload = (await uploaded.json().catch(() => null)) as { file?: { uri?: string; name?: string } } | null;
  const uri = payload?.file?.uri ?? "";
  const name = payload?.file?.name ?? "";
  if (!uploaded.ok || !uri.startsWith("https://") || !name.startsWith("files/")) throw new Error("Gemini did not return a video file.");
  return { uri, name };
}

async function groqDub(apiKey: string, videoUrl: string, spoken: Spoken, subtitleLanguage: Caption) {
  const source = await fetch(videoUrl);
  if (!source.ok) throw new Error(`The uploaded video could not be read (${source.status}).`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const mime = sniffVideoMime(bytes) || fallbackVideoMime(source.headers.get("content-type") || "", videoUrl);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), mime === "video/webm" ? "clip.webm" : "clip.mp4");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  const heard = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const transcript = (await heard.json().catch(() => null)) as { error?: { message?: string }; segments?: Array<{ start?: number; end?: number; text?: string }> } | null;
  if (!heard.ok) throw new Error(transcript?.error?.message || `Groq could not transcribe the video (${heard.status}).`);
  const segments = (transcript?.segments ?? []).filter((segment) => (segment.text || "").trim()).slice(0, 15);
  if (segments.length === 0) throw new Error("Groq did not hear any speech in the video.");
  const translated = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Translate each spoken segment. voiceText is natural ${spoken === "burmese" ? "spoken Burmese" : "spoken English"}. ${subtitleInstruction(subtitleLanguage, spoken)} Guess speakerType as male, male_elder, female, female_elder, child_boy, or child_girl. Do not mark every line female. Keep the same startSec and endSec. Return {"lines":[{"startSec":number,"endSec":number,"speakerType":string,"voiceText":string,"subtitleText":string}]}.`,
        },
        { role: "user", content: JSON.stringify(segments.map((segment) => ({ startSec: segment.start, endSec: segment.end, text: segment.text }))) },
      ],
    }),
  });
  const payload = (await translated.json().catch(() => null)) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> } | null;
  if (!translated.ok) throw new Error(payload?.error?.message || `Groq could not translate the video (${translated.status}).`);
  const lines = parseDubCues(payload?.choices?.[0]?.message?.content ?? "", subtitleLanguage, spoken);
  if (!lines) throw new Error("Groq did not return timed dialogue.");
  return lines;
}

async function groqAudio(apiKey: string, audioBase64: string, mime: string, spoken: Spoken, subtitleLanguage: Caption) {
  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), mime === "audio/wav" ? "chunk.wav" : "chunk.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  const heard = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const transcript = (await heard.json().catch(() => null)) as { error?: { message?: string }; segments?: Array<{ start?: number; end?: number; text?: string }> } | null;
  if (!heard.ok) throw new Error(transcript?.error?.message || `Groq could not transcribe the audio (${heard.status}).`);
  const segments = (transcript?.segments ?? []).filter((segment) => (segment.text || "").trim()).slice(0, 40);
  if (segments.length === 0) return [];
  const translated = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Translate each spoken segment into subtitleText. ${subtitleInstruction(subtitleLanguage, spoken)} Keep the same startSec and endSec. Return {"lines":[{"startSec":number,"endSec":number,"subtitleText":string}]}.`,
        },
        { role: "user", content: JSON.stringify(segments.map((segment) => ({ startSec: segment.start, endSec: segment.end, text: segment.text }))) },
      ],
    }),
  });
  const payload = (await translated.json().catch(() => null)) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> } | null;
  if (!translated.ok) throw new Error(payload?.error?.message || `Groq could not translate the audio (${translated.status}).`);
  return parseDubCues(payload?.choices?.[0]?.message?.content ?? "", subtitleLanguage, spoken) ?? [];
}

function sniffVideoMime(bytes: Buffer) {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii");
    return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  }
  return "";
}

function fallbackVideoMime(header: string, videoUrl: string) {
  const headerMime = header.split(";")[0]?.trim().toLowerCase() || "";
  if (headerMime === "video/webm" || headerMime === "video/mp4" || headerMime === "video/quicktime") return headerMime;
  const lower = videoUrl.toLowerCase();
  if (lower.includes(".webm")) return "video/webm";
  if (lower.includes(".mov")) return "video/quicktime";
  return "video/mp4";
}

async function geminiScript(
  apiKey: string,
  model: string,
  system: string,
  news: string,
  video: { mime: string; uri?: string; inline?: string } | null,
) {
  const parts: Array<{ text?: string; file_data?: { mime_type: string; file_uri: string }; inline_data?: { mime_type: string; data: string } }> = [];
  if (video?.inline) parts.push({ inline_data: { mime_type: video.mime, data: video.inline } });
  else if (video?.uri) parts.push({ file_data: { mime_type: video.mime, file_uri: video.uri } });
  parts.push({ text: news || "Listen to every spoken line in this video and translate each one in time order." });
  const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  } | null;
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini could not write the script (${response.status}).`;
    if (
      response.status === 429 ||
      response.status === 500 ||
      response.status === 503 ||
      payload?.error?.status === "RESOURCE_EXHAUSTED" ||
      payload?.error?.status === "UNAVAILABLE" ||
      /quota|rate.?limit|resource.?exhausted|high demand|overloaded|unavailable|timeout/i.test(message)
    ) {
      throw new QuotaError(message);
    }
    if (response.status === 404 || /not found|is not supported|deprecated|shut down/i.test(message)) {
      throw new UnavailableModelError(message);
    }
    throw new Error(message);
  }
  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error(payload?.error?.message || "Gemini returned an empty script.");
  return text;
}

async function openaiScript(apiKey: string, system: string, news: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system} Wrap the array in {"lines":[...]} .` },
        { role: "user", content: news },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI could not write the script (${response.status}).`);
  return payload?.choices?.[0]?.message?.content ?? "";
}

function subtitleInstruction(subtitle: Caption, voice: Spoken) {
  if (subtitle === "none") return 'Set every "subtitleText" field to an empty string. Captions are off.';
  if (subtitle === "dual") return 'Set "subtitleText" to the same line in Burmese, then a newline, then the same line in English.';
  if (subtitle === voice) return 'Set "subtitleText" to the same words as "voiceText".';
  return `Set "subtitleText" to a natural ${subtitle === "burmese" ? "spoken Burmese" : "spoken English"} caption of the same line. Keep "voiceText" in the voice language.`;
}

function captionFor(text: string, voice: Spoken, subtitle: Caption) {
  if (subtitle === "none") return "";
  if (subtitle === voice) return text;
  return "";
}

function normalizeRole(value: unknown): VoiceType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const roles: VoiceType[] = ["male", "male_elder", "female", "female_elder", "child_boy", "child_girl"];
  if (roles.includes(key as VoiceType)) return key as VoiceType;
  if (key === "child" || key === "boy") return "child_boy";
  if (key === "girl") return "child_girl";
  if (key === "elder_male" || key === "old_man") return "male_elder";
  if (key === "elder_female" || key === "old_woman") return "female_elder";
  return null;
}

function parseDubCues(raw: string, subtitleLanguage: Caption, spoken: Spoken) {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  let parsed: unknown;
  try {
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw.slice(objectStart, objectEnd + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { lines?: unknown }).lines)
      ? (parsed as { lines: unknown[] }).lines
      : null;
  if (!list || list.length < 1) return null;
  const cues = list.slice(0, 60).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { startSec?: unknown; endSec?: unknown; speakerType?: unknown; voiceType?: unknown; voiceText?: unknown; subtitleText?: unknown };
    const startSec = typeof record.startSec === "number" && record.startSec >= 0 ? Math.min(3600, record.startSec) : -1;
    const endSec = typeof record.endSec === "number" ? Math.min(3600, record.endSec) : -1;
    const speakerType = normalizeRole(record.speakerType) || normalizeRole(record.voiceType);
    const voiceText = typeof record.voiceText === "string" ? record.voiceText.trim().slice(0, 240) : "";
    const supplied = typeof record.subtitleText === "string" ? record.subtitleText.trim().slice(0, 400) : "";
    const subtitleText = supplied || voiceText;
    if (!subtitleText || startSec < 0 || endSec - startSec < 0.4) return [];
    return [{ startSec, endSec, subtitleText, voiceText: voiceText || subtitleText, speakerType }];
  });
  return cues.length > 0 ? cues : null;
}

function localScript(news: string, language: Spoken, subtitle: Caption): Line[] {
  const parts = news
    .split(language === "burmese" ? /[။!?\n]+/ : /[\n.!?]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 12)
    .slice(0, 3);
  const fallback =
    language === "burmese"
      ? "ဒီဇာတ်ကားထဲက အဖြစ်အပျက်ကို အိမ်ရှင်နှစ်ယောက်က ကိုယ်ပိုင်စကားလုံးနဲ့ ပြန်ပြောထားပါတယ်။"
      : "The hosts walk through what happens in this clip, in their own words.";
  const facts = parts.length > 0 ? parts : [news.replace(/\s+/g, " ").trim().slice(0, 220) || fallback];
  const questions =
    language === "burmese"
      ? ["ဒီသတင်းက ဘာဖြစ်တာလဲ။", "အဓိကအချက်က ဘာလဲ။", "နောက်ဆက်တွဲ ဘာသိထားသင့်လဲ။"]
      : ["What happened in this story?", "What is the main point?", "What should people know next?"];
  const lines: Line[] = [];
  facts.forEach((fact, index) => {
    const question = questions[index] ?? questions[0];
    const answer = fact.slice(0, 240);
    lines.push({ speaker: "A", voiceType: "male", voiceText: question, subtitleText: captionFor(question, language, subtitle), imageIndex: 0 });
    lines.push({ speaker: "B", voiceType: "female", voiceText: answer, subtitleText: captionFor(answer, language, subtitle), imageIndex: 0 });
  });
  return lines.slice(0, 6);
}

function parseLines(raw: string, imageCount: number, subtitleLanguage: Caption, spoken: Spoken): Line[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  let parsed: unknown;
  try {
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw.slice(objectStart, objectEnd + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { lines?: unknown }).lines)
      ? (parsed as { lines: unknown[] }).lines
      : null;
  if (!list || list.length < 4) return null;
  const maxIndex = Math.max(imageCount - 1, 0);
  const lines = list.slice(0, 36).flatMap((item): Line[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as { speaker?: unknown; voiceType?: unknown; voiceText?: unknown; text?: unknown; subtitleText?: unknown; subtitle?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const voiceType = normalizeRole(record.voiceType) || (speaker === "B" ? "female" : "male");
    const voiceText = (typeof record.voiceText === "string" ? record.voiceText : typeof record.text === "string" ? record.text : "").trim().slice(0, 400);
    const supplied = (typeof record.subtitleText === "string" ? record.subtitleText : typeof record.subtitle === "string" ? record.subtitle : "").trim().slice(0, 500);
    const subtitleText = subtitleLanguage === "none" ? "" : supplied || captionFor(voiceText, spoken, subtitleLanguage);
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(maxIndex, Math.floor(record.imageIndex)) : 0;
    return speaker && voiceText ? [{ speaker, voiceType, voiceText, subtitleText, imageIndex }] : [];
  });
  return lines.length >= 4 ? lines : null;
}
