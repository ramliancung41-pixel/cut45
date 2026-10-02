import type { VisualEngineId } from "@/lib/visual-engines";

export const INITIAL_CREDITS = 0;
export const CHECKOUT_CONNECTING_MS = 2000;
export const PREMIUM_GENERATION_COST = 90;
export const STOCK_GENERATION_COST = 0;

export const STRIPE_CONNECTING_MESSAGE =
  "Connecting to Stripe secure checkout terminal...";

export function paymentApprovedMessage(credits: number) {
  return `Payment Approved! ${credits.toLocaleString("en-US")} Credits Added`;
}

export function generationCreditCost(engine: VisualEngineId) {
  return engine === "premium" ? PREMIUM_GENERATION_COST : STOCK_GENERATION_COST;
}

export function deductGenerationCredits(balance: number, engine: VisualEngineId) {
  return Math.max(0, balance - generationCreditCost(engine));
}

export function formatCreditTotal(credits: number) {
  return `${credits.toLocaleString("en-US")} credits`;
}
