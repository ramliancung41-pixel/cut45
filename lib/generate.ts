import { isMockVideoUrl } from "@/lib/mock-video";
import type { VisualEngineId } from "@/lib/visual-engines";

export const VIDEO_DURATION_SEC = 45;
export const FRAME_COUNT = 9;
export const FRAME_LENGTH_SEC = 5;

export const GENERATE_STEPS = [
  { id: "script", label: "Generating script" },
  { id: "frames", label: "Generating visual frames" },
] as const;

export type GenerateStepId = (typeof GENERATE_STEPS)[number]["id"];

export type StoryFrame = {
  time: string;
  caption: string;
  term: string;
  src: string;
};

export type GenerateResult = {
  id: string;
  topic: string;
  voiceId: string;
  voiceName: string;
  durationSec: number;
  videoUrl?: string;
  script: string;
  wordCount: number;
  audioLabel: string;
  audioSrc?: string;
  narrationEmbedded?: boolean;
  frames: StoryFrame[];
  engine: VisualEngineId;
  creditsCharged: number;
  preview?: boolean;
  mock?: boolean;
};

export type GenerateEvent =
  | {
      type: "progress";
      step: GenerateStepId;
      status: "started" | "completed";
      message: string;
      detail?: string;
    }
  | {
      type: "notice";
      message: string;
    }
  | {
      type: "complete";
      result: GenerateResult;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "rendering";
      statusUrl: string;
      responseUrl: string;
      ticket?: string;
      result: GenerateResult;
    };

