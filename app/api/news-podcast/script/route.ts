import { hybridTranscribeAndTranslate, parseSubtitleLanguage, translationInstruction } from "@/lib/whisper-translate";
import type { SubtitleLanguageCode } from "@/lib/subtitle-languages";
import type { OcrFrame } from "@/lib/ocr-subtitles";
import { assertNoHallucinatedCues } from "@/lib/subtitle-hallucinations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Spoken = "burmese" | "english";
type Caption = SubtitleLanguageCode;
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
  ocrFrames?: unknown;
};

const PRIMARY_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
const RETRY_WAITS = [1500, 3000, 5000, 8000, 12000];
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
  const subtitleLanguage: Caption = parseSubtitleLanguage(body?.subtitleLanguage, (voiceLanguage || "english") as Caption);
  const preset = body?.preset === "father-son" || body?.preset === "hosts" ? body.preset : "";
  const imageCount = typeof body?.imageCount === "number" ? Math.max(0, Math.min(3, Math.floor(body.imageCount))) : 0;
  const videoUrl = typeof body?.videoUrl === "string" && body.videoUrl.startsWith("https://") ? body.videoUrl : "";
  const videoDurationSec = typeof body?.videoDurationSec === "number" && body.videoDurationSec > 0 ? Math.min(3600, body.videoDurationSec) : 0;
  const audioBase64 = typeof body?.audioBase64 === "string" ? body.audioBase64.replace(/\s/g, "") : "";
  const audioMimeType = body?.audioMimeType === "audio/wav" || body?.audioMimeType === "audio/webm" ? body.audioMimeType : "";
  const chunkOffsetSec = typeof body?.chunkOffsetSec === "number" && body.chunkOffsetSec >= 0 ? Math.min(3600, body.chunkOffsetSec) : 0;
  const chunkDurationSec = typeof body?.chunkDurationSec === "number" && body.chunkDurationSec > 0 ? Math.min(480, body.chunkDurationSec) : 0;
  const audioChunk = Boolean(audioBase64 && audioMimeType && chunkDurationSec);
  const ocrFrames = parseOcrFrames(body?.ocrFrames);
  if (audioBase64.length > 6_000_000) {
    return Response.json({ error: "That audio chunk is too large to transcribe." }, { status: 400 });
  }
  if (!(videoUrl || audioChunk) && (news.length < 8 || !voiceLanguage || !preset)) {
    return Response.json({ error: "Add a news topic, a voice language, and a character preset." }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const groqKey = process.env.GROQ_API_KEY?.trim() ?? "";
  if (!geminiKey && !openaiKey && !groqKey) {
    return Response.json({ error: "A language model key is not configured yet." }, { status: 500 });
  }

  const dubbing = Boolean(videoUrl || audioChunk);
  const spoken: Spoken = voiceLanguage === "burmese" ? "burmese" : "english";

  // Video Recap: browser-extracted audio → Whisper and/or Gemini multimodal (no server FFmpeg).
  if (dubbing) {
    const keyStatus = {
      groq: Boolean(groqKey),
      openai: Boolean(openaiKey),
      gemini: Boolean(geminiKey),
    };
    try {
      const result = await hybridTranscribeAndTranslate({
        audioBase64: audioChunk ? audioBase64 : undefined,
        audioMimeType: audioChunk ? audioMimeType : undefined,
        videoUrl: audioChunk ? undefined : videoUrl,
        ocrFrames,
        target: subtitleLanguage,
        groqKey,
        openaiKey,
        geminiKey,
      });
      const shifted = audioChunk
        ? result.lines.map((line) => ({
            ...line,
            startSec: line.startSec + chunkOffsetSec,
            endSec: Math.min(3600, line.endSec + chunkOffsetSec),
          }))
        : result.lines;
      assertNoHallucinatedCues(shifted);
      return Response.json({
        lines: shifted,
        detectedLanguage: result.detectedLanguage,
        detectedLanguageLabel: result.detectedLanguageLabel,
        pipeline: result.pipeline,
        keys: keyStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed.";
      console.error("[news-podcast/script] transcription failed", { message, keys: keyStatus, hasAudio: audioChunk, ocrFrames: ocrFrames.length });
      return Response.json(
        {
          error: message,
          keys: keyStatus,
          detail: {
            hasAudioChunk: audioChunk,
            audioMimeType: audioChunk ? audioMimeType : null,
            ocrFrameCount: ocrFrames.length,
          },
        },
        { status: 502 },
      );
    }
  }

  const presetKey = preset || "hosts";
  const system = `You write an original news commentary. Do not copy dialogue, narration, or captions from the source. Describe what happens in the hosts' own words.
${PRESETS[presetKey]}
"voiceText" is what is spoken. Write it as original commentary in ${spoken === "burmese" ? "natural spoken Burmese (စကားပြောဟန်), not formal written Burmese" : "natural spoken English"}. Do not transcribe the source.
${translationInstruction(subtitleLanguage)}
For every line set "voiceType" to "male", "female", or "child" from who is speaking or narrating that moment. A child character uses "child".
Host A only asks questions. Host B only explains. Alternate speakers, starting with A.
Return 8 to 14 short lines.
Return JSON only, an array of {"speaker":"A"|"B","voiceType":"male"|"female"|"child","voiceText":string,"subtitleText":string,"imageIndex":number}.
imageIndex is an integer from 0 to ${Math.max(imageCount - 1, 0)}. Use 0 when there are no images.`;

  let raw = "";
  try {
    raw = geminiKey ? await geminiChain(geminiKey, system, news, "", null) : await openaiScript(openaiKey, system, news);
  } catch (error) {
    if (error instanceof QuotaError) {
      return Response.json({ error: error.message || "The news script could not be written right now. Please retry." }, { status: 502 });
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

  const lines = parseLines(raw, imageCount, subtitleLanguage, spoken);
  if (!lines) {
    return Response.json({ error: "The model did not return a usable news script. Please retry." }, { status: 502 });
  }
  return Response.json({
    lines,
    pipeline: "podcast",
  });
}

function parseOcrFrames(value: unknown): OcrFrame[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { timeSec?: unknown; imageBase64?: unknown; mime?: unknown };
      const timeSec = typeof record.timeSec === "number" ? Math.max(0, Math.min(3600, record.timeSec)) : -1;
      const imageBase64 = typeof record.imageBase64 === "string" ? record.imageBase64.replace(/\s/g, "") : "";
      const mime = record.mime === "image/png" || record.mime === "image/webp" || record.mime === "image/jpeg" ? record.mime : "image/jpeg";
      if (timeSec < 0 || imageBase64.length < 100 || imageBase64.length > 900_000) return [];
      return [{ timeSec, imageBase64, mime }];
    })
    .slice(0, 36);
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
  const waits = RETRY_WAITS;
  let last = "Gemini is currently experiencing high demand.";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const model = models[attempt % models.length] || PRIMARY_MODELS[0];
    try {
      const text = await geminiScript(apiKey, model, system, news, video);
      cachedGeminiModel = model;
      return text;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      const busy = error instanceof QuotaError || /high demand|overloaded|unavailable|503|429/i.test(last);
      if (!busy || attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt] ?? 12000));
    }
  }
  throw new QuotaError(last);
}

async function tryGeminiModel(apiKey: string, model: string, system: string, news: string, video: { mime: string; inline?: string; uri?: string } | null) {
  let message = "Gemini could not write the script.";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return { ok: true as const, text: await geminiScript(apiKey, model, system, news, video) };
    } catch (error) {
      message = error instanceof Error ? error.message : message;
      const busy = error instanceof QuotaError || /high demand|overloaded|unavailable|503|429/i.test(message);
      if (!busy || attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAITS[attempt] ?? 12000));
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
  if (!news.trim()) throw new Error("Add a news topic so the hosts have something to discuss.");
  parts.push({ text: news });
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
