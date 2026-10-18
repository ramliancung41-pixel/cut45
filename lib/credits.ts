import type { VisualEngineId } from "@/lib/visual-engines";
import { videoClipCreditCost, type VideoModelId, type VideoResolution } from "@/lib/video-models";

export const INITIAL_CREDITS = 0;
export const FREE_TIER_CREDITS = 60;
export const CHECKOUT_CONNECTING_MS = 2000;
export const STOCK_GENERATION_COST = 0;
export const CREDITS_PER_SECOND = 2;
export const BUDGET_GENERATION_COST = 10;
export const ULTRA_GENERATION_COST = 180;
export const BUDGET_IMAGE_GENERATION_COST = 10;
export const ULTRA_IMAGE_GENERATION_COST = 200;
export const IMAGE_GENERATION_COST = 10;
export const EXTEND_VIDEO_COST = 90;

const GENERATION_COST: Record<VisualEngineId, number> = {
  stock: STOCK_GENERATION_COST,
  budget: BUDGET_GENERATION_COST,
  ultra: ULTRA_GENERATION_COST,
};

export const STRIPE_CONNECTING_MESSAGE =
  "Connecting to Stripe secure checkout terminal...";

export function paymentApprovedMessage(credits: number) {
  return `Payment Approved! ${credits.toLocaleString("en-US")} Credits Added`;
}

export function durationCreditCost(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  return Math.round(durationSec * CREDITS_PER_SECOND);
}

export function generationHoldCost(input: {
  extend: boolean;
  scene: boolean;
  continuation: boolean;
  engine: VisualEngineId;
  imageToVideo: boolean;
  durationSec?: number | null;
  videoModel?: VideoModelId | null;
  resolution?: VideoResolution | null;
}) {
  const clipSeconds = input.durationSec && input.durationSec >= 10 ? 10 : 5;
  const singleSeconds =
    !input.extend && !input.scene && input.engine === "budget" && input.durationSec && input.durationSec > 5 && input.durationSec <= 10
      ? input.durationSec
      : null;
  const modelCost =
    !input.extend && !input.scene
      ? videoClipCreditCost(input.videoModel, input.resolution, clipSeconds)
      : null;
  const clipCost = input.extend
    ? durationCreditCost(45) ?? EXTEND_VIDEO_COST
    : input.scene
      ? durationCreditCost(5) ?? BUDGET_GENERATION_COST
      : modelCost ??
        (singleSeconds
        ? durationCreditCost(singleSeconds) ?? generationCreditCost(input.engine, input.imageToVideo)
        : generationCreditCost(input.engine, input.imageToVideo));
  const scheduled =
    input.scene && !input.continuation && input.durationSec
      ? durationCreditCost(input.durationSec)
      : null;
  const required = scheduled == null ? clipCost : Math.max(clipCost, scheduled);
  return { clipCost, required };
}

export function generationCreditCost(engine: VisualEngineId, imageToVideo = false) {
  if (imageToVideo && engine === "budget") return BUDGET_IMAGE_GENERATION_COST;
  if (imageToVideo && engine === "ultra") return ULTRA_IMAGE_GENERATION_COST;
  return GENERATION_COST[engine];
}

export function deductGenerationCredits(
  balance: number,
  engine: VisualEngineId,
  imageToVideo = false,
) {
  return Math.max(0, balance - generationCreditCost(engine, imageToVideo));
}

export function formatCreditTotal(credits: number) {
  return `${credits.toLocaleString("en-US")} credits`;
}
