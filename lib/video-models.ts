import type { VisualEngineId } from "@/lib/visual-engines";

export const VIDEO_CLIP_DURATIONS = [5, 10] as const;
export type VideoClipDuration = (typeof VIDEO_CLIP_DURATIONS)[number];

export const VIDEO_RESOLUTIONS = [
  { id: "360p", label: "360p", note: "SD · Low Cost" },
  { id: "720p", label: "720p", note: "HD · Standard" },
  { id: "1080p", label: "1080p", note: "Full HD · High Quality" },
] as const;

export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]["id"];

export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "1080p";

export type VideoModelTier = "budget" | "premium";

const BUDGET_CLIP_CREDITS: Record<VideoResolution, Record<VideoClipDuration, number>> = {
  "360p": { 5: 10, 10: 16 },
  "720p": { 5: 14, 10: 20 },
  "1080p": { 5: 18, 10: 25 },
};

// Premium Fal endpoints render 720p at minimum, so 360p is billed and rendered as 720p.
const PREMIUM_CLIP_CREDITS: Record<VideoResolution, Record<VideoClipDuration, number>> = {
  "360p": { 5: 60, 10: 140 },
  "720p": { 5: 60, 10: 140 },
  "1080p": { 5: 110, 10: 220 },
};

const TIER_CREDITS: Record<VideoModelTier, Record<VideoResolution, Record<VideoClipDuration, number>>> = {
  budget: BUDGET_CLIP_CREDITS,
  premium: PREMIUM_CLIP_CREDITS,
};

export const VIDEO_MODELS = [
  {
    id: "ltx",
    name: "LTX Video",
    shortName: "LTX Video",
    badge: "LOW COST",
    note: "Fast & budget-friendly",
    tier: "budget" as const,
    engine: "budget" as const,
    textEndpoint: "fal-ai/ltx-video-13b-distilled",
    imageEndpoint: "fal-ai/ltx-video-13b-distilled/image-to-video",
  },
  {
    id: "hunyuan",
    name: "Hunyuan Video / Fast SVD",
    shortName: "Hunyuan",
    badge: "NEW",
    note: "Open video models",
    tier: "budget" as const,
    engine: "budget" as const,
    textEndpoint: "fal-ai/hunyuan-video",
    imageEndpoint: "fal-ai/fast-svd-lcm",
  },
  {
    id: "runway",
    name: "Runway Gen-2 / Gen-3 Turbo",
    shortName: "Runway",
    badge: "HOT",
    note: "Cinematic motion",
    tier: "premium" as const,
    engine: "ultra" as const,
    textEndpoint: "fal-ai/runway-gen3/turbo/text-to-video",
    imageEndpoint: "fal-ai/runway-gen3/turbo/image-to-video",
  },
  {
    id: "pika",
    name: "Pika 2.2",
    shortName: "Pika 2.2",
    badge: "TRENDING",
    note: "5s and 10s clips",
    tier: "premium" as const,
    engine: "budget" as const,
    textEndpoint: "fal-ai/pika/v2.2/text-to-video",
    imageEndpoint: "fal-ai/pika/v2.2/image-to-video",
  },
] as const;

export type VideoModelId = (typeof VIDEO_MODELS)[number]["id"];

export const DEFAULT_VIDEO_MODEL: VideoModelId = "ltx";

export function isVideoModelId(value: string): value is VideoModelId {
  return VIDEO_MODELS.some((model) => model.id === value);
}

export function isVideoResolution(value: string): value is VideoResolution {
  return VIDEO_RESOLUTIONS.some((option) => option.id === value);
}

export function isVideoClipDuration(value: number): value is VideoClipDuration {
  return VIDEO_CLIP_DURATIONS.includes(value as VideoClipDuration);
}

export function getVideoModel(id: string | null | undefined) {
  return VIDEO_MODELS.find((model) => model.id === id) ?? VIDEO_MODELS[0];
}

export function videoModelEngine(id: string | null | undefined): Exclude<VisualEngineId, "stock"> {
  return getVideoModel(id).engine;
}

export function videoResolutionLabel(id: string | null | undefined) {
  return VIDEO_RESOLUTIONS.find((option) => option.id === id)?.label ?? "1080p";
}

export function resolveVideoResolution(value: string | null | undefined): VideoResolution {
  return typeof value === "string" && isVideoResolution(value) ? value : DEFAULT_VIDEO_RESOLUTION;
}

export function videoClipDuration(durationSec = 5): VideoClipDuration {
  return durationSec >= 10 ? 10 : 5;
}

export function videoModelTier(id: string | null | undefined): VideoModelTier {
  return getVideoModel(id).tier;
}

export function videoRenderResolution(model: string | null | undefined, resolution?: string | null): VideoResolution {
  const requested = resolveVideoResolution(resolution);
  return videoModelTier(model) === "premium" && requested === "360p" ? "720p" : requested;
}

export function videoClipCreditCost(model: string | null | undefined, resolution?: string | null, durationSec = 5) {
  return TIER_CREDITS[videoModelTier(model)][resolveVideoResolution(resolution)][videoClipDuration(durationSec)];
}

export function insufficientVideoCreditsMessage(resolution?: string | null, durationSec = 5) {
  return `Insufficient credits for ${resolveVideoResolution(resolution)} ${videoClipDuration(durationSec)}s generation`;
}
