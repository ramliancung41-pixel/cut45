import { PROMPT_MAX } from "@/lib/motion-styles";
import { CLIP_DURATION_SEC, MOVIE_SCENE_COUNT, parseMovieScenes } from "@/lib/scenes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function systemPrompt(sceneCount: number) {
  const seconds = sceneCount * CLIP_DURATION_SEC;
  return `You are an expert AI Video Co-Pilot. Reply to the user in the exact same language they write to you (e.g., English, Hakha Chin, Burmese, Spanish, etc.). Automatically translate their video concepts into structured video scenes, voiceover scripts, and optimized Fal.ai generation prompts.

This studio makes faceless 9:16 shorts. No on-screen text and no host on camera. Keep one consistent subject and look across every scene.

Return only JSON with this shape:
{"reply":"short conversational answer","scenes":[{"title":"","narration":"","visualPrompt":"","referenceNote":""}]}

scenes must contain exactly ${sceneCount} scenes.
Each scene is one ${CLIP_DURATION_SEC}-second shot. Together they last ${seconds} seconds.
reply, title, and narration stay in the user's language. narration is the voiceover for that ${CLIP_DURATION_SEC}-second shot, about 12 to 20 spoken words, and continues from the previous scene.
visualPrompt is the Fal.ai prompt: 25 to 45 words, vertical 9:16, same subject, wardrobe, and lighting in every scene. Scene 1 starts the shot. Every later scene continues from the last frame of the scene before it.
referenceNote is one line in the user's language describing the look that must stay identical.
Keep every Unicode character intact. Escape quotes and line breaks inside JSON strings. No markdown.`;
}

function readSceneCount(value: unknown) {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  const match = ([1, 3, 6, 12] as const).find((item) => item === count);
  return match ?? null;
}

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
    return JSON.parse(slice) as { reply?: unknown; scenes?: unknown };
  } catch {
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")) as { reply?: unknown; scenes?: unknown };
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "The co-pilot is not configured yet." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    topic?: unknown;
    prompt?: unknown;
    messages?: unknown;
    scenes?: unknown;
    sceneCount?: unknown;
  } | null;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const kind = body?.kind === "chat" ? "chat" : "plan";
  const subject = (topic.length >= 3 ? topic : prompt).slice(0, PROMPT_MAX);
  if (kind === "chat" && prompt.length < 1 && subject.length < 1) {
    return Response.json({ error: "Type a message first." }, { status: 400 });
  }
  if (kind === "plan" && subject.length < 3) {
    return Response.json({ error: "Tell the co-pilot what the short is about." }, { status: 400 });
  }
  const history = Array.isArray(body?.messages)
    ? body.messages
        .slice(-8)
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as { role?: unknown; text?: unknown };
          const role = record.role === "assistant" ? "model" : "user";
          const text = typeof record.text === "string" ? cleanText(record.text, 800) : "";
          if (!text) return null;
          return { role, parts: [{ text }] };
        })
        .filter((item): item is { role: string; parts: { text: string }[] } => Boolean(item))
    : [];

  const requestedCount = readSceneCount(body?.sceneCount);
  if (kind === "plan" && body?.sceneCount != null && requestedCount == null) {
    return Response.json({ error: "Choose a 5, 15, 30, or 60 second duration." }, { status: 400 });
  }
  const sceneCount = requestedCount ?? MOVIE_SCENE_COUNT;
  const currentScenes = parseMovieScenes(body?.scenes, sceneCount);
  const instruction =
    kind === "plan"
      ? `Break this movie topic into exactly ${sceneCount} scenes of ${CLIP_DURATION_SEC} seconds each, ${sceneCount * CLIP_DURATION_SEC} seconds total. No reference image or existing script is required. Write the reply, titles, narration, and reference notes in the same language as the topic.\n\nTopic: ${subject}`
      : `Answer the user's latest message in the same language they used. A reference image and an existing script are optional. Revise the scene plan when you can. If the idea is still thin, ask the next question in their language and keep any scenes you already have.\n\nTopic: ${subject || "Not chosen yet"}\n\nLatest message: ${prompt || subject}\n\nCurrent scenes:\n${
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
        system_instruction: { parts: [{ text: systemPrompt(sceneCount) }] },
        contents: [...history, { role: "user", parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: sceneCount > 6 ? 8192 : sceneCount > 3 ? 4096 : 2200,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    return Response.json({ error: "Could not reach Gemini." }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    console.error("Co-pilot failed", response.status);
    return Response.json({ error: "Gemini could not answer that message." }, { status: 502 });
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const parsed = readJson(text);
  const scenes = (parseMovieScenes(parsed?.scenes, sceneCount) ?? currentScenes ?? []).map((scene) => ({
    title: cleanText(scene.title, 80),
    narration: cleanText(scene.narration, 1200),
    visualPrompt: cleanText(scene.visualPrompt, 800),
    referenceNote: cleanText(scene.referenceNote, 240),
  }));
  const plain = text.replace(/```[\s\S]*?```/g, "").trim();
  const reply =
    typeof parsed?.reply === "string" && parsed.reply.trim()
      ? cleanText(parsed.reply, 800)
      : scenes.length > 0
        ? `The short is planned as ${scenes.length} continuous ${CLIP_DURATION_SEC}-second scenes.`
        : plain && !plain.startsWith("{")
          ? cleanText(plain, 800)
          : "";
  if (kind === "plan" && scenes.length !== sceneCount) {
    return Response.json({ error: "The co-pilot could not plan those scenes." }, { status: 502 });
  }
  return Response.json({
    reply: reply || "Tell me the idea and I will shape the short. No image or script is required yet.",
    scenes,
  });
}
