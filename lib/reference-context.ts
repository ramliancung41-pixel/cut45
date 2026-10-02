import type { ReferenceImage } from "@/lib/fal-video";

const FALLBACK_LOCK =
  "Keep the uploaded still as the only subject. Preserve the face, clothing, colors, and art style.";

const SCAN_MS = 12000;

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function cleanLock(raw: string) {
  return raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim().slice(0, 500);
}

export async function alignReferenceContext(input: {
  topic: string;
  image: ReferenceImage;
  signal: AbortSignal;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return FALLBACK_LOCK;

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), SCAN_MS);
  const onAbort = () => deadline.abort();
  input.signal.addEventListener("abort", onAbort);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: deadline.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Look at this reference image and the video idea. Write one compact visual lock for an image-to-video model.

Cover only what is visible: subject, character features, clothing, colors, and art style. Keep the original subject. Do not invent a different person, story, or setting.

Return 35 to 70 words. No title, labels, or markdown.

Video idea: ${input.topic}`,
              },
              {
                inlineData: {
                  mimeType: input.image.contentType,
                  data: input.image.bytes.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 220,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) {
      console.error("Reference scan failed", response.status);
      return FALLBACK_LOCK;
    }
    const lock = cleanLock(
      payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ") ?? "",
    );
    return lock || FALLBACK_LOCK;
  } catch (error) {
    if (input.signal.aborted && isAbortError(error)) throw error;
    const message = error instanceof Error ? error.message : "Reference scan failed.";
    console.error("Reference scan failed", message);
    return FALLBACK_LOCK;
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", onAbort);
  }
}
