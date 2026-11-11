import { logApiKey } from "@/lib/api-keys";
import { builderAssistantFallback, builderAssistantPrompt } from "@/lib/builder-assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
};

const AGENT_IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i;
const AGENT_IMAGE_MAX_BASE64 = 6_000_000;

function cleanText(value: string, max: number) {
  const safe = value
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  return Array.from(safe).slice(0, max).join("").trim();
}

function readJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).replace(/^\uFEFF/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice) as { reply?: unknown };
  } catch {
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")) as { reply?: unknown };
    } catch {
      return null;
    }
  }
}

function replyFor(message: string, modelText = "") {
  const parsed = readJson(modelText);
  const fromJson = typeof parsed?.reply === "string" ? cleanText(parsed.reply, 4000) : "";
  if (fromJson) return fromJson;
  const plain = modelText.replace(/```[\s\S]*?```/g, "").trim();
  if (plain && !plain.startsWith("{") && !plain.startsWith("[")) return cleanText(plain, 4000);
  return builderAssistantFallback(message);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
    topic?: unknown;
    messages?: unknown;
    image?: unknown;
  } | null;
  const prompt = cleanText(
    typeof body?.prompt === "string" ? body.prompt : typeof body?.topic === "string" ? body.topic : "",
    4000,
  );
  if (!prompt) {
    return Response.json({ reply: builderAssistantFallback("") });
  }

  const rawImage = typeof body?.image === "string" ? body.image.trim() : "";
  const image = rawImage && AGENT_IMAGE.test(rawImage) ? AGENT_IMAGE.exec(rawImage) : null;
  if (image && image[2].length > AGENT_IMAGE_MAX_BASE64) {
    return Response.json({
      reply: "That image is too large to read. Ask the question in text, or attach a JPEG, PNG, or WebP under 4 MB.",
    });
  }

  const history = Array.isArray(body?.messages)
    ? body.messages
        .slice(-12)
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as { role?: unknown; text?: unknown };
          const text = typeof record.text === "string" ? cleanText(record.text, 1500) : "";
          if (!text) return null;
          return { role: record.role === "assistant" ? "model" : "user", parts: [{ text }] };
        })
        .filter((item): item is { role: string; parts: { text: string }[] } => Boolean(item))
    : [];

  const apiKey = logApiKey("GEMINI_API_KEY") ? process.env.GEMINI_API_KEY : "";
  if (!apiKey) {
    return Response.json({ reply: builderAssistantFallback(prompt) });
  }

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
  if (image) parts.push({ inline_data: { mime_type: image[1].toLowerCase(), data: image[2] } });
  parts.push({ text: prompt });

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: builderAssistantPrompt() }] },
        contents: [...history, { role: "user", parts }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) {
      console.error("Builder co-pilot failed", response.status, payload?.error?.message ?? "");
      return Response.json({ reply: builderAssistantFallback(prompt) });
    }
    const answer = (payload?.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    return Response.json({ reply: replyFor(prompt, answer) });
  } catch {
    return Response.json({ reply: builderAssistantFallback(prompt) });
  }
}
