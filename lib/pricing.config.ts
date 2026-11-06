import { BILLING_PLANS, type BillingPlanId } from "@/lib/billing";
import type { VideoModelId } from "@/lib/video-models";

// Server billing (/api/generate, /api/video/status) reads these through lib/video-models.ts.
export const VIDEO_RATE_MATRIX = {
  Hunyuan: 3.6,
  "LTX Video": 3.6,
  SVD: 5,
  "Pika 2.2": 12,
  "Runway Gen-3 Turbo": 16,
  "Runway Gen-2": 20,
} as const;

export type VideoRateKey = keyof typeof VIDEO_RATE_MATRIX;

export type PricedResolution = "360p" | "720p" | "1080p";

export const RESOLUTION_MULTIPLIER: Record<PricedResolution, number> = {
  "360p": 1,
  "720p": 1.5,
  "1080p": 2.2,
};

export const VOICE_PREMIUM_CREDITS = 20;

function ceilCredits(value: number) {
  return Math.ceil(Math.round(value * 1e6) / 1e6);
}

/** Credits for one rendered clip: rate × seconds × resolution multiplier, rounded up. */
export function clipCredits(rateKey: VideoRateKey, billedResolution: PricedResolution, seconds: number) {
  return ceilCredits(VIDEO_RATE_MATRIX[rateKey] * seconds * RESOLUTION_MULTIPLIER[billedResolution]);
}

export type CreditPackId = BillingPlanId;

export type CreditPack = {
  id: CreditPackId;
  name: string;
  priceUsd: number;
  cadence: string;
  credits: number;
  popular: boolean;
};

export const CREDIT_PACKS: readonly CreditPack[] = BILLING_PLANS.map((plan) => ({
  id: plan.id,
  name: plan.name,
  priceUsd: Number(plan.price.replace(/[^0-9.]/g, "")),
  cadence: plan.cadence,
  credits: plan.creditGrant,
  popular: plan.featured,
}));

export const DEFAULT_PACK_ID: CreditPackId = CREDIT_PACKS.find((pack) => pack.popular)?.id ?? CREDIT_PACKS[0].id;
export const CREDIT_EXPIRY_MONTHS = 12;

export type TierId = "standard" | "pro" | "premium";

export type Tier = {
  id: TierId;
  label: string;
  modelId: VideoModelId;
  modelLabel: string;
  rateKey: VideoRateKey;
  /** Must be a resolution the model renders natively, so the server bills exactly this. */
  resolution: PricedResolution;
};

export const TIERS: readonly Tier[] = [
  { id: "standard", label: "Standard", modelId: "ltx", modelLabel: "LTX Video", rateKey: "LTX Video", resolution: "360p" },
  { id: "pro", label: "Pro", modelId: "pika", modelLabel: "Pika 2.2", rateKey: "Pika 2.2", resolution: "720p" },
  {
    id: "premium",
    label: "Premium",
    modelId: "runway",
    modelLabel: "Runway Gen-3 Turbo",
    rateKey: "Runway Gen-3 Turbo",
    resolution: "720p",
  },
];

export const DEFAULT_TIER_ID: TierId = "standard";

export const STORY_SECONDS = 45;
export const SCENE_SECONDS_OPTIONS = [5, 10] as const;
export type SceneSeconds = (typeof SCENE_SECONDS_OPTIONS)[number];
export const DEFAULT_SCENE_SECONDS: SceneSeconds = 5;
export const DEFAULT_SCENE_COUNT = STORY_SECONDS / DEFAULT_SCENE_SECONDS;

export const MUSIC_TRACK_CREDITS = 5;
export const MUSIC_TRACK_AVAILABLE = false;
export const PROMPT_IMPROVE_FREE_PER_DAY = 5;
export const PROMPT_IMPROVE_CREDITS = 1;
export const STITCHED_EXPORT_1080P_CREDITS = 0;
export const NEW_USER_TRIAL_CREDITS = 20;

export function tierById(id: TierId): Tier {
  return TIERS.find((tier) => tier.id === id) ?? TIERS[0];
}

export function packById(id: CreditPackId): CreditPack {
  return CREDIT_PACKS.find((pack) => pack.id === id) ?? CREDIT_PACKS[0];
}

export function tierCreditsPerSecond(id: TierId) {
  const tier = tierById(id);
  return VIDEO_RATE_MATRIX[tier.rateKey] * RESOLUTION_MULTIPLIER[tier.resolution];
}

/** Exactly what /api/generate charges for one voiceless scene on this tier. */
export function sceneCost(tier: TierId, seconds: number) {
  const entry = tierById(tier);
  return clipCredits(entry.rateKey, entry.resolution, seconds);
}

const DEFAULT_SCENES: number[] = Array.from({ length: DEFAULT_SCENE_COUNT }, () => DEFAULT_SCENE_SECONDS);

export function storyCost(tier: TierId, musicOn: boolean, sceneSeconds: readonly number[] = DEFAULT_SCENES) {
  const scenes = sceneSeconds.reduce((sum, seconds) => sum + sceneCost(tier, seconds), 0);
  return scenes + (musicOn && MUSIC_TRACK_AVAILABLE ? MUSIC_TRACK_CREDITS : 0);
}

export function pricePerCredit(packId: CreditPackId) {
  const pack = packById(packId);
  return pack.priceUsd / pack.credits;
}

export function formatCredits(n: number) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "credit" : "credits"}`;
}

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: amount > 0 && amount < 0.1 ? 3 : 2,
  }).format(amount);
}

export function approxPrice(credits: number, packId: CreditPackId) {
  return formatUsd(credits * pricePerCredit(packId));
}
