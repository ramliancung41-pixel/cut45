import type { VisualEngineId } from "@/lib/visual-engines";

export const INITIAL_CREDITS = 0;
export const CHECKOUT_CONNECTING_MS = 2000;
export const STOCK_GENERATION_COST = 0;
export const BUDGET_GENERATION_COST = 45;
export const ULTRA_GENERATION_COST = 180;
export const BUDGET_IMAGE_GENERATION_COST = 60;
export const ULTRA_IMAGE_GENERATION_COST = 200;

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
