import { chargeProfileCredits, ensureProfile, readProfileBalance } from "@/lib/profiles";
import {
  INSUFFICIENT_CREDITS_MESSAGE,
  VOICE_PREMIUM_CREDITS,
  videoCreditQuote,
  wantsVoiceover,
} from "@/lib/video-models";

export type GenerationCost = {
  userId: string;
  modelName: string;
  durationSec: number;
  resolution: string;
  ratePerSecond: number;
  videoCredits: number;
  voiceCredits: number;
  total: number;
};

export function calculateGenerationCost(input: {
  userId: string;
  modelName: string;
  duration: number;
  resolution: string;
  voiceId?: string | null;
}): GenerationCost {
  const quote = videoCreditQuote(input.modelName, input.resolution, input.duration);
  const voiceCredits = wantsVoiceover(input.voiceId) ? VOICE_PREMIUM_CREDITS : 0;
  return {
    userId: input.userId,
    modelName: quote.modelName,
    durationSec: quote.durationSec,
    resolution: quote.resolution,
    ratePerSecond: quote.ratePerSecond,
    videoCredits: quote.credits,
    voiceCredits,
    total: quote.credits + voiceCredits,
  };
}

export type VideoBilling = {
  userId: string;
  email: string;
  credits: number;
  voiceCredits: number;
};

export async function authorizeGenerationCredits(input: {
  userId: string;
  email: string;
  modelName: string;
  duration: number;
  resolution: string;
  voiceId?: string | null;
}): Promise<{ ok: true; billing: VideoBilling; cost: GenerationCost } | { ok: false; status: number; error: string }> {
  const cost = calculateGenerationCost(input);
  try {
    await ensureProfile(input.userId, input.email);
    const balance = await readProfileBalance(input.userId);
    if (balance == null) return { ok: false, status: 500, error: "Could not read the credit balance." };
    if (balance < cost.total) return { ok: false, status: 402, error: INSUFFICIENT_CREDITS_MESSAGE };
  } catch {
    return { ok: false, status: 500, error: "Could not read the credit balance." };
  }
  return {
    ok: true,
    cost,
    billing: { userId: input.userId, email: input.email, credits: cost.total, voiceCredits: cost.voiceCredits },
  };
}

// Runs only after every paid stage has succeeded; the charge fails rather than overdrawing the balance.
export async function deductGenerationCredits(billing: Pick<VideoBilling, "userId" | "email" | "credits">) {
  const charged = await chargeProfileCredits(billing.userId, billing.email, billing.credits);
  if (charged.ok) return { ok: true as const, balance: charged.credits };
  return {
    ok: false as const,
    error: charged.reason === "insufficient" ? INSUFFICIENT_CREDITS_MESSAGE : "Could not update the credit balance.",
  };
}
