export const dynamic = "force-dynamic";

type Line = { speaker: "A" | "B"; text: string; imageIndex: number };

type Body = {
  news?: unknown;
  language?: unknown;
  preset?: unknown;
  imageCount?: unknown;
};

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
  if (news.length < 8 || !language || !preset) {
    return Response.json({ error: "Add a news topic, a language, and a character preset." }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!geminiKey && !openaiKey) {
    return Response.json({ error: "A language model key is not configured yet." }, { status: 500 });
  }

  const system = `You write a 45 to 60 second news conversation.
${PRESETS[preset]}
${
  language === "burmese"
    ? "Write natural spoken Burmese (စကားပြောဟန်) in short sentences that can be shown as subtitles. Do not use formal written Burmese."
    : "Write natural spoken English in short sentences that can be shown as subtitles."
}
Host A only asks questions. Host B only explains. Alternate speakers, starting with A.
Cover only the news the user provided. Do not add unrelated facts.
Return JSON only, an array of 8 to 14 lines: {"speaker":"A"|"B","text":string,"imageIndex":number}.
imageIndex is an integer from 0 to ${Math.max(imageCount - 1, 0)}. Use 0 when there are no images.`;

  let raw = "";
  try {
    raw = geminiKey ? await geminiScript(geminiKey, system, news) : await openaiScript(openaiKey, system, news);
  } catch {
    return Response.json({ error: "The script could not be written." }, { status: 502 });
  }

  const lines = parseLines(raw, imageCount);
  if (!lines) return Response.json({ error: "The script came back in an unexpected shape." }, { status: 502 });
  return Response.json({ lines });
}

async function geminiScript(apiKey: string, system: string, news: string) {
  const endpoint = new URL("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: news }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;
  if (!response.ok) throw new Error("gemini");
  return (payload?.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
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
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  if (!response.ok) throw new Error("openai");
  return payload?.choices?.[0]?.message?.content ?? "";
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
  const lines = list.slice(0, 14).flatMap((item): Line[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as { speaker?: unknown; text?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 400) : "";
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(maxIndex, Math.floor(record.imageIndex)) : 0;
    return speaker && text ? [{ speaker, text, imageIndex }] : [];
  });
  return lines.length >= 4 ? lines : null;
}