export function previewScript(topic: string) {
  const subject = topic.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  return [
    `Alex: "${subject} only looks obvious from the outside."`,
    `Jordan: "The costly mistake is copying the surface and ignoring the real constraint."`,
    `Alex: "Name the limit, test it once, and keep the version that still works."`,
    `Jordan: "That is the part of ${subject} worth remembering."`,
  ].join("\n");
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function formatTimecode(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type MediaClip = {
  label: string;
  terms: string[];
  src: string;
};

const MEDIA_CLIPS: MediaClip[] = [
  {
    label: "Mind",
    terms: ["psychology", "mind", "brain", "thought", "habit", "memory", "mental"],
    src: "https://upload.wikimedia.org/wikipedia/commons/9/93/Axonal_nerve_fibers_in_a_brain_-_the_neural_network_that_is_us.webm",
  },
  {
    label: "Conversation",
    terms: ["conversation", "talk", "speak", "voice", "listen", "people", "crowd"],
    src: "https://upload.wikimedia.org/wikipedia/commons/2/28/Johannesburg_Pride_2013_-_Crowds_going_around_the_corner_of_William_Nicol_and_Sandton_Drive.webm",
  },
  {
    label: "City",
    terms: ["market", "cheap", "street", "city", "night", "shop", "price", "money"],
    src: "https://upload.wikimedia.org/wikipedia/commons/2/2d/Guntur-city-two-town-center.webm",
  },
  {
    label: "Nature",
    terms: ["nature", "ocean", "flower", "calm", "water", "tree", "green"],
    src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
  {
    label: "Motion",
    terms: ["move", "road", "car", "travel", "drive", "path"],
    src: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Porto_Santo_from_a_moving_car.webm",
  },
];

function scriptIncludesTerm(script: string, term: string) {
  return new RegExp(`\\b${term}\\b`, "i").test(script);
}

export function scanScriptForClips(script: string) {
  const matches = MEDIA_CLIPS.filter((clip) =>
    clip.terms.some((term) => scriptIncludesTerm(script, term)),
  );
  return matches.length > 0 ? matches : MEDIA_CLIPS;
}

export function chainVideoUrls(frames: StoryFrame[]) {
  const urls: string[] = [];
  for (const frame of frames) {
    let host = "";
    try {
      const url = new URL(frame.src);
      if (url.protocol !== "https:") continue;
      host = url.hostname;
    } catch {
      continue;
    }
    const fal =
      host === "fal.ai" ||
      host === "fal.media" ||
      host.endsWith(".fal.ai") ||
      host.endsWith(".fal.media") ||
      host.endsWith(".fal.run");
    if ((!fal && !isMockVideoUrl(frame.src)) || urls[urls.length - 1] === frame.src) continue;
    urls.push(frame.src);
  }
  return urls.slice(0, 12);
}

export function isMotionSrc(src: string) {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(src)) return true;
  try {
    const host = new URL(src).hostname;
    return host.endsWith(".fal.media") || host.endsWith(".fal.run") || host === "fal.media";
  } catch {
    return false;
  }
}

export function motionClip(src: string, caption: string, time = "0:00"): StoryFrame[] {
  const label = caption.replace(/\s+/g, " ").trim().slice(0, 80);
  return [{ time, caption: label || "Motion", term: "", src }];
}

export function sceneBlocks(frames: StoryFrame[]): StoryFrame[] {
  const motion = frames.filter((frame) => isMotionSrc(frame.src));
  const source = motion.length > 0 ? motion : frames;
  const seen = new Set<string>();
  const blocks: StoryFrame[] = [];
  for (const frame of source) {
    if (!frame.src || seen.has(frame.src)) continue;
    seen.add(frame.src);
    blocks.push(frame);
  }
  return blocks;
}

export function stitchExtension(previous: GenerateResult, extension: GenerateResult): GenerateResult {
  const durationSec = previous.durationSec + extension.durationSec;
  const script = `${previous.script.trim()}\n\n${extension.script.trim()}`;
  const nextBlocks = sceneBlocks(extension.frames).map((frame) => ({
    ...frame,
    time: formatTimecode(previous.durationSec),
  }));
  const frames = [...sceneBlocks(previous.frames), ...nextBlocks];
  return {
    ...previous,
    id: extension.id,
    durationSec,
    script,
    wordCount: countWords(script),
    frames: frames.length > 0 ? frames : previous.frames,
    creditsCharged: previous.creditsCharged + extension.creditsCharged,
    videoUrl: frames.length > 1 ? undefined : extension.videoUrl || previous.videoUrl,
    preview: false,
    narrationEmbedded: Boolean(previous.narrationEmbedded || extension.narrationEmbedded),
    audioLabel: extension.audioLabel || previous.audioLabel,
    audioSrc: extension.narrationEmbedded ? undefined : extension.audioSrc || previous.audioSrc,
  };
}

export function shiftFrames(frames: StoryFrame[], offsetSec: number): StoryFrame[] {
  return frames.map((frame, index) => ({
    ...frame,
    time: formatTimecode(offsetSec + index * FRAME_LENGTH_SEC),
  }));
}

export function buildTimeline(script: string, src: string, durationSec: number): StoryFrame[] {
  const count = Math.max(FRAME_COUNT, Math.round(durationSec / FRAME_LENGTH_SEC));
  const clips = scanScriptForClips(script);
  return Array.from({ length: count }, (_, index) => {
    const clip = clips[index % clips.length];
    const term = clip.terms.find((item) => scriptIncludesTerm(script, item)) ?? clip.terms[0];
    return {
      time: formatTimecode(index * FRAME_LENGTH_SEC),
      caption: clip.label,
      term,
      src,
    };
  });
}

export function buildStoryboard(script: string): StoryFrame[] {
  const clips = scanScriptForClips(script);

  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const clip = clips[index % clips.length];
    const term = clip.terms.find((item) => scriptIncludesTerm(script, item)) ?? clip.terms[0];
    return {
      time: formatTimecode(index * FRAME_LENGTH_SEC),
      caption: clip.label,
      term,
      src: clip.src,
    };
  });
}

export function isGenerateEvent(value: unknown): value is GenerateEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  const event = value as { type?: unknown; step?: unknown; status?: unknown; message?: unknown };
  if (event.type === "notice") {
    return typeof event.message === "string" && event.message.length > 0;
  }

  if (event.type === "complete" || event.type === "error") {
    return true;
  }

  if (event.type === "rendering") {
    const rendering = value as { statusUrl?: unknown; responseUrl?: unknown; result?: unknown };
    return (
      typeof rendering.statusUrl === "string" &&
      typeof rendering.responseUrl === "string" &&
      !!rendering.result &&
      typeof rendering.result === "object"
    );
  }

  if (event.type !== "progress") {
    return false;
  }

  const knownStep = GENERATE_STEPS.some((step) => step.id === event.step);
  return knownStep && (event.status === "started" || event.status === "completed");
}
