import { agentModelGuide, parseAgentSuggestion } from "@/lib/agent-suggestion";
import { logApiKey } from "@/lib/api-keys";
import { PROMPT_MAX } from "@/lib/motion-styles";
import { CLIP_DURATION_SEC, MAX_MOVIE_SCENES, MOVIE_SCENE_COUNT, parseMovieScenes } from "@/lib/scenes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
};

const AGENT_IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i;
const AGENT_IMAGE_MAX_BASE64 = 6_000_000;

function agentSystemPrompt(brand: string) {
  const brandNote = brand
    ? `\nThe user's Brand Kit: ${brand}\nKeep suggestions and generation prompts on-brand with these colors, style, and tone unless the user asks otherwise.`
    : "";
  return `You are Cut45 Co-Pilot, a friendly creative assistant inside an AI image and video studio. Answer any question, chat freely, brainstorm, enhance prompts, write short video concepts, recommend generation workflows, and analyze images the user attaches. Reply in the same language the user writes in.

Return only JSON in this shape:
{"reply":"","suggestion":null}
or
{"reply":"","suggestion":{"kind":"video","title":"","prompt":"","model":"","aspect":"","durationSec":5}}

reply is helpful plain text. Use short paragraphs and "- " for list items. No markdown headings, bold, tables, or code fences.
Add a suggestion only when the user asks to create, generate, render, or animate something, or when you hand them one concrete prompt they could generate right now. Otherwise suggestion is null.
suggestion.kind is "video" or "image". suggestion.title is 2 to 5 words. suggestion.prompt is one clean English generation prompt of 20 to 80 words covering subject, setting, lighting, camera, and style, with no conversation.
${agentModelGuide()}
Prefer the low-cost models (ltx for video, nano for image) unless the user asks for premium quality or a specific model.
When an image is attached, describe what you see first, then suggest prompts or a workflow that builds on it.
Escape quotes and line breaks inside JSON strings.${brandNote}`;
}

async function agentChat(
  body: { prompt?: unknown; image?: unknown; messages?: unknown; brand?: unknown },
  apiKey: string,
  signal: AbortSignal,
) {
  const prompt = typeof body.prompt === "string" ? cleanText(body.prompt, 4000) : "";
  const rawImage = typeof body.image === "string" ? body.image.trim() : "";
  const image = rawImage ? AGENT_IMAGE.exec(rawImage) : null;
  if (rawImage && !image) {
    return Response.json({ error: "Attach a JPEG, PNG, or WebP image." }, { status: 400 });
  }
  if (image && image[2].length > AGENT_IMAGE_MAX_BASE64) {
    return Response.json({ error: "Attach an image under 4 MB." }, { status: 413 });
  }
  if (!prompt && !image) {
    return Response.json({ error: "Type a message first." }, { status: 400 });
  }

  const history = Array.isArray(body.messages)
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

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
  if (image) parts.push({ inline_data: { mime_type: image[1].toLowerCase(), data: image[2] } });
  parts.push({
    text: prompt || "Analyze this image and suggest how to turn it into a strong image or short video.",
  });

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: agentSystemPrompt(typeof body.brand === "string" ? cleanText(body.brand, 600) : "") }],
        },
        contents: [...history, { role: "user", parts }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024, includeThoughts: true },
        },
      }),
    });
  } catch {
    return Response.json({ error: "Could not reach Gemini." }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    console.error("Agent co-pilot failed", response.status, payload?.error?.message ?? "");
    return Response.json({ error: "Gemini could not answer that message." }, { status: 502 });
  }

  const answerParts = payload?.candidates?.[0]?.content?.parts ?? [];
  const reasoning = cleanText(
    answerParts
      .filter((part) => part.thought)
      .map((part) => part.text ?? "")
      .join("\n")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .trim(),
    2400,
  );
  const answer = answerParts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
  const parsed = readJson(answer) as { reply?: unknown; suggestion?: unknown } | null;
  const plain = answer.replace(/```[\s\S]*?```/g, "").trim();
  const reply =
    typeof parsed?.reply === "string" && parsed.reply.trim()
      ? cleanText(parsed.reply, 4000)
      : plain && !plain.startsWith("{")
        ? cleanText(plain, 4000)
        : "";

  return Response.json({
    reply: reply || "I could not put that into words. Try asking again.",
    reasoning,
    suggestion: parseAgentSuggestion(parsed?.suggestion, PROMPT_MAX),
  });
}

