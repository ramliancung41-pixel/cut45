import { PROMPT_MAX } from "@/lib/motion-styles";

export const dynamic = "force-dynamic";

const ENHANCE_PROMPT = `You rewrite a short video idea into one cinematic image-to-video prompt for Fal.ai.

Return only the prompt. Aim for 70 to 110 words. Describe the subject, setting, light, lens, and how the camera and subject move. The frame is vertical 9:16. Keep the original subject. Do not invent a different story.

No title, labels, hashtags, quotation marks, or markdown.`;

type GeminiResponse = {
  error?: { message?: string; status?: string };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Prompt enhancement is not configured yet." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) {
    return Response.json({ error: "Write a short idea before enhancing it." }, { status: 400 });
  }
  if (prompt.length > PROMPT_MAX) {
    return Response.json({ error: `Keep the prompt under ${PROMPT_MAX} characters.` }, { status: 400 });
  }

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: ENHANCE_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    return Response.json({ error: "Could not reach Gemini to enhance the prompt." }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    const message = payload?.error?.message ?? "";
    if (response.status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
      return Response.json(
        { error: "Gemini is rate limited right now. You can still edit the prompt by hand." },
        { status: 429 },
      );
    }
    return Response.json({ error: "Gemini could not enhance that prompt." }, { status: 502 });
  }

  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROMPT_MAX);

  if (text.length < 3) {
    return Response.json({ error: "Gemini returned an empty enhancement." }, { status: 502 });
  }

  return Response.json({ prompt: text });
}
