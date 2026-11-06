import { NextResponse, type NextRequest } from "next/server";
import {
  FRAME_COUNT,
  FRAME_LENGTH_SEC,
  GENERATE_STEPS,
  VIDEO_DURATION_SEC,
  buildStoryboard,
  countWords,
  motionClip,
  previewScript,
  type GenerateEvent,
} from "@/lib/generate";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import {
  BUDGET_GENERATION_COST,
  EXTEND_VIDEO_COST,
  durationCreditCost,
  generationHoldCost,
} from "@/lib/credits";
import { refundProfileCredits, reserveGenerationCredits } from "@/lib/profiles";
import { userFromAccessToken } from "@/lib/supabase/server";
import { isAspectRatio, type AspectRatio } from "@/lib/frame";
import { CLIP_DURATION_SEC } from "@/lib/scenes";
import { logApiKey } from "@/lib/api-keys";
import { falApiKey } from "@/lib/fal-key";
import {
  extractLastFrame,
  falMediaUrl,
  mergeFalVideos,
  parseReferenceImage,
  renderFalClip,
  type ReferenceImage,
} from "@/lib/fal-video";
import {
  imageLockedMotionPrompt,
  isMotionStyleId,
  PROMPT_MAX,
  speakingMotionPrompt,
  videoMotionPrompt,
} from "@/lib/motion-styles";
import { alignReferenceContext } from "@/lib/reference-context";
import { DEFAULT_VOICE_ID, getVoice, resolveVoiceId, type VoiceId } from "@/lib/voices";
import { isVisualEngineId, type VisualEngineId } from "@/lib/visual-engines";
import {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RESOLUTION,
  isVideoResolution,
  INSUFFICIENT_CREDITS_MESSAGE,
  videoModelEngine,
  wantsVoiceover,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-models";
import { authorizeGenerationCredits, deductGenerationCredits, type VideoBilling } from "@/lib/video-billing";
import { narrateClip } from "@/lib/narrate-clip";
import { isNarrationLanguageId, type NarrationLanguageId } from "@/lib/narration";
import { signRenderTicket } from "@/lib/render-ticket";
import { isFalCreditError, isMockVideoUrl, pickMockVideo } from "@/lib/mock-video";

const USE_PAID_VOICE = false;
const MOCK_NOTICE =
  "Fal.ai video rendering was skipped. A free 9:16 stock clip is loaded so dialogue and captions can still be tested.";

function mockPicture(script: string) {
  const videoUrl = pickMockVideo();
  return { videoUrl, frames: motionClip(videoUrl, script) };
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FRAME_STEP_MS = 700;
const AUDIO_STEP_MS = 600;
const SCRIPT_CHAR_CAP = 1600;

const DIALOGUE_RULES = `Return only direct character dialogue. Every line uses this form:
Name: "spoken line"

Two named characters. The first speaker is character A and the second is character B. They alternate. No third-person narration, no stage directions, no title, no hashtags, no emojis, and no markdown.`;

const SHORT_SCRIPT_PROMPT = `You write a 5-second vertical video as on-camera character dialogue.

${DIALOGUE_RULES}
Use exactly 2 lines. 12 to 20 spoken words total, not counting the names.`;

const TEN_SECOND_SCRIPT_PROMPT = `You write a 10-second vertical video as on-camera character dialogue.

${DIALOGUE_RULES}
Use 4 lines. 22 to 32 spoken words total, not counting the names. Open on a hook and end on a payoff.`;

const SCRIPT_SYSTEM_PROMPT = `You write a 45-second vertical video as on-camera character dialogue. Analyze the topic, then return only the dialogue.

${DIALOGUE_RULES}
Pace: about 110 to 130 spoken words, said out loud in 45 seconds. Short lines.

Open on a specific hook about this topic. Then hit one concrete fact, the mistake people make, and one action they can take today. End on a line that pays off the hook.

Do not open with "Hey guys", "Stop scrolling", or "In this video".`;

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
          else if (text.includes('"type":"rendering"')) keep();
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
  if (!logApiKey("GEMINI_API_KEY")) {
    throw new Error("GEMINI_API_KEY is missing from the server environment.");
  }
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
          parts: [{ text: clipSec >= 10 && clipSec < 15 ? TEN_SECOND_SCRIPT_PROMPT : clipSec === CLIP_DURATION_SEC ? SHORT_SCRIPT_PROMPT : SCRIPT_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  clipSec >= 10 && clipSec < 15
                    ? `Write the 10-second character dialogue.\n\nTopic: ${topic}`
                    : clipSec === CLIP_DURATION_SEC
                      ? `Write the 5-second character dialogue.\n\nTopic: ${topic}`
                      : `Analyze this topic and write the 45-second character dialogue.\n\nTopic: ${topic}`,
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
              text: `You continue an on-camera character dialogue. Return only the next exchange in the form Name: "spoken line". Keep the same two character names. About 12 to 20 spoken words. Do not repeat earlier lines. ${DIALOGUE_RULES}`,
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Topic: ${topic}\n\nThe characters already said:\n${prior}\n\nWrite the next exchange.`,
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
  mockMode = false,
  aspect: AspectRatio = "9:16",
  videoModel: VideoModelId = DEFAULT_VIDEO_MODEL,
  resolution: VideoResolution = DEFAULT_VIDEO_RESOLUTION,
  billing: VideoBilling | null = null,
  narration: { voiceId: VoiceId; language: NarrationLanguageId } | null = null,
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
      : `${wordCount} words, paced for a ${clipSec}-second dialogue`,
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
      audioLabel = narration
        ? `${voiceName} · ElevenLabs voiceover records once the picture is ready`
        : "No voiceover selected";
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    yield encode({
      type: "error",
      message: error instanceof Error ? error.message : "Could not render the voice.",
    });
    return;
  }

  const recordVoice = Boolean(narration) && !preview;
  if (!recordVoice) {
    yield encode({
      type: "progress",
      step: "audio",
      status: "completed",
      message: "Audio ready",
      detail: audioLabel,
    });
  }

  yield encode({
    type: "progress",
    step: "frames",
    status: "started",
    message: GENERATE_STEPS[2].label,
  });

  let frames = buildStoryboard(script);
  let creditsCharged = 0;
  let falRendered = false;
  let mock = mockMode;
  let frameDetail = `${FRAME_COUNT} Wikimedia stock clips · 9:16 · ${FRAME_LENGTH_SEC} seconds each`;

  if (mockMode) {
    const stock = mockPicture(script);
    frames = stock.frames;
    frameDetail = "Mock 9:16 stock clip";
    yield encode({ type: "notice", message: MOCK_NOTICE });
  } else if (engine === "stock") {
    await sleep(FRAME_STEP_MS, signal);
  } else {
    try {
      const lock = await lockPromise;
      const rendered = await renderFalClip({
        engine,
        videoModel,
        resolution,
        prompt: speakingMotionPrompt(
          referenceImage
            ? imageLockedMotionPrompt(topic, motionStyle, lock)
            : videoMotionPrompt(topic, motionStyle),
          script,
        ),
        image: referenceImage,
        durationSec: clipSec >= 10 ? 10 : 5,
        aspectRatio: aspect,
        signal,
      });
      if ("videoUrl" in rendered) {
        falRendered = true;
        frames = motionClip(rendered.videoUrl, script);
        frameDetail = referenceImage
          ? "Image-to-video clip from Fal.ai · 9:16"
          : "Fal.ai motion clip · 9:16";
      } else if ("pending" in rendered) {
        if (!billing) {
          yield encode({ type: "error", message: "Sign in before rendering a video." });
          return;
        }
        yield encode({
          type: "rendering",
          statusUrl: rendered.statusUrl,
          responseUrl: rendered.responseUrl,
          ticket: signRenderTicket({
            userId: billing.userId,
            email: billing.email,
            credits: preview ? 0 : billing.credits,
            responseUrl: rendered.responseUrl,
            ...(recordVoice && narration
              ? { voice: { voiceId: narration.voiceId, language: narration.language, script, aspect } }
              : {}),
          }),
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
            frames: motionClip("", script),
            engine,
            creditsCharged: billing?.credits ?? 0,
            preview: false,
          },
        });
        return;
      } else if (isFalCreditError(rendered.error)) {
        console.error("[fal] credits depleted; using a stock clip", rendered.error);
        const stock = mockPicture(script);
        frames = stock.frames;
        mock = true;
        creditsCharged = 0;
        frameDetail = "Mock 9:16 stock clip";
        yield encode({ type: "notice", message: MOCK_NOTICE });
      } else if (falApiKey()) {
        console.error("[fal] video render failed", rendered.error);
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

  const pictureUrl = frames.find((frame) => frame.src.startsWith("https://"))?.src ?? null;
  let videoUrl = pictureUrl ?? undefined;
  let narrationEmbedded = false;
  let voiceOk = !recordVoice;
  if (recordVoice && narration) {
    try {
      const narrated = await narrateClip({
        script,
        voiceId: narration.voiceId,
        language: narration.language,
        videoUrl: falRendered || mock ? pictureUrl : null,
        aspect,
        mock,
        signal,
      });
      voiceOk = narrated.elevenLabs;
      audioSrc = narrated.audioSrc;
      audioLabel = narrated.audioLabel;
      if (narrated.embedded && narrated.videoUrl) {
        const voiced = narrated.videoUrl;
        frames = frames.map((frame) => (frame.src === pictureUrl ? { ...frame, src: voiced } : frame));
        videoUrl = voiced;
        narrationEmbedded = true;
      }
      if (narrated.notice) yield encode({ type: "notice", message: narrated.notice });
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.error("[elevenlabs] voiceover failed", error instanceof Error ? error.message : error);
      audioLabel = "Voiceover could not be recorded";
    }
    yield encode({
      type: "progress",
      step: "audio",
      status: "completed",
      message: voiceOk ? "Audio ready" : "Voiceover unavailable",
      detail: audioLabel,
    });
  }

  if (billing && falRendered && !preview) {
    if (voiceOk) {
      const charged = await deductGenerationCredits(billing);
      if (!charged.ok) {
        yield encode({ type: "error", message: charged.error });
        return;
      }
      creditsCharged = billing.credits;
    } else {
      yield encode({
        type: "notice",
        message: "The ElevenLabs voiceover could not be recorded, so no credits were charged for this clip.",
      });
    }
  }

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
      narrationEmbedded,
      frames,
      engine,
      creditsCharged,
      preview,
      mock,
      videoUrl,
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
  mockMode?: boolean;
  aspect?: AspectRatio;
  owner: { userId: string; email: string } | null;
}) {
  yield encode({
    type: "progress",
    step: "script",
    status: "started",
    message: "Continuing the dialogue",
  });

  const lastVideo = input.priorVideoUrls[input.priorVideoUrls.length - 1];
  if (!lastVideo) {
    yield encode({ type: "error", message: "The finished video cannot be extended." });
    return;
  }
  let continuation: string;
  let frameUrl = "";
  let mock = Boolean(input.mockMode);
  try {
    continuation = await writeContinuation(input.topic, input.priorScript, input.signal);
    if (!mock) {
      const frame = await extractLastFrame(lastVideo, input.signal);
      if ("error" in frame) {
        if (!isFalCreditError(frame.error ?? "")) {
          yield encode({ type: "error", message: frame.error || "Could not read the last frame." });
          return;
        }
        mock = true;
      } else {
        frameUrl = frame.imageUrl;
      }
    }
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
  const audioLabel = `${input.voiceName} · Character dialogue and lip-sync run after the picture is ready`;
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
    message: "Rendering the next scene",
  });

  if (mock) {
    const stock = mockPicture(continuation);
    yield encode({ type: "notice", message: MOCK_NOTICE });
    yield encode({ type: "progress", step: "frames", status: "completed", message: "Extension ready", detail: "Mock 9:16 stock clip" });
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
        frames: stock.frames,
        engine: "budget",
        creditsCharged: 0,
        mock: true,
        videoUrl: stock.videoUrl,
      },
    });
    return;
  }

  const rendered = await renderFalClip({
    engine: "budget",
    prompt: speakingMotionPrompt(
      imageLockedMotionPrompt(
        `${input.topic}. ${continuation.slice(0, 180)}`,
        input.motionStyle,
        "Continue from this exact frame. Keep the same character, face, clothing, colors, and setting.",
      ),
      continuation,
    ),
    image: null,
    startFrameUrl: frameUrl,
    durationSec: 5,
    aspectRatio: input.aspect ?? "9:16",
    signal: input.signal,
  });
  if ("pending" in rendered) {
    const frames = motionClip("", continuation);
    yield encode({
      type: "rendering",
      statusUrl: rendered.statusUrl,
      responseUrl: rendered.responseUrl,
      ...(input.owner
        ? { ticket: signRenderTicket({ ...input.owner, credits: 0, responseUrl: rendered.responseUrl }) }
        : {}),
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
        creditsCharged: durationCreditCost(VIDEO_DURATION_SEC) ?? EXTEND_VIDEO_COST,
      },
    });
    return;
  }
  if ("error" in rendered) {
    if (!isFalCreditError(rendered.error)) {
      console.error("[fal] video render failed", rendered.error);
      yield encode({ type: "error", message: rendered.error });
      return;
    }
    console.error("[fal] credits depleted; using a stock clip", rendered.error);
    const stock = mockPicture(continuation);
    yield encode({ type: "notice", message: MOCK_NOTICE });
    yield encode({ type: "progress", step: "frames", status: "completed", message: "Extension ready", detail: "Mock 9:16 stock clip" });
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
        frames: stock.frames,
        engine: "budget",
        creditsCharged: 0,
        mock: true,
        videoUrl: stock.videoUrl,
      },
    });
    return;
  }

  const joined = await mergeFalVideos([...input.priorVideoUrls, rendered.videoUrl], input.signal);
  const videoUrl = "videoUrl" in joined ? joined.videoUrl : undefined;
  if (!videoUrl && "error" in joined) {
    console.error("Fal video merge failed", joined.error);
  }

  const frames = motionClip(rendered.videoUrl, continuation);
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
      creditsCharged: durationCreditCost(VIDEO_DURATION_SEC) ?? EXTEND_VIDEO_COST,
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
  mockMode?: boolean;
  aspect?: AspectRatio;
  owner: { userId: string; email: string } | null;
}) {
  const script = cleanScript(input.narration);
  if (!script) {
    yield encode({ type: "error", message: "That scene needs dialogue." });
    return;
  }

  yield encode({
    type: "progress",
    step: "script",
    status: "completed",
    message: "Scene dialogue ready",
    detail: `${countWords(script)} words`,
  });
  yield encode({
    type: "progress",
    step: "audio",
    status: "completed",
    message: "Audio ready",
    detail: `${input.voiceName} · Character dialogue and lip-sync run after the picture is ready`,
  });
  yield encode({
    type: "progress",
    step: "frames",
    status: "started",
    message: input.priorVideoUrls.length > 0 ? "Continuing from the last frame" : "Rendering this scene",
  });

  if (input.mockMode) {
    const stock = mockPicture(script);
    yield encode({ type: "notice", message: MOCK_NOTICE });
    yield encode({ type: "progress", step: "frames", status: "completed", message: "Scene ready", detail: "Mock 9:16 stock clip" });
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
        audioLabel: `${input.voiceName} · Character dialogue and lip-sync run after the picture is ready`,
        frames: stock.frames,
        engine: "budget",
        creditsCharged: 0,
        mock: true,
        videoUrl: stock.videoUrl,
      },
    });
    return;
  }

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
    prompt: speakingMotionPrompt(
      imageLockedMotionPrompt(
        input.visualPrompt,
        input.motionStyle,
        startFrameUrl
          ? "Continue from this exact frame. Keep the same character, face, clothing, colors, and setting."
          : "Match the reference still when one is attached. Keep the subject consistent.",
      ),
      script,
    ),
    image: startFrameUrl ? null : input.referenceImage,
    startFrameUrl,
    durationSec: CLIP_DURATION_SEC,
    aspectRatio: input.aspect ?? "9:16",
    signal: input.signal,
  });
  if ("pending" in rendered) {
    const frames = motionClip("", script);
    yield encode({
      type: "rendering",
      statusUrl: rendered.statusUrl,
      responseUrl: rendered.responseUrl,
      ...(input.owner
        ? { ticket: signRenderTicket({ ...input.owner, credits: 0, responseUrl: rendered.responseUrl }) }
        : {}),
      result: {
        id: `c45_${Date.now().toString(36)}`,
        topic: input.topic,
        voiceId: input.voiceId,
        voiceName: input.voiceName,
        durationSec: CLIP_DURATION_SEC,
        script,
        wordCount: countWords(script),
        audioLabel: `${input.voiceName} · Character dialogue and lip-sync run after the picture is ready`,
        frames,
        engine: "budget",
        creditsCharged: durationCreditCost(CLIP_DURATION_SEC) ?? BUDGET_GENERATION_COST,
      },
    });
    return;
  }
  if ("error" in rendered) {
    if (!isFalCreditError(rendered.error)) {
      console.error("[fal] video render failed", rendered.error);
      yield encode({ type: "error", message: rendered.error });
      return;
    }
    console.error("[fal] credits depleted; using a stock clip", rendered.error);
    const stock = mockPicture(script);
    yield encode({ type: "notice", message: MOCK_NOTICE });
    yield encode({ type: "progress", step: "frames", status: "completed", message: "Scene ready", detail: "Mock 9:16 stock clip" });
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
        audioLabel: `${input.voiceName} · Character dialogue and lip-sync run after the picture is ready`,
        frames: stock.frames,
        engine: "budget",
        creditsCharged: 0,
        mock: true,
        videoUrl: stock.videoUrl,
      },
    });
    return;
  }

  const creditsCharged = durationCreditCost(CLIP_DURATION_SEC) ?? BUDGET_GENERATION_COST;
  const frames = motionClip(rendered.videoUrl, script);

  yield encode({
    type: "progress",
    step: "frames",
    status: "completed",
    message: "Scene ready",
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
      audioLabel: `${input.voiceName} · Character dialogue and lip-sync run after the picture is ready`,
      frames,
      engine: "budget",
      creditsCharged,
      videoUrl: rendered.videoUrl,
    },
  });
}

export async function POST(request: NextRequest) {
  const geminiReady = logApiKey("GEMINI_API_KEY");
  const falReady = logApiKey("FAL_KEY");
  const voiceReady = logApiKey("ELEVENLABS_API_KEY");
  if (!geminiReady) {
    return Response.json(
      { error: "GEMINI_API_KEY must be set in .env.local." },
      { status: 500 },
    );
  }
  if (!falReady) {
    return Response.json({ error: "FAL_KEY must be set in .env.local." }, { status: 500 });
  }
  if (!voiceReady) {
    return Response.json({ error: "ELEVENLABS_API_KEY must be set in .env.local." }, { status: 500 });
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
          voiceId?: unknown;
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
          mockMode?: unknown;
          language?: unknown;
          aspect?: unknown;
          videoModel?: unknown;
          resolution?: unknown;
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
  const rawVoice =
    typeof record.voice === "string"
      ? record.voice
      : typeof record.voiceId === "string"
        ? record.voiceId
        : "";
  const voiceRequested = wantsVoiceover(rawVoice);
  const voice = voiceRequested ? resolveVoiceId(rawVoice) : DEFAULT_VOICE_ID;
  const language: NarrationLanguageId =
    typeof record.language === "string" && isNarrationLanguageId(record.language) ? record.language : "auto";
  const videoModel = DEFAULT_VIDEO_MODEL;
  const engine = videoModelEngine(videoModel);
  const resolution =
    typeof record.resolution === "string" && isVideoResolution(record.resolution)
      ? record.resolution
      : DEFAULT_VIDEO_RESOLUTION;
  const referenceImage = parseReferenceImage(record.referenceImage);
  const motionStyle = typeof record.motionStyle === "string" ? record.motionStyle : "";
  const mockMode = record.mockMode === true;
  const aspect: AspectRatio = typeof record.aspect === "string" && isAspectRatio(record.aspect) ? record.aspect : "9:16";

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

  if (!voice) {
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
    if (priorVideoUrls.length === 0 || priorVideoUrls.some((url) => !falMediaUrl(url) && !isMockVideoUrl(url))) {
      return Response.json({ error: "Extend a finished Studio Fast Motion video." }, { status: 400 });
    }
  }

  if (scene) {
    if (narration.length < 20 || visualPrompt.length < 12) {
      return Response.json({ error: "Each scene needs dialogue and a visual prompt." }, { status: 400 });
    }
    if (priorVideoUrls.some((url) => !falMediaUrl(url) && !isMockVideoUrl(url))) {
      return Response.json({ error: "The previous scene cannot be continued." }, { status: 400 });
    }
  }

  const durationSec = typeof record.durationSec === "number" ? record.durationSec : null;
  const clipSec = record.durationSec === 10 ? 10 : CLIP_DURATION_SEC;
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  let hold: { userId: string; cost: number } | null = null;
  let owner: { userId: string; email: string } | null = null;
  let billing: VideoBilling | null = null;

  if (extend || scene) {
    const holdQuote = generationHoldCost({
      extend,
      scene,
      continuation: priorVideoUrls.length > 0,
      engine,
      imageToVideo: Boolean(referenceImage),
      durationSec,
    });
    if (holdQuote.clipCost > 0) {
      const user = accessToken ? await userFromAccessToken(accessToken) : null;
      if (!user?.email) {
        return NextResponse.json({ error: "Sign in before spending credits." }, { status: 401 });
      }
      const reserved = await reserveGenerationCredits(user.id, user.email, holdQuote.required, holdQuote.clipCost);
      if (!reserved.ok) {
        if (reserved.reason === "insufficient") {
          return NextResponse.json({ error: INSUFFICIENT_CREDITS_MESSAGE, upgradeRequired: true }, { status: 402 });
        }
        return NextResponse.json({ error: "Could not update the credit balance." }, { status: 500 });
      }
      hold = { userId: user.id, cost: holdQuote.clipCost };
      owner = { userId: user.id, email: user.email };
    }
  } else {
    const user = accessToken ? await userFromAccessToken(accessToken) : null;
    if (!user?.email) {
      return NextResponse.json({ error: "Sign in before spending credits." }, { status: 401 });
    }
    const checked = await authorizeGenerationCredits({
      userId: user.id,
      email: user.email,
      modelName: videoModel,
      duration: clipSec,
      resolution,
      voiceId: voiceRequested ? voiceStyle.id : null,
    });
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, upgradeRequired: checked.status === 402 },
        { status: checked.status },
      );
    }
    billing = checked.billing;
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
          mockMode,
          aspect,
          owner,
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
          mockMode,
          aspect,
          owner,
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
      clipSec,
      mockMode,
      aspect,
      videoModel,
      resolution,
      billing,
      voiceRequested ? { voiceId: voiceStyle.id, language } : null,
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