const CHARACTER_LOOK =
  "2D Animated Cartoon Style, stick-figure inspired character sheets, Ancient Greek/Historical costume detailing, multiple facial expression turnarounds, clean line art with flat color fill.";

function withCharacterLook(prompt: string, max: number) {
  const trimmed = prompt.trim();
  if (!trimmed) return "";
  if (trimmed.includes(CHARACTER_LOOK)) return Array.from(trimmed).slice(0, max).join("");
  const room = Math.max(0, max - CHARACTER_LOOK.length - 1);
  const base = Array.from(trimmed).slice(0, room).join("").trim();
  return `${base} ${CHARACTER_LOOK}`.trim();
}

function isVagueMessage(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || Array.from(clean).length <= 2) return true;
  return /^(hi|hello|hey|yo|sup|hiya|hola|good morning|good afternoon|good evening|thanks|thank you|ok|okay|start|help|test|what'?s up)[.!?]*$/i.test(
    clean,
  );
}

function systemPrompt(sceneCount: number, kind: "chat" | "plan", askQuestions: boolean) {
  const seconds = sceneCount * CLIP_DURATION_SEC;
  const format = `You are an expert AI Video Co-Pilot for character sheets and interactive storyboards. Reply to the user in the exact same language they write to you (e.g., English, Hakha Chin, Burmese, Spanish, etc.).

Return only JSON with this shape:
{"reply":"short conversational answer","characterSheetPrompt":"","scenes":[{"title":"","narration":"","visualPrompt":"","motionPrompt":"","referenceNote":""}]}

characterSheetPrompt is one clean visual English prompt for Fal.ai / FLUX. It is rendered automatically as the character reference sheet image, so it must describe the character, turnarounds, and costume with no conversation.
Each scene has three parts:
narration is direct character dialogue, not third-person voiceover. Use the same two named characters in every scene. Each turn is one line in the form Name: "spoken line". Character A speaks first, then character B. No stage directions.
visualPrompt is the Image/Character Generation Prompt optimized for Fal.ai / FLUX: 25 to 45 words, vertical 9:16, medium close-up, faces and mouths visible, the same characters, costume, and lighting in every scene.
motionPrompt shows those characters speaking to camera, mouths visible, with camera and action only and no new character design.
referenceNote is one line in the user's language describing the look that must stay identical.
Every characterSheetPrompt and every visualPrompt must end with this exact line:
"${CHARACTER_LOOK}"
Keep every Unicode character intact. Escape quotes and line breaks inside JSON strings. No markdown.`;

  if (kind === "plan") {
    return `${format}

The topic and duration are already chosen, so skip the intake questions and return the full storyboard now.
scenes must contain exactly ${sceneCount} scenes.
Each scene is one ${CLIP_DURATION_SEC}-second shot. Together they last ${seconds} seconds.
narration is about 12 to 20 spoken words of dialogue and continues the same conversation from the previous scene.
Scene 1 starts the shot. Every later scene continues from the last frame of the scene before it.`;
  }

  if (!askQuestions) {
    return `${format}

Direct execution. The user already gave a topic, character, scene, script, or style. Do not ask whether they have a script, whether you should generate one, what the topic is, or whether it is a Short Reel or Long Video.
Immediately return the complete storyboard: reply, characterSheetPrompt, and scenes.
If they already have a script, adapt that script. Otherwise write one from their details.
A short idea becomes a Short Reel of about 200 spoken words of character dialogue. If they ask for a long video, write a 6 to 10 minute dialogue.
Use up to ${sceneCount} scenes when a count was requested, otherwise use as many scenes as the idea needs, up to ${MAX_MOVIE_SCENES}.
Scene 1 starts the shot. Every later scene continues from the last frame of the scene before it.`;
  }

  return `${format}

The latest message is only a greeting or is too vague to storyboard. Ask, in their language, what the video is about. Do not ask "Do you have a custom scene idea or script already?" Set characterSheetPrompt to "" and scenes to [].
Once any message includes a character, scene, topic, script, or style, stop asking and return the full storyboard.`;
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
    return JSON.parse(slice) as { reply?: unknown; scenes?: unknown; characterSheetPrompt?: unknown };
  } catch {
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")) as {
        reply?: unknown;
        scenes?: unknown;
        characterSheetPrompt?: unknown;
      };
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  if (!logApiKey("GEMINI_API_KEY")) {
    return Response.json({ error: "The co-pilot is not configured yet." }, { status: 503 });
  }
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
    image?: unknown;
    brand?: unknown;
  } | null;
  if (body?.kind === "agent") {
    return agentChat(body, apiKey, request.signal);
  }
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
  const userTexts = [
    prompt,
    topic,
    ...history.filter((item) => item.role === "user").map((item) => item.parts[0]?.text ?? ""),
  ];
  const askQuestions = kind === "chat" && userTexts.every((text) => isVagueMessage(text));
  const instruction =
    kind === "plan"
      ? `Break this movie topic into exactly ${sceneCount} scenes of ${CLIP_DURATION_SEC} seconds each, ${sceneCount * CLIP_DURATION_SEC} seconds total. No reference image or existing script is required. Write the reply, titles, and reference notes in the same language as the topic. Each narration field is dialogue lines in the form Name: "spoken line".\n\nTopic: ${subject}`
      : askQuestions
        ? `The user has not described a video yet. Ask what it is about. Do not generate scenes.\n\nLatest message: ${prompt || subject}`
        : `The user already gave enough detail. Do not ask clarification questions. Generate the character dialogue, character reference sheet, Fal.ai / FLUX image prompts, and motion prompts now. Each narration field is dialogue lines in the form Name: "spoken line".\n\nTopic: ${subject || "Use the latest message"}\n\nLatest message: ${prompt || subject}\n\nCurrent scenes:\n${
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
        system_instruction: { parts: [{ text: systemPrompt(sceneCount, kind, askQuestions) }] },
        contents: [...history, { role: "user", parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: kind === "chat" || sceneCount > 6 ? 8192 : sceneCount > 3 ? 4096 : 2200,
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
  const sceneLimit = kind === "plan" ? sceneCount : MAX_MOVIE_SCENES;
  const scenes = (parseMovieScenes(parsed?.scenes, sceneLimit) ?? currentScenes ?? []).map((scene) => ({
    title: cleanText(scene.title, 80),
    narration: cleanText(scene.narration, 1200),
    visualPrompt: withCharacterLook(scene.visualPrompt, 1200),
    motionPrompt: cleanText(scene.motionPrompt ?? "", 500),
    referenceNote: cleanText(scene.referenceNote, 240),
  }));
  const characterSheetPrompt = withCharacterLook(
    typeof parsed?.characterSheetPrompt === "string" ? parsed.characterSheetPrompt : "",
    1200,
  );
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
    reply:
      reply ||
      (askQuestions
        ? "What is the video about?"
        : scenes.length > 0
          ? `The short is planned as ${scenes.length} continuous ${CLIP_DURATION_SEC}-second scenes.`
          : "Send the character, scene, or style once more and I will write the storyboard."),
    characterSheetPrompt,
    scenes,
  });
}
