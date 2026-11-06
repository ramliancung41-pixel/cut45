import {
  RESOLUTION_MULTIPLIER,
  VIDEO_RATE_MATRIX,
  VOICE_PREMIUM_CREDITS,
  clipCredits,
  type VideoRateKey,
} from "@/lib/pricing.config";
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

export { RESOLUTION_MULTIPLIER, VIDEO_RATE_MATRIX, VOICE_PREMIUM_CREDITS, type VideoRateKey };

type RenderPlan = Record<VideoResolution, { api: string; billed: VideoResolution }>;

// Each model is billed for the resolution its Fal endpoint actually renders.
const CAPPED_AT_720: RenderPlan = {
  "360p": { api: "480p", billed: "360p" },
  "720p": { api: "720p", billed: "720p" },
  "1080p": { api: "720p", billed: "720p" },
};
const FROM_720: RenderPlan = {
  "360p": { api: "720p", billed: "720p" },
  "720p": { api: "720p", billed: "720p" },
  "1080p": { api: "1080p", billed: "1080p" },
};
const ANY_SIZE: RenderPlan = {
  "360p": { api: "360p", billed: "360p" },
  "720p": { api: "720p", billed: "720p" },
  "1080p": { api: "1080p", billed: "1080p" },
};

export const VIDEO_MODELS = [
  {
    id: "ltx",
    name: "LTX Video",
    shortName: "LTX Video",
    badge: "LOW COST",
    note: "Fast & budget-friendly",
    tier: "budget" as const,
    rateKey: "LTX Video" as const,
    render: CAPPED_AT_720,
    aliases: ["ltx video", "ltx"],
    engine: "budget" as const,
    textEndpoint: "fal-ai/ltx-video-13b-distilled",
    imageEndpoint: "fal-ai/ltx-video-13b-distilled/image-to-video",
  },
  {
    id: "hunyuan",
    name: "Hunyuan Video",
    shortName: "Hunyuan",
    badge: "NEW",
    note: "Open-source cinematic model",
    tier: "budget" as const,
    rateKey: "Hunyuan" as const,
    render: CAPPED_AT_720,
    aliases: ["hunyuan video", "hunyuan"],
    engine: "budget" as const,
    textEndpoint: "fal-ai/hunyuan-video",
    imageEndpoint: "fal-ai/hunyuan-video-image-to-video",
  },
  {
    id: "svd",
    name: "Stable Video Diffusion",
    shortName: "SVD",
    badge: "LOW COST",
    note: "Fast SVD turbo clips",
    tier: "budget" as const,
    rateKey: "SVD" as const,
    render: ANY_SIZE,
    aliases: ["svd", "fast svd", "stable video diffusion"],
    engine: "budget" as const,
    textEndpoint: "fal-ai/fast-svd-lcm/text-to-video",
    imageEndpoint: "fal-ai/fast-svd-lcm",
  },
  {
    id: "pika",
    name: "Pika 2.2",
    shortName: "Pika 2.2",
    badge: "TRENDING",
    note: "5s and 10s clips",
    tier: "premium" as const,
    rateKey: "Pika 2.2" as const,
    render: FROM_720,
    aliases: ["pika 2.2", "pika"],
    engine: "budget" as const,
    textEndpoint: "fal-ai/pika/v2.2/text-to-video",
    imageEndpoint: "fal-ai/pika/v2.2/image-to-video",
  },
  {
    id: "runway",
    name: "Runway Gen-3 Turbo",
    shortName: "Runway",
    badge: "HOT",
    note: "Cinematic motion",
    tier: "premium" as const,
    rateKey: "Runway Gen-3 Turbo" as const,
    render: FROM_720,
    aliases: ["runway gen-3 turbo", "runway gen-3", "runway"],
    engine: "ultra" as const,
    textEndpoint: "fal-ai/runway-gen3/turbo/text-to-video",
    imageEndpoint: "fal-ai/runway-gen3/turbo/image-to-video",
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

export function videoRenderPlan(model: string | null | undefined, resolution?: string | null) {
  return getVideoModel(model).render[resolveVideoResolution(resolution)];
}

export function videoRenderResolution(model: string | null | undefined, resolution?: string | null) {
  return videoRenderPlan(model, resolution).api;
}

export function findVideoModel(nameOrId: string | null | undefined) {
  const key = (nameOrId ?? "").trim().toLowerCase();
  if (!key) return null;
  return (
    VIDEO_MODELS.find(
      (model) =>
        model.id === key ||
        model.name.toLowerCase() === key ||
        model.shortName.toLowerCase() === key ||
        model.rateKey.toLowerCase() === key ||
        model.aliases.some((alias) => alias === key),
    ) ?? null
  );
}

function findRateKey(nameOrId: string | null | undefined): VideoRateKey {
  const key = (nameOrId ?? "").trim().toLowerCase();
  const direct = (Object.keys(VIDEO_RATE_MATRIX) as VideoRateKey[]).find((name) => name.toLowerCase() === key);
  return direct ?? findVideoModel(nameOrId)?.rateKey ?? VIDEO_MODELS[0].rateKey;
}

export function videoCreditQuote(model: string | null | undefined, resolution?: string | null, durationSec = 5) {
  const rateKey = findRateKey(model);
  const entry = findVideoModel(model);
  const requested = resolveVideoResolution(resolution);
  const billedResolution = entry ? entry.render[requested].billed : requested;
  const seconds = videoClipDuration(durationSec);
  const ratePerSecond = VIDEO_RATE_MATRIX[rateKey];
  const multiplier = RESOLUTION_MULTIPLIER[billedResolution];
  return {
    model: entry?.id ?? null,
    modelName: rateKey,
    resolution: billedResolution,
    durationSec: seconds,
    ratePerSecond,
    multiplier,
    credits: clipCredits(rateKey, billedResolution, seconds),
  };
}

export function videoClipCreditCost(model: string | null | undefined, resolution?: string | null, durationSec = 5) {
  return videoCreditQuote(model, resolution, durationSec).credits;
}

export function wantsVoiceover(voiceId: string | null | undefined) {
  const value = (voiceId ?? "").trim().toLowerCase();
  return value.length > 0 && value !== "none" && value !== "null";
}

export function generationCreditTotal(
  model: string | null | undefined,
  resolution: string | null | undefined,
  durationSec: number,
  voiceId: string | null | undefined,
) {
  return videoClipCreditCost(model, resolution, durationSec) + (wantsVoiceover(voiceId) ? VOICE_PREMIUM_CREDITS : 0);
}

export const INSUFFICIENT_CREDITS_MESSAGE = "Insufficient credits";
