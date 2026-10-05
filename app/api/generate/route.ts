import { NextResponse, type NextRequest } from "next/server";
import {
  FRAME_COUNT,
  FRAME_LENGTH_SEC,
  GENERATE_STEPS,
  VIDEO_DURATION_SEC,
  buildStoryboard,
  countWords,
  previewScript,
  type GenerateEvent,
} from "@/lib/generate";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { EXTEND_VIDEO_COST, generationCreditCost, generationHoldCost } from "@/lib/credits";
import { refundProfileCredits, reserveGenerationCredits } from "@/lib/profiles";
import { userFromAccessToken } from "@/lib/supabase/server";
import { CLIP_DURATION_SEC } from "@/lib/scenes";
import { falApiKey } from "@/lib/fal-key";
import {
  extractLastFrame,
  falMediaUrl,
  mergeFalVideos,
  parseReferenceImage,
  renderFalClip,
  type ReferenceImage,
} from "@/lib/fal-video";
import { imageLockedMotionPrompt, isMotionStyleId, PROMPT_MAX, videoMotionPrompt } from "@/lib/motion-styles";
import { alignReferenceContext } from "@/lib/reference-context";
import { getVoice, isVoiceId } from "@/lib/voices";
import { isVisualEngineId, type VisualEngineId } from "@/lib/visual-engines";

const USE_PAID_VOICE = false;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FRAME_STEP_MS = 700;
const AUDIO_STEP_MS = 600;
const SCRIPT_CHAR_CAP = 1600;

const SHORT_SCRIPT_PROMPT = `You write a 5-second faceless vertical video narration. Return only the spoken line.

Pace: 12 to 20 words. One concrete hook about the topic. No title, labels, stage directions, hashtags, emojis, or markdown.`;

const SCRIPT_SYSTEM_PROMPT = `You write rapid-fire, highly engaging 45-second TikTok scripts for faceless videos. Analyze the topic, then return only the spoken script.

Pace: about 110 to 130 words, said out loud in 45 seconds. Short sentences. No pauses for a host on camera.

Open on a specific hook about this topic. Then hit one concrete fact, the mistake people make, and one action they can take today. End on a line that pays off the hook.

Do not open with "Hey guys", "Stop scrolling", or "In this video". No title, labels, stage directions, shot list, hashtags, emojis, or markdown. Output only the narration.`;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

function isQuotaSignal(status: number, apiStatus: string, message: string) {
  return (
    status === 429 ||
    apiStatus === "RESOURCE_EXHAUSTED" ||
    /quota|rate.?limit|resource.?exhausted|too many requests|exceeded your/i.test(
      `${apiStatus} ${message}`,
    )
  );
}

function encode(event: GenerateEvent) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function iteratorToStream(
  iterator: AsyncIterator<Uint8Array>,
  hold: { userId: string; cost: number } | null,
) {
  let settled = false;
  const release = async () => {
    if (!hold || settled) return;
    settled = true;
    await refundProfileCredits(hold.userId, hold.cost);
  };
  const keep = () => {
    settled = true;
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          await release();
          controller.close();
          return;
        }
        if (value) {
          const text = new TextDecoder().decode(value);
          if (text.includes('"type":"error"')) await release();
          else if (text.includes('"type":"complete"')) {
            if (text.includes('"preview":true') || text.includes('"creditsCharged":0')) await release();
            else keep();
          }
          controller.enqueue(value);
        }
      } catch (error) {
        await release();
        if (isAbortError(error)) {
          controller.close();
          return;
        }
        controller.error(error);
      }
    },
    cancel() {
      release();
      void iterator.return?.();
    },
  });
}

