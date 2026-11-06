import { isGenerateEvent, type GenerateResult } from "@/lib/generate";
import { PROMPT_MAX } from "@/lib/motion-styles";
import { tierById, type SceneSeconds, type TierId } from "@/lib/pricing.config";
import { INSUFFICIENT_CREDITS_MESSAGE, videoModelEngine } from "@/lib/video-models";

const STORY_BEATS = [
  "Opening establishing shot that sets the world",
  "Introduce the main subject",
  "The subject starts moving toward a goal",
  "A detail close-up that adds texture",
  "Rising action, the pace picks up",
  "The turning point",
  "The payoff moment",
  "Reaction and resolution",
  "Closing wide shot that lingers",
];

const RENDER_POLL_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

export type SceneRender = { videoUrl: string; creditsCharged: number; mock: boolean };

export type StoryCut = { videoUrl: string; joined: boolean };

export class StoryRenderError extends Error {
  constructor(
    message: string,
    readonly insufficientCredits = false,
  ) {
    super(message);
    this.name = "StoryRenderError";
  }
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function playable(url: string | undefined) {
  return typeof url === "string" && url.startsWith("https://") ? url : "";
}

// TODO: replace with an AI scene planner (e.g. the existing copilot route).
export function splitStoryIdea(idea: string, count: number): string[] {
  const subject = idea.trim().replace(/[.\s]+$/, "");
  return Array.from({ length: count }, (_, index) => {
    const beat = STORY_BEATS[Math.min(index, STORY_BEATS.length - 1)];
    return `${beat}: ${subject}`;
  });
}

/**
 * Renders one scene through the live /api/generate pipeline (the same request the Agent page sends).
 * The server charges the tier's sceneCost only after the clip succeeds; mock mode returns a free stock clip.
 */
export async function generateScene(
  input: { prompt: string; seconds: SceneSeconds; tier: TierId; mock: boolean },
  options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<SceneRender> {
  const { signal, onProgress } = options;
  const tier = tierById(input.tier);
  let percent = 2;
  const bump = (to: number) => {
    percent = Math.max(percent, Math.min(95, Math.round(to)));
    onProgress?.(percent);
  };
  bump(2);

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    signal,
    body: JSON.stringify({
      topic: input.prompt.slice(0, PROMPT_MAX),
      voice: "none",
      engine: videoModelEngine(tier.modelId),
      videoModel: tier.modelId,
      resolution: tier.resolution,
      durationSec: input.seconds,
      aspect: "9:16",
      ...(input.mock ? { mockMode: true } : {}),
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new StoryRenderError(
      payload?.error ?? (response.status === 402 ? INSUFFICIENT_CREDITS_MESSAGE : "Could not start this scene."),
      response.status === 402,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new StoryRenderError("The generator did not return a progress stream.");
  let finished: GenerateResult | null = null;
  let pending: { statusUrl: string; responseUrl: string; ticket?: string; result: GenerateResult } | null = null;
  const decoder = new TextDecoder();
  let buffer = "";
  const consume = (chunk: string) => {
    const line = chunk
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.startsWith("data:"));
    if (!line) return;
    let event: unknown;
    try {
      event = JSON.parse(line.slice(5).trim());
    } catch {
      return;
    }
    if (!isGenerateEvent(event)) return;
    if (event.type === "error") throw new StoryRenderError(event.message || "This scene could not be generated.");
    if (event.type === "progress") bump(percent + (event.status === "completed" ? 10 : 4));
    if (event.type === "complete") finished = event.result;
    if (event.type === "rendering") {
      pending = event;
      bump(40);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    chunks.forEach(consume);
    if (done) {
      if (buffer.trim()) consume(buffer);
      break;
    }
  }

  const result = finished as GenerateResult | null;
  const direct = playable(result?.videoUrl) || playable(result?.frames.find((frame) => playable(frame.src))?.src);
  if (direct && result) {
    return { videoUrl: direct, creditsCharged: result.creditsCharged ?? 0, mock: Boolean(result.mock) };
  }

  const queued = pending as { statusUrl: string; responseUrl: string; ticket?: string; result: GenerateResult } | null;
  if (!queued) throw new StoryRenderError("This scene finished without a playable clip.");
  const started = Date.now();
  while (Date.now() - started < RENDER_POLL_MS) {
    const poll = await fetch("/api/video/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusUrl: queued.statusUrl, responseUrl: queued.responseUrl, ticket: queued.ticket }),
      signal,
    }).catch((error: unknown) => {
      if (signal?.aborted) throw error;
      return null;
    });
    const payload = (await poll?.json().catch(() => null)) as
      | { videoUrl?: string; creditsCharged?: number; pending?: boolean; error?: string }
      | null;
    const videoUrl = playable(payload?.videoUrl);
    if (videoUrl) {
      return { videoUrl, creditsCharged: payload?.creditsCharged ?? 0, mock: Boolean(queued.result.mock) };
    }
    if (payload?.error && poll && poll.status < 500) {
      throw new StoryRenderError(payload.error, poll.status === 402);
    }
    bump(percent + 3);
    await wait(POLL_INTERVAL_MS, signal);
  }
  throw new StoryRenderError("Fal.ai is still rendering this scene. Try regenerating it in a moment.");
}

/** Joins the scene clips into one MP4 with the existing /api/video/merge route (no credits). */
export async function stitchScenes(
  clips: SceneRender[],
  options: { signal?: AbortSignal } = {},
): Promise<StoryCut> {
  const urls = clips.map((clip) => clip.videoUrl);
  if (urls.length < 2 || clips.some((clip) => clip.mock)) {
    return { videoUrl: urls[0] ?? "", joined: false };
  }
  const response = await fetch("/api/video/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrls: urls, aspect: "9:16" }),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as { videoUrl?: string; error?: string } | null;
  const videoUrl = playable(payload?.videoUrl);
  if (!response.ok || !videoUrl) {
    throw new StoryRenderError(payload?.error ?? "The scenes rendered but could not be joined.");
  }
  return { videoUrl, joined: true };
}

// TODO: call a prompt-improvement model. Returns a lightly expanded prompt for now.
export async function improvePrompt(prompt: string): Promise<string> {
  await wait(500);
  const base = prompt.trim().replace(/[.\s]+$/, "");
  if (!base) return "";
  return `${base}, rich detail, natural motion, cohesive color grade, 9:16 vertical framing`;
}
