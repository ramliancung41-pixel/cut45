export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Line = { speaker: "A" | "B"; text: string; imageIndex: number };

type Body = {
  news?: unknown;
  language?: unknown;
  preset?: unknown;
  imageCount?: unknown;
  videoUrl?: unknown;
};

const GEMINI_MODELS = ["gemini-4-hydrogen", "gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;

class QuotaError extends Error {}
class UnavailableModelError extends Error {}

const PRESETS = {
  "father-son": "Father and son. Host A is the son, curious and asking short questions. Host B is the father, calm and explaining clearly.",
  hosts: "Male and female news hosts. Host A asks short questions. Host B explains the news clearly.",
} as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const news = typeof body?.news === "string" ? body.news.trim().slice(0, 8000) : "";
  const language = body?.language === "burmese" ? "burmese" : body?.language === "english" ? "english" : "";
  const preset = body?.preset === "father-son" || body?.preset === "hosts" ? body.preset : "";
  const imageCount = typeof body?.imageCount === "number" ? Math.max(0, Math.min(3, Math.floor(body.imageCount))) : 0;
  const videoUrl = typeof body?.videoUrl === "string" && body.videoUrl.startsWith("https://") ? body.videoUrl : "";
  if ((news.length < 8 && !videoUrl) || !language || !preset) {
    return Response.json({ error: "Add a news topic or a video, plus a language and a character preset." }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!geminiKey && !openaiKey) {
    return Response.json({ error: "A language model key is not configured yet." }, { status: 500 });
  }
  if (!geminiKey && videoUrl) {
    return Response.json({ error: "Gemini is required to write commentary from a video." }, { status: 500 });
  }

  const longform = Boolean(videoUrl);
  const system = `You write an original news commentary. Do not copy dialogue, narration, or captions from the source. Describe what happens in the hosts' own words.
${PRESETS[preset]}
${
  language === "burmese"
    ? "Write natural spoken Burmese (စကားပြောဟန်) in short subtitle sentences. Do not use formal written Burmese."
    : "Write natural spoken English in short subtitle sentences."
}
Host A only asks questions. Host B only explains. Alternate speakers, starting with A.
${
  longform
    ? "The source may be up to 5 minutes. Return 25 to 35 short lines that follow the events in order."
    : "Return 8 to 14 short lines."
}
Return JSON only, an array of {"speaker":"A"|"B","text":string,"imageIndex":number}.
imageIndex is an integer from 0 to ${Math.max(imageCount - 1, 0)}. Use 0 when there are no images.`;

  let raw = "";
  try {
    raw = geminiKey ? await geminiChain(geminiKey, system, news, videoUrl) : await openaiScript(openaiKey, system, news);
  } catch (error) {
    if (error instanceof QuotaError) return Response.json({ lines: localScript(news, language) });
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

  const lines = parseLines(raw, imageCount);
  if (!lines) return Response.json({ error: "The script came back in an unexpected shape." }, { status: 502 });
  return Response.json({ lines });
}

async function geminiChain(apiKey: string, system: string, news: string, videoUrl: string) {
  let fileUri = "";
  if (videoUrl) fileUri = await uploadVideoToGemini(apiKey, videoUrl);
  let last = "Gemini quota exceeded.";
  for (const model of GEMINI_MODELS) {
    try {
      return await geminiScript(apiKey, model, system, news, fileUri);
    } catch (error) {
      if (error instanceof QuotaError || error instanceof UnavailableModelError) {
        last = error.message;
        continue;
      }
      throw error;
    }
  }
  throw new QuotaError(last);
}

  throw new QuotaError(last);
}

async function uploadVideoToGemini(apiKey: string, videoUrl: string) {
  const source = await fetch(videoUrl);
  if (!source.ok) throw new Error(`The uploaded video could not be read (${source.status}).`);
  const mime = source.headers.get("content-type")?.split(";")[0] || "video/mp4";
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.byteLength < 1000 || bytes.byteLength > 80_000_000) {
    throw new Error("The video must be under 80 MB so it can be analyzed.");
  }
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
    body: bytes,
  });
  const payload = (await uploaded.json().catch(() => null)) as { file?: { uri?: string } } | null;
  const uri = payload?.file?.uri ?? "";
  if (!uploaded.ok || !uri.startsWith("https://")) throw new Error("Gemini did not return a video file.");
  return uri;
}

async function geminiScript(apiKey: string, model: string, system: string, news: string, fileUri: string) {
  const parts: Array<{ text?: string; file_data?: { mime_type: string; file_uri: string } }> = [];
  if (fileUri) parts.push({ file_data: { mime_type: "video/mp4", file_uri: fileUri } });
  parts.push({ text: news || "Watch the video and write original host commentary about what happens. Do not transcribe it word for word." });
  const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  const response = await fetch(endpoint, {
    method: "POST",
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
    if (response.status === 429 || payload?.error?.status === "RESOURCE_EXHAUSTED" || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
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

function localScript(news: string, language: "burmese" | "english"): Line[] {
  const parts = news
    .split(language === "burmese" ? /[။!?\n]+/ : /[\n.!?]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 12)
    .slice(0, 3);
  const facts = parts.length > 0 ? parts : [news.replace(/\s+/g, " ").trim().slice(0, 220)];
  const questions =
    language === "burmese"
      ? ["ဒီသတင်းက ဘာဖြစ်တာလဲ။", "အဓိကအချက်က ဘာလဲ။", "နောက်ဆက်တွဲ ဘာသိထားသင့်လဲ။"]
      : ["What happened in this story?", "What is the main point?", "What should people know next?"];
  const lines: Line[] = [];
  facts.forEach((fact, index) => {
    lines.push({ speaker: "A", text: questions[index] ?? questions[0], imageIndex: 0 });
    lines.push({ speaker: "B", text: fact.slice(0, 240), imageIndex: 0 });
  });
  return lines.slice(0, 6);
}

function parseLines(raw: string, imageCount: number): Line[] | null {
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
    const record = item as { speaker?: unknown; text?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 400) : "";
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(maxIndex, Math.floor(record.imageIndex)) : 0;
    return speaker && text ? [{ speaker, text, imageIndex }] : [];
  });
  return lines.length >= 4 ? lines : null;
}