function cleanScript(raw: string) {
  const text = raw
    .replace(/\r/g, "")
    .replace(/^(script|narration)\s*:\s*/i, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (text.length <= SCRIPT_CHAR_CAP) return text;

  const slice = text.slice(0, SCRIPT_CHAR_CAP);
  const end = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  return (end > 200 ? slice.slice(0, end + 1) : slice).trim();
}

type GeminiResponse = {
  error?: { message?: string; status?: string };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

async function writeScript(topic: string, signal: AbortSignal, clipSec = VIDEO_DURATION_SEC) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the server environment.");
  }

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
          parts: [{ text: clipSec === CLIP_DURATION_SEC ? SHORT_SCRIPT_PROMPT : SCRIPT_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  clipSec === CLIP_DURATION_SEC
                    ? `Write the 5-second narration.\n\nTopic: ${topic}`
                    : `Analyze this topic and write the 45-second TikTok script.\n\nTopic: ${topic}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 800,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Could not reach Gemini.");
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    const status = payload?.error?.status ?? "";
    const message = payload?.error?.message ?? "";
    if (
      response.status === 401 ||
      response.status === 403 ||
      (response.status === 400 && /api key/i.test(message))
    ) {
      throw new Error("Gemini rejected the API key.");
    }
    if (isQuotaSignal(response.status, status, message)) {
      throw new QuotaError(
        "Gemini's free tier is rate limited. A local preview script is ready so you can still play this cut.",
      );
    }
    throw new Error(`Gemini could not write the script (${response.status}).`);
  }

  const script = cleanScript(
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "",
  );
  if (!script) {
    throw new Error("Gemini returned an empty script.");
  }
  return script;
}

async function writeContinuation(topic: string, priorScript: string, signal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the server environment.");
  }

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);
  const prior = priorScript.trim().slice(-4000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: "You continue a 45-second faceless TikTok narration. Return only the next spoken section. About 110 to 130 words. Continue from the last line. Do not repeat earlier lines. No title, labels, stage directions, hashtags, or markdown.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Topic: ${topic}\n\nThe video already said:\n${prior}\n\nWrite the next 45 seconds.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 800,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Could not reach Gemini.");
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    const message = payload?.error?.message ?? "";
    throw new Error(
      message ? `Gemini could not continue the script. ${message}`.slice(0, 300) : "Gemini could not continue the script.",
    );
  }
  const script = cleanScript(
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "",
  );
  if (!script) throw new Error("Gemini returned an empty continuation.");
  return script;
}

async function synthesizeSpeech(script: string, voiceId: string, signal: AbortSignal) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing from the server environment.");
  }

  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      signal,
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: "eleven_multilingual_v2",
      }),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Could not reach ElevenLabs.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (isQuotaSignal(response.status, "", detail) || response.status === 402) {
      throw new QuotaError(
        "ElevenLabs hit its free-tier limit. Narration uses the browser voice so the preview can still play.",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("ElevenLabs rejected the API key.");
    }
    throw new Error(`ElevenLabs could not render the voice (${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("ElevenLabs returned an empty voice track.");
  }
  return `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function* runWorkflow(
  topic: string,
  voiceId: string,
  voiceName: string,
  elevenLabsVoiceId: string,
  engine: VisualEngineId,
  referenceImage: ReferenceImage | null,
  motionStyle: string | null,
  signal: AbortSignal,
  clipSec = VIDEO_DURATION_SEC,
) {
  const lockPromise =
    referenceImage && engine !== "stock"
      ? alignReferenceContext({ topic, image: referenceImage, signal })
      : Promise.resolve("");
  void lockPromise.catch(() => undefined);

  yield encode({
    type: "progress",
    step: "script",
    status: "started",
    message: GENERATE_STEPS[0].label,
  });

  let script: string;
  let preview = false;
  try {
    script = await writeScript(topic, signal, clipSec);
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof QuotaError) {
      script = previewScript(topic);
      preview = true;
      yield encode({ type: "notice", message: error.message });
    } else {
      yield encode({
        type: "error",
        message: error instanceof Error ? error.message : "Could not write the script.",
      });
      return;
    }
  }

  const wordCount = countWords(script);
  yield encode({
    type: "progress",
    step: "script",
    status: "completed",
    message: preview ? "Preview script ready" : "Script ready",
    detail: preview
      ? "Local preview while the Gemini free tier is limited"
      : `${wordCount} words, paced for a ${clipSec}-second narration`,
  });

  yield encode({
    type: "progress",
    step: "audio",
    status: "started",
    message: GENERATE_STEPS[1].label,
  });

  let audioLabel: string;
  let audioSrc: string | undefined;
  try {
    if (USE_PAID_VOICE) {
      try {
        audioSrc = await synthesizeSpeech(script, elevenLabsVoiceId, signal);
        audioLabel = `${voiceName} · ElevenLabs`;
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (!(error instanceof QuotaError)) throw error;
        preview = true;
        await sleep(AUDIO_STEP_MS, signal);
        audioLabel = `${voiceName} · browser voice · free-tier preview`;
        yield encode({ type: "notice", message: error.message });
      }
    } else {
      await sleep(AUDIO_STEP_MS, signal);
      audioLabel = `${voiceName} · browser voice · no speaker on screen`;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    yield encode({
      type: "error",
      message: error instanceof Error ? error.message : "Could not render the voice.",
    });
    return;
  }

  yield encode({
    type: "progress",
    step: "audio",
    status: "completed",
    message: "Audio ready",
    detail: audioLabel,
  });

  yield encode({
    type: "progress",
    step: "frames",
    status: "started",
    message: GENERATE_STEPS[2].label,
  });

  let frames = buildStoryboard(script);
  let creditsCharged = 0;
  let frameDetail = `${FRAME_COUNT} Wikimedia stock clips · 9:16 · ${FRAME_LENGTH_SEC} seconds each`;

  if (engine === "stock") {
    await sleep(FRAME_STEP_MS, signal);
  } else {
    try {
      const lock = await lockPromise;
      const rendered = await renderFalClip({
        engine,
        prompt: referenceImage
          ? imageLockedMotionPrompt(topic, motionStyle, lock)
          : videoMotionPrompt(topic, motionStyle),
        image: referenceImage,
        signal,
      });
      if ("videoUrl" in rendered) {
        frames = frames.map((frame) => ({ ...frame, src: rendered.videoUrl }));
        creditsCharged = generationCreditCost(engine, Boolean(referenceImage));
        frameDetail = referenceImage
          ? "Image-to-video clip from Fal.ai · 9:16"
          : "Fal.ai motion clip · 9:16";
      } else if (falApiKey()) {
        yield encode({ type: "error", message: rendered.error });
        return;
      } else {
        preview = true;
        await sleep(FRAME_STEP_MS, signal);
        frameDetail = `${FRAME_COUNT} stock preview clips · 9:16`;
        yield encode({
          type: "notice",
          message: "Fal.ai is not configured yet. A stock preview is ready instead.",
        });
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (falApiKey()) {
        yield encode({
          type: "error",
          message: "Fal.ai could not be reached.",
        });
        return;
      }
      preview = true;
      frameDetail = `${FRAME_COUNT} stock preview clips · 9:16`;
      yield encode({
        type: "notice",
        message: "Fal.ai could not be reached. A stock preview is ready instead.",
      });
    }
  }

  yield encode({
    type: "progress",
    step: "frames",
    status: "completed",
    message: "Visual frames ready",
    detail: frameDetail,
  });

  yield encode({
    type: "complete",
    result: {
      id: `c45_${Date.now().toString(36)}`,
      topic,
      voiceId,
      voiceName,
      durationSec: clipSec,
      script,
      wordCount,
      audioLabel,
      audioSrc,
      frames,
      engine,
      creditsCharged,
      preview,
    },
  });
}

async function* runExtend(input: {
  topic: string;
  voiceId: string;
  voiceName: string;
  priorScript: string;
  priorVideoUrls: string[];
  motionStyle: string | null;
  signal: AbortSignal;
}) {
  yield encode({
    type: "progress",
    step: "script",
    status: "started",
    message: "Continuing the narration",
  });

  const lastVideo = input.priorVideoUrls[input.priorVideoUrls.length - 1];
  if (!lastVideo) {
    yield encode({ type: "error", message: "The finished video cannot be extended." });
    return;
  }
  let continuation: string;
  let frameUrl: string;
  try {
    const [script, frame] = await Promise.all([
      writeContinuation(input.topic, input.priorScript, input.signal),
      extractLastFrame(lastVideo, input.signal),
    ]);
    continuation = script;
    if ("error" in frame) {
      yield encode({ type: "error", message: frame.error || "Could not read the last frame." });
      return;
    }
    frameUrl = frame.imageUrl;
  } catch (error) {
    if (isAbortError(error)) throw error;
    yield encode({
      type: "error",
      message: error instanceof Error ? error.message : "Could not continue the script.",
    });
    return;
  }

  yield encode({
    type: "progress",
    step: "script",
    status: "completed",
    message: "Continuation ready",
    detail: `${countWords(continuation)} new words`,
  });

  yield encode({
    type: "progress",
    step: "audio",
    status: "started",
    message: GENERATE_STEPS[1].label,
  });
  await sleep(AUDIO_STEP_MS, input.signal);
  const audioLabel = `${input.voiceName} · browser voice · no speaker on screen`;
  yield encode({
    type: "progress",
    step: "audio",
    status: "completed",
    message: "Audio ready",
    detail: audioLabel,
  });

  yield encode({
    type: "progress",
    step: "frames",
    status: "started",
    message: "Rendering the next 45 seconds",
  });

  const rendered = await renderFalClip({
    engine: "budget",
    prompt: imageLockedMotionPrompt(
      `${input.topic}. ${continuation.slice(0, 180)}`,
      input.motionStyle,
      "Continue from this exact frame. Keep the same character, face, clothing, colors, and setting.",
    ),
    image: null,
    startFrameUrl: frameUrl,
    pollBudgetMs: 25000,
    signal: input.signal,
  });
  if ("error" in rendered) {
    yield encode({ type: "error", message: rendered.error });
    return;
  }

  const joined = await mergeFalVideos([...input.priorVideoUrls, rendered.videoUrl], input.signal);
  const videoUrl = "videoUrl" in joined ? joined.videoUrl : undefined;
  if (!videoUrl && "error" in joined) {
    console.error("Fal video merge failed", joined.error);
  }

  const frames = buildStoryboard(continuation).map((frame) => ({ ...frame, src: rendered.videoUrl }));
  yield encode({
    type: "progress",
    step: "frames",
    status: "completed",
    message: videoUrl ? "Extended video joined" : "Extension ready",
    detail: videoUrl ? "Original and extension are one video" : "Playing the new segment after the original",
  });

  yield encode({
    type: "complete",
    result: {
      id: `c45_${Date.now().toString(36)}`,
      topic: input.topic,
      voiceId: input.voiceId,
      voiceName: input.voiceName,
      durationSec: VIDEO_DURATION_SEC,
      script: continuation,
      wordCount: countWords(continuation),
      audioLabel,
      frames,
      engine: "budget",
      creditsCharged: EXTEND_VIDEO_COST,
      videoUrl,
    },
  });
}

async function* runScene(input: {
  topic: string;
  voiceId: string;
  voiceName: string;
  narration: string;
  visualPrompt: string;
  referenceImage: ReferenceImage | null;
  priorVideoUrls: string[];
  motionStyle: string | null;
  signal: AbortSignal;
}) {
  const script = cleanScript(input.narration);
  if (!script) {
    yield encode({ type: "error", message: "That scene needs a narration." });
    return;
  }

  yield encode({
    type: "progress",
    step: "script",
    status: "completed",
    message: "Scene narration ready",
    detail: `${countWords(script)} words`,
  });
  yield encode({
    type: "progress",
    step: "audio",
    status: "completed",
    message: "Audio ready",
    detail: `${input.voiceName} · browser voice · no speaker on screen`,
  });
  yield encode({
    type: "progress",
    step: "frames",
    status: "started",
    message: input.priorVideoUrls.length > 0 ? "Continuing from the last frame" : "Rendering this scene",
  });

  let startFrameUrl: string | null = null;
  if (input.priorVideoUrls.length > 0) {
    const lastVideo = input.priorVideoUrls[input.priorVideoUrls.length - 1];
    if (!lastVideo) {
      yield encode({ type: "error", message: "The previous scene cannot be continued." });
      return;
    }
    const frame = await extractLastFrame(lastVideo, input.signal);
    if ("error" in frame) {
      yield encode({ type: "error", message: frame.error || "Could not read the last frame." });
      return;
    }
    startFrameUrl = frame.imageUrl;
  }

  const rendered = await renderFalClip({
    engine: "budget",
    prompt: imageLockedMotionPrompt(
      input.visualPrompt,
      input.motionStyle,
      startFrameUrl
        ? "Continue from this exact frame. Keep the same character, face, clothing, colors, and setting."
        : "Match the reference still when one is attached. Keep the subject consistent.",
    ),
    image: startFrameUrl ? null : input.referenceImage,
    startFrameUrl,
    pollBudgetMs: startFrameUrl ? 25000 : 40000,
    signal: input.signal,
  });
  if ("error" in rendered) {
    yield encode({ type: "error", message: rendered.error });
    return;
  }

  const joined =
    input.priorVideoUrls.length > 0
      ? await mergeFalVideos([...input.priorVideoUrls, rendered.videoUrl], input.signal)
      : null;
  const videoUrl = joined && "videoUrl" in joined ? joined.videoUrl : undefined;
  if (joined && !videoUrl && "error" in joined) console.error("Fal scene merge failed", joined.error);

  const creditsCharged = startFrameUrl
    ? EXTEND_VIDEO_COST
    : generationCreditCost("budget", Boolean(input.referenceImage));
  const frames = buildStoryboard(script).map((frame) => ({ ...frame, src: rendered.videoUrl }));

  yield encode({
    type: "progress",
    step: "frames",
    status: "completed",
    message: videoUrl ? "Scene joined to the short" : "Scene ready",
  });
  yield encode({
    type: "complete",
    result: {
      id: `c45_${Date.now().toString(36)}`,
      topic: input.topic,
      voiceId: input.voiceId,
      voiceName: input.voiceName,
      durationSec: CLIP_DURATION_SEC,
      script,
      wordCount: countWords(script),
      audioLabel: `${input.voiceName} · browser voice · no speaker on screen`,
      frames,
      engine: "budget",
      creditsCharged,
      videoUrl,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "GEMINI_API_KEY must be set in .env.local." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body with topic and voice." }, { status: 400 });
  }

  const record =
    body && typeof body === "object"
      ? (body as {
          topic?: unknown;
          voice?: unknown;
          engine?: unknown;
          referenceImage?: unknown;
          motionStyle?: unknown;
          extend?: unknown;
          priorScript?: unknown;
          priorVideoUrls?: unknown;
          scene?: unknown;
          narration?: unknown;
          visualPrompt?: unknown;
          durationSec?: unknown;
        })
      : {};
  const topic = typeof record.topic === "string" ? record.topic.trim() : "";
  const extend = record.extend === true;
  const scene = record.scene === true;
  const narration = typeof record.narration === "string" ? record.narration.trim() : "";
  const visualPrompt = typeof record.visualPrompt === "string" ? record.visualPrompt.trim() : "";
  const priorScript = typeof record.priorScript === "string" ? record.priorScript.trim() : "";
  const priorVideoUrls = Array.isArray(record.priorVideoUrls)
    ? record.priorVideoUrls.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];
  const voice = typeof record.voice === "string" ? record.voice : "";
  const engine = typeof record.engine === "string" ? record.engine : "";
  const referenceImage = parseReferenceImage(record.referenceImage);
  const motionStyle = typeof record.motionStyle === "string" ? record.motionStyle : "";

  if (topic.length < 3) {
    return Response.json(
      { error: "Use at least 3 characters for the topic." },
      { status: 400 },
    );
  }

  if (topic.length > PROMPT_MAX) {
    return Response.json(
      { error: `Keep the prompt under ${PROMPT_MAX} characters.` },
      { status: 400 },
    );
  }

  if (!isVoiceId(voice)) {
    return Response.json({ error: "Select a voice style." }, { status: 400 });
  }

  if (!isVisualEngineId(engine)) {
    return Response.json({ error: "Select a visual engine." }, { status: 400 });
  }

  if (referenceImage === "invalid") {
    return Response.json(
      { error: "Use a JPEG, PNG, or WebP reference image." },
      { status: 400 },
    );
  }

  if (motionStyle && !isMotionStyleId(motionStyle)) {
    return Response.json({ error: "Select a motion style." }, { status: 400 });
  }

  const voiceStyle = getVoice(voice);
  if (!voiceStyle) {
    return Response.json({ error: "Select a voice style." }, { status: 400 });
  }

  if (extend) {
    if (priorScript.length < 20) {
      return Response.json({ error: "The current script is too short to extend." }, { status: 400 });
    }
    if (priorVideoUrls.length === 0 || priorVideoUrls.some((url) => !falMediaUrl(url))) {
      return Response.json({ error: "Extend a finished Studio Fast Motion video." }, { status: 400 });
    }
  }

  if (scene) {
    if (narration.length < 20 || visualPrompt.length < 12) {
      return Response.json({ error: "Each scene needs narration and a visual prompt." }, { status: 400 });
    }
    if (priorVideoUrls.some((url) => !falMediaUrl(url))) {
      return Response.json({ error: "The previous scene cannot be continued." }, { status: 400 });
    }
  }

  const durationSec = typeof record.durationSec === "number" ? record.durationSec : null;
  const holdQuote = generationHoldCost({
    extend,
    scene,
    continuation: priorVideoUrls.length > 0,
    engine,
    imageToVideo: Boolean(referenceImage) && engine !== "stock",
    durationSec,
  });
  let hold: { userId: string; cost: number } | null = null;
  if (holdQuote.clipCost > 0) {
    const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
    const user = accessToken ? await userFromAccessToken(accessToken) : null;
    if (!user?.email) {
      return NextResponse.json({ error: "Sign in before spending credits." }, { status: 401 });
    }
    const reserved = await reserveGenerationCredits(
      user.id,
      user.email,
      holdQuote.required,
      holdQuote.clipCost,
    );
    if (!reserved.ok) {
      if (reserved.reason === "insufficient") {
        return NextResponse.json(
          { error: "Insufficient credits", upgradeRequired: true },
          { status: 402 },
        );
      }
      return NextResponse.json({ error: "Could not update the credit balance." }, { status: 500 });
    }
    hold = { userId: user.id, cost: holdQuote.clipCost };
  }

  const stream = iteratorToStream(
    scene
      ? runScene({
          topic,
          voiceId: voiceStyle.id,
          voiceName: voiceStyle.name,
          narration,
          visualPrompt,
          referenceImage: priorVideoUrls.length > 0 ? null : referenceImage,
          priorVideoUrls,
          motionStyle: motionStyle || null,
          signal: request.signal,
        })
      : extend
      ? runExtend({
          topic,
          voiceId: voiceStyle.id,
          voiceName: voiceStyle.name,
          priorScript,
          priorVideoUrls,
          motionStyle: motionStyle || null,
          signal: request.signal,
        })
      : runWorkflow(
      topic,
      voiceStyle.id,
      voiceStyle.name,
      voiceStyle.elevenLabsVoiceId,
      engine,
      referenceImage,
      motionStyle || null,
      request.signal,
      record.durationSec === CLIP_DURATION_SEC ? CLIP_DURATION_SEC : VIDEO_DURATION_SEC,
    ),
    hold,
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
