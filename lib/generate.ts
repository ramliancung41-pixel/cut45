export const VIDEO_DURATION_SEC = 45;
export const FRAME_COUNT = 9;
export const FRAME_LENGTH_SEC = 5;

export const GENERATE_STEPS = [
  { id: "script", label: "Generating script" },
  { id: "audio", label: "Generating audio" },
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
  durationSec: typeof VIDEO_DURATION_SEC;
  script: string;
  wordCount: number;
  audioLabel: string;
  audioSrc?: string;
  frames: StoryFrame[];
  engine: "stock" | "premium";
  creditsCharged: number;
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
      type: "complete";
      result: GenerateResult;
    }
  | {
      type: "error";
      message: string;
    };

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

  const event = value as { type?: unknown; step?: unknown; status?: unknown };
  if (event.type === "complete" || event.type === "error") {
    return true;
  }

  if (event.type !== "progress") {
    return false;
  }

  const knownStep = GENERATE_STEPS.some((step) => step.id === event.step);
  return knownStep && (event.status === "started" || event.status === "completed");
}
