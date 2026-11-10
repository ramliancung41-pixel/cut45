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

export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "720p";

export type VideoModelTier = "budget" | "premium";

export { RESOLUTION_MULTIPLIER, VIDEO_RATE_MATRIX, VOICE_PREMIUM_CREDITS, type VideoRateKey };

type RenderPlan = Record<VideoResolution, { api: string; billed: VideoResolution }>;

// Each model is billed for the resolution its Fal endpoint actually renders.
const ANY_SIZE: RenderPlan = {
  "360p": { api: "360p", billed: "360p" },
  "720p": { api: "720p", billed: "720p" },
  "1080p": { api: "1080p", billed: "1080p" },
};

export const VIDEO_MODELS = [
  {
    id: "wan",
    name: "Veo 3.1 Lite",
    shortName: "Veo",
    badge: "LOW COST",
    note: "3 credits per second",
    tier: "budget" as const,
    rateKey: "Veo" as const,
    render: ANY_SIZE,
    aliases: ["wan", "ltx", "ltx video"],
    engine: "budget" as const,
    textEndpoint: "fal-ai/ltx-video",
    imageEndpoint: "fal-ai/ltx-video/image-to-video",
  },
] as const;

export type VideoModelId = (typeof VIDEO_MODELS)[number]["id"];

export const DEFAULT_VIDEO_MODEL: VideoModelId = "wan";

export function isVideoModelId(value: string): value is VideoModelId {
  return VIDEO_MODELS.some((model) => model.id === value);
}

export function isVideoResolution(value: string): value is VideoResolution {
  return VIDEO_RESOLUTIONS.some((option) => option.id === value);
}

export function isVideoClipDuration(value: number): value is VideoClipDuration {
  return VIDEO_CLIP_DURATIONS.includes(value as VideoClipDuration);
}

export function getVideoModel(_id: string | null | undefined) {
  return VIDEO_MODELS[0];
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
  const billedResolution = "720p" as const;
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
