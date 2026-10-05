import type { VisualEngineId } from "@/lib/visual-engines";

export const INITIAL_CREDITS = 0;
export const FREE_TIER_CREDITS = 60;
export const CHECKOUT_CONNECTING_MS = 2000;
export const STOCK_GENERATION_COST = 0;
export const BUDGET_GENERATION_COST = 45;
export const ULTRA_GENERATION_COST = 180;
export const BUDGET_IMAGE_GENERATION_COST = 45;
export const ULTRA_IMAGE_GENERATION_COST = 200;
export const IMAGE_GENERATION_COST = 10;
export const EXTEND_VIDEO_COST = 45;

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
  if (durationSec === 5) return BUDGET_GENERATION_COST;
  if (durationSec === 15) return 135;
  if (durationSec === 30) return 270;
  if (durationSec === 60) return 540;
  return null;
}

export function generationHoldCost(input: {
  extend: boolean;
  scene: boolean;
  continuation: boolean;
  engine: VisualEngineId;
  imageToVideo: boolean;
  durationSec?: number | null;
}) {
  const clipCost = input.extend
    ? EXTEND_VIDEO_COST
    : input.scene
      ? input.continuation
        ? EXTEND_VIDEO_COST
        : generationCreditCost("budget", input.imageToVideo)
      : generationCreditCost(input.engine, input.imageToVideo);
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
