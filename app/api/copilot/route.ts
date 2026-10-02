import { PROMPT_MAX } from "@/lib/motion-styles";
import { MOVIE_SCENE_COUNT, parseMovieScenes, type MovieScene } from "@/lib/scenes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const SYSTEM = `You are the AI Script & Scene Co-Pilot for a faceless 9:16 short movie studio.

Help the user brainstorm the story, adjust narration, and refine visual prompts. Keep one consistent character and art style across every scene. No on-screen text, no host on camera.

Return only JSON with this shape:
{"reply":"short conversational answer","scenes":[{"title":"","narration":"","visualPrompt":"","referenceNote":""}]}

scenes must contain exactly ${MOVIE_SCENE_COUNT} scenes.
Each narration is 90 to 120 spoken words and continues the story from the previous scene.
Each visualPrompt is 40 to 70 words, vertical 9:16, and repeats the same subject, wardrobe, and lighting.
referenceNote is one line describing the look that must stay identical.
No markdown.`;

function readJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as { reply?: unknown; scenes?: unknown };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "The co-pilot is not configured yet." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    topic?: unknown;
    messages?: unknown;
    scenes?: unknown;
  } | null;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  if (topic.length < 3 || topic.length > PROMPT_MAX) {
    return Response.json({ error: "Add a movie topic before asking the co-pilot." }, { status: 400 });
  }

  const kind = body?.kind === "chat" ? "chat" : "plan";
  const history = Array.isArray(body?.messages)
    ? body.messages
        .slice(-8)
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as { role?: unknown; text?: unknown };
          const role = record.role === "assistant" ? "model" : "user";
          const text = typeof record.text === "string" ? record.text.trim().slice(0, 800) : "";
          if (!text) return null;
          return { role, parts: [{ text }] };
        })
        .filter((item): item is { role: string; parts: { text: string }[] } => Boolean(item))
    : [];

  const currentScenes = parseMovieScenes(body?.scenes);
  const instruction =
    kind === "plan"
      ? `Break this movie topic into ${MOVIE_SCENE_COUNT} scenes.\n\nTopic: ${topic}`
      : `Continue the conversation and revise the scene plan if the user changed the story.\n\nTopic: ${topic}\n\nCurrent scenes:\n${
          currentScenes ? JSON.stringify(currentScenes) : "none yet"
        }`;

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [...history, { role: "user", parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2200,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    return Response.json({ error: "Could not reach Gemini." }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    const message = payload?.error?.message?.slice(0, 240) || "Gemini could not write that plan.";
    console.error("Co-pilot failed", response.status, message);
    return Response.json({ error: message }, { status: 502 });
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const parsed = readJson(text);
  const scenes = parseMovieScenes(parsed?.scenes);
  const reply =
    typeof parsed?.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 800)
      : scenes
        ? "The short is planned in three continuous scenes."
        : "";
  if (!reply || !scenes) {
    return Response.json({ error: "The co-pilot returned an unreadable scene plan." }, { status: 502 });
  }
  return Response.json({ reply, scenes });
}
