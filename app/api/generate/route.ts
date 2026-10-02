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
import { generationCreditCost } from "@/lib/credits";
import { parseReferenceImage, renderFalClip, type ReferenceImage } from "@/lib/fal-video";
import { getVoice, isVoiceId } from "@/lib/voices";
import { isVisualEngineId, type VisualEngineId } from "@/lib/visual-engines";

const USE_PAID_VOICE = false;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FRAME_STEP_MS = 700;
const AUDIO_STEP_MS = 600;
const SCRIPT_CHAR_CAP = 1600;

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

function iteratorToStream(iterator: AsyncIterator<Uint8Array>) {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        if (value) {
          controller.enqueue(value);
        }
      } catch (error) {
        if (isAbortError(error)) {
          controller.close();
          return;
        }
        controller.error(error);
      }
    },
    cancel() {
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

async function writeScript(topic: string, signal: AbortSignal) {
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
          parts: [{ text: SCRIPT_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze this topic and write the 45-second TikTok script.\n\nTopic: ${topic}`,
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
  signal: AbortSignal,
) {
  yield encode({
    type: "progress",
    step: "script",
    status: "started",
    message: GENERATE_STEPS[0].label,
  });

  let script: string;
  let preview = false;
  try {
    script = await writeScript(topic, signal);
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
      : `${wordCount} words, paced for a ${VIDEO_DURATION_SEC}-second narration`,
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
      const rendered = await renderFalClip({
        engine,
        prompt: `${topic}. Vertical 9:16 motion. ${script.slice(0, 500)}`,
        image: referenceImage,
        signal,
      });
      if ("videoUrl" in rendered) {
        frames = frames.map((frame) => ({ ...frame, src: rendered.videoUrl }));
        creditsCharged = generationCreditCost(engine);
        frameDetail = referenceImage
          ? "Image-to-video clip from Fal.ai · 9:16"
          : "Fal.ai motion clip · 9:16";
      } else {
        preview = true;
        await sleep(FRAME_STEP_MS, signal);
        frameDetail = `${FRAME_COUNT} stock preview clips · 9:16`;
        yield encode({ type: "notice", message: rendered.error });
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
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
      durationSec: VIDEO_DURATION_SEC,
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

export async function POST(request: Request) {
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
      ? (body as { topic?: unknown; voice?: unknown; engine?: unknown; referenceImage?: unknown })
      : {};
  const topic = typeof record.topic === "string" ? record.topic.trim() : "";
  const voice = typeof record.voice === "string" ? record.voice : "";
  const engine = typeof record.engine === "string" ? record.engine : "";
  const referenceImage = parseReferenceImage(record.referenceImage);

  if (topic.length < 3) {
    return Response.json(
      { error: "Use at least 3 characters for the topic." },
      { status: 400 },
    );
  }

  if (topic.length > 120) {
    return Response.json(
      { error: "Keep the topic under 120 characters." },
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
      { error: "Use a JPEG, PNG, or WebP reference image under 1.2 MB." },
      { status: 400 },
    );
  }

  const voiceStyle = getVoice(voice);
  if (!voiceStyle) {
    return Response.json({ error: "Select a voice style." }, { status: 400 });
  }

  const stream = iteratorToStream(
    runWorkflow(
      topic,
      voiceStyle.id,
      voiceStyle.name,
      voiceStyle.elevenLabsVoiceId,
      engine,
      referenceImage,
      request.signal,
    ),
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
