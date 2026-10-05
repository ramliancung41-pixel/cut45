import { FREE_TIER_CREDITS } from "@/lib/credits";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const STARTING_TOKENS = FREE_TIER_CREDITS;
export const PROFILES_TABLE = "profiles";

function tokenCount(value: unknown) {
  const tokens = Number(value);
  return Number.isFinite(tokens) ? tokens : STARTING_TOKENS;
}

export async function ensureProfile(userId: string, email: string) {
  try {
    const admin = createSupabaseAdminClient();
    const existing = await admin.from(PROFILES_TABLE).select("*").eq("id", userId).maybeSingle();
    if (existing.error) return FREE_TIER_CREDITS;
    if (existing.data) {
      return balanceFromRow(existing.data as Record<string, unknown>) ?? FREE_TIER_CREDITS;
    }

    const inserted = await admin.from(PROFILES_TABLE).insert({
      id: userId,
      email,
      credits: FREE_TIER_CREDITS,
      trial_claimed: true,
      tier: "free",
    });
    if (!inserted.error) return FREE_TIER_CREDITS;

    if (/trial_claimed|tier|column/i.test(inserted.error.message)) {
      const fallback = await admin.from(PROFILES_TABLE).insert({
        id: userId,
        email,
        credits: FREE_TIER_CREDITS,
      });
      if (!fallback.error) return FREE_TIER_CREDITS;
    }

    if (inserted.error.code === "23505") {
      const again = await admin.from(PROFILES_TABLE).select("*").eq("id", userId).maybeSingle();
      if (!again.error && again.data) {
        return balanceFromRow(again.data as Record<string, unknown>) ?? FREE_TIER_CREDITS;
      }
    }
    return FREE_TIER_CREDITS;
  } catch {
    return FREE_TIER_CREDITS;
  }
}

export async function findAuthUserId(email: string) {
  const admin = createSupabaseAdminClient();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error(listed.error.message);
  const match = listed.data.users.find((user) => user.email?.toLowerCase() === email);
  return match?.id ?? null;
}

export class ProfileGrantError extends Error {
  step: string;
  code?: string;
  details?: string | null;
  hint?: string | null;

  constructor(
    step: string,
    message: string,
    extra?: { code?: string; details?: string | null; hint?: string | null },
  ) {
    super(message);
    this.name = "ProfileGrantError";
    this.step = step;
    this.code = extra?.code;
    this.details = extra?.details ?? null;
    this.hint = extra?.hint ?? null;
  }
}

function grantError(
  step: string,
  error: { message?: string; code?: string; details?: string | null; hint?: string | null } | null,
  fallback: string,
) {
  return new ProfileGrantError(step, error?.message || fallback, {
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
}

export async function findProfileIdByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const found = await admin.from(PROFILES_TABLE).select("id, email").ilike("email", normalized);
  console.log("supabase profiles email", JSON.stringify({ error: found.error, count: found.data?.length ?? 0 }));
  if (found.error) throw grantError("profiles email", found.error, "Could not search profiles by email.");
  const match = (found.data ?? []).find(
    (row) => String(row.email ?? "").trim().toLowerCase() === normalized,
  );
  return typeof match?.id === "string" ? match.id : null;
}

export async function grantProfileCredits(input: {
  eventId: string;
  userId: string;
  email?: string | null;
  plan: "starter" | "pro" | "topup";
  credits: number;
}) {
  const admin = createSupabaseAdminClient();
  const claim = await admin
    .from("stripe_events")
    .insert({
      id: input.eventId,
      user_id: input.userId,
      plan: input.plan,
      credits: input.credits,
    })
    .select("*")
    .maybeSingle();
  console.log("supabase stripe_events insert", JSON.stringify({ data: claim.data, error: claim.error }));

  if (claim.error?.code === "23505") return { alreadyApplied: true as const };
  const missingEvents = Boolean(
    claim.error && /stripe_events|schema cache|relation/i.test(claim.error.message),
  );
  if (claim.error && !missingEvents) throw grantError("stripe_events insert", claim.error, "Could not record the payment.");

  const profileId = await resolveCreditProfileId(input.userId, input.email ?? null);
  const granted = await admin.rpc("add_user_credits", {
    user_id: profileId,
    credit_amount: input.credits,
  });
  console.log("supabase add_user_credits", JSON.stringify({ data: granted.data, error: granted.error }));
  if (!granted.error) {
    const credits = Number(granted.data);
    return {
      credits: Number.isFinite(credits) ? credits : input.credits,
      userId: profileId,
      via: "rpc" as const,
    };
  }

  console.error("supabase add_user_credits failed", granted.error.message);
  try {
    return await addCreditsOnProfile(profileId, input.credits);
  } catch (error) {
    if (!missingEvents) {
      const removed = await admin.from("stripe_events").delete().eq("id", input.eventId);
      console.log("supabase stripe_events delete", JSON.stringify({ data: removed.data, error: removed.error }));
    }
    throw error;
  }
}

async function resolveCreditProfileId(userId: string, email: string | null) {
  const admin = createSupabaseAdminClient();
  const byId = await admin.from(PROFILES_TABLE).select("id").eq("id", userId).maybeSingle();
  console.log("supabase profiles by id", JSON.stringify({ data: byId.data, error: byId.error }));
  if (byId.error) throw grantError("profiles select", byId.error, "Could not read the profile.");
  if (byId.data?.id) return byId.data.id;

  if (email) {
    const matched = await findProfileIdByEmail(email);
    if (matched) return matched;
  }

  const inserted = await admin
    .from(PROFILES_TABLE)
    .insert({ id: userId, email: email ?? "", credits: 0 })
    .select("id")
    .maybeSingle();
  console.log("supabase profiles insert", JSON.stringify({ data: inserted.data, error: inserted.error }));
  if (inserted.error || !inserted.data?.id) {
    throw grantError("profiles insert", inserted.error, "Profile not found.");
  }
  return inserted.data.id;
}

async function addCreditsOnProfile(userId: string, amount: number) {
  const admin = createSupabaseAdminClient();
  const current = await admin.from(PROFILES_TABLE).select("credits").eq("id", userId).maybeSingle();
  console.log("supabase profiles select", JSON.stringify({ data: current.data, error: current.error }));
  if (current.error) throw grantError("profiles select", current.error, "Could not read the profile.");
  if (!current.data) throw new ProfileGrantError("profiles select", "Profile not found.");

  const currentCredits = Number((current.data as { credits?: number | null }).credits);
  const next = (Number.isFinite(currentCredits) ? currentCredits : 0) + amount;
  const updated = await admin
    .from(PROFILES_TABLE)
    .update({ credits: next })
    .eq("id", userId)
    .select("credits")
    .maybeSingle();
  console.log(
    "supabase profiles credits update",
    JSON.stringify({ credits: next, data: updated.data, error: updated.error }),
  );
  if (updated.error) throw grantError("profiles update", updated.error, "Could not update the profile.");
  if (!updated.data) throw new ProfileGrantError("profiles update", "Profile not found.");
  return { credits: Number(updated.data.credits), userId, via: "profiles" as const };
}

export async function grantCheckoutCredits(input: {
  eventId: string;
  userId: string;
  plan: "starter" | "pro" | "topup";
  credits: number;
}) {
  const admin = createSupabaseAdminClient();
  const existing = await admin.from("stripe_events").select("id").eq("id", input.eventId).maybeSingle();
  if (existing.error && !/stripe_events|schema cache|relation/i.test(existing.error.message)) {
    throw new Error(existing.error.message);
  }
  if (existing.data) return { alreadyApplied: true as const };

  const before = await profileRow(input.userId);
  const beforeBalance = balanceFromRow(before);
  const granted = await admin.rpc("grant_checkout_credits", {
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_plan: input.plan,
    p_credits: input.credits,
  });
  if (!granted.error) {
    const after = await profileRow(input.userId);
    const afterBalance = balanceFromRow(after);
    if (
      before &&
      after &&
      beforeBalance != null &&
      afterBalance != null &&
      afterBalance < beforeBalance + input.credits
    ) {
      return { tokens: await writeDisplayedBalance(input.userId, after, beforeBalance + input.credits) };
    }
    return { tokens: afterBalance ?? Number(granted.data) };
  }

  const message = granted.error.message;
  if (/duplicate key|already applied/i.test(message)) {
    return { alreadyApplied: true as const };
  }
  if (!/grant_checkout_credits|schema cache|could not find the function/i.test(message)) {
    throw new Error(message);
  }

  const claimed = await admin.from("stripe_events").insert({
    id: input.eventId,
    user_id: input.userId,
    plan: input.plan,
    credits: input.credits,
  });
  if (claimed.error?.code === "23505") {
    return { alreadyApplied: true as const };
  }
  const missingEvents =
    claimed.error && /stripe_events|schema cache|relation/i.test(claimed.error.message);
  if (claimed.error && !missingEvents) {
    throw new Error(claimed.error.message);
  }

  const tokens = await addDisplayedCredits(input.userId, input.credits);
  return { tokens };
}

async function addDisplayedCredits(userId: string, credits: number) {
  const row = await profileRow(userId);
  if (!row) throw new Error("Profile not found.");
  const shown = balanceFromRow(row);
  if (shown == null) throw new Error("Profile not found.");
  return writeDisplayedBalance(userId, row, shown + credits);
}

async function writeDisplayedBalance(
  userId: string,
  row: Record<string, unknown>,
  next: number,
) {
  const patch: Record<string, number> = {};
  if ("credits" in row) patch.credits = next;
  if ("tokens" in row || !("credits" in row)) patch.tokens = next;
  const admin = createSupabaseAdminClient();
  const updated = await admin.from(PROFILES_TABLE).update(patch).eq("id", userId).select("*").maybeSingle();
  if (updated.error && "credits" in patch) {
    const tokensOnly = await admin
      .from(PROFILES_TABLE)
      .update({ tokens: next })
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    if (tokensOnly.error) throw new Error(tokensOnly.error.message);
    return balanceFromRow((tokensOnly.data as Record<string, unknown> | null) ?? null) ?? next;
  }
  if (updated.error) throw new Error(updated.error.message);
  return balanceFromRow((updated.data as Record<string, unknown> | null) ?? null) ?? next;
}

export async function readProfileLabel(userId: string) {
  try {
    const admin = createSupabaseAdminClient();
    const result = await admin.from(PROFILES_TABLE).select("*").eq("id", userId).maybeSingle();
    if (result.error || !result.data) return null;
    const row = result.data as Record<string, unknown>;
    for (const key of ["full_name", "display_name", "first_name", "name"]) {
      const value = row[key];
      if (typeof value === "string" && value.trim() && !value.includes("@")) {
        return value.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function balanceFromRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  if ("credits" in row && row.credits != null && row.credits !== "") {
    const credits = Number(row.credits);
    if (Number.isFinite(credits)) return credits;
  }
  if ("tokens" in row && row.tokens != null && row.tokens !== "") {
    return tokenCount(row.tokens);
  }
  return null;
}

async function profileRow(userId: string) {
  const admin = createSupabaseAdminClient();
  const result = await admin.from(PROFILES_TABLE).select("*").eq("id", userId).maybeSingle();
  if (result.error || !result.data) return null;
  return result.data as Record<string, unknown>;
}

export async function readProfileBalance(userId: string) {
  try {
    return balanceFromRow(await profileRow(userId));
  } catch {
    return null;
  }
}

export async function readProfileTokens(userId: string) {
  return readProfileBalance(userId);
}

export async function spendProfileCredits(userId: string, email: string, cost: number) {
  const safeCost = Math.max(0, Math.round(cost));
  try {
    let row = await profileRow(userId);
    if (!row) {
      await ensureProfile(userId, email);
      row = await profileRow(userId);
    }
    const current = balanceFromRow(row) ?? STARTING_TOKENS;
    const next = Math.max(0, current - safeCost);
    if (!row || safeCost === 0) return current;

    const patch: Record<string, number> = {};
    if ("credits" in row) patch.credits = next;
    if ("tokens" in row || !("credits" in row)) patch.tokens = next;

    const admin = createSupabaseAdminClient();
    const updated = await admin.from(PROFILES_TABLE).update(patch).eq("id", userId).select("*").maybeSingle();
    if (updated.error && "credits" in patch) {
      const tokensOnly = await admin
        .from(PROFILES_TABLE)
        .update({ tokens: next })
        .eq("id", userId)
        .select("*")
        .maybeSingle();
      return balanceFromRow((tokensOnly.data as Record<string, unknown> | null) ?? null) ?? next;
    }
    return balanceFromRow((updated.data as Record<string, unknown> | null) ?? null) ?? next;
  } catch {
    return null;
  }
}

export async function chargeProfileCredits(userId: string, email: string, cost: number) {
  const amount = Math.max(0, Math.round(cost));
  try {
    await ensureProfile(userId, email);
    const available = (await readProfileBalance(userId)) ?? 0;
    if (amount === 0) return { ok: true as const, credits: available };
    if (available < amount) return { ok: false as const, reason: "insufficient" as const };

    const admin = createSupabaseAdminClient();
    const spent = await admin.rpc("spend_user_credits", {
      user_id: userId,
      credit_amount: amount,
    });
    if (!spent.error) {
      if (spent.data == null || spent.data === "") {
        return { ok: false as const, reason: "insufficient" as const };
      }
      const credits = Number(spent.data);
      if (Number.isFinite(credits)) return { ok: true as const, credits };
    }
    const missingRpc = Boolean(
      spent.error && /spend_user_credits|schema cache|could not find the function/i.test(spent.error.message),
    );
    if (!missingRpc) return { ok: false as const, reason: "unavailable" as const };

    const updated = await admin
      .from(PROFILES_TABLE)
      .update({ credits: available - amount })
      .eq("id", userId)
      .gte("credits", amount)
      .select("credits")
      .maybeSingle();
    if (updated.error || !updated.data) {
      return { ok: false as const, reason: "insufficient" as const };
    }
    return { ok: true as const, credits: Number(updated.data.credits) };
  } catch {
    return { ok: false as const, reason: "unavailable" as const };
  }
}

export async function reserveGenerationCredits(
  userId: string,
  email: string,
  required: number,
  charge: number,
) {
  const needed = Math.max(0, Math.round(required));
  const amount = Math.max(0, Math.round(charge));
  try {
    await ensureProfile(userId, email);
    const available = (await readProfileBalance(userId)) ?? 0;
    if (available < needed || available < amount) {
      return { ok: false as const, reason: "insufficient" as const };
    }
    return chargeProfileCredits(userId, email, amount);
  } catch {
    return { ok: false as const, reason: "unavailable" as const };
  }
}

export async function refundProfileCredits(userId: string, cost: number) {
  const amount = Math.max(0, Math.round(cost));
  if (amount === 0) return;
  try {
    const admin = createSupabaseAdminClient();
    const refunded = await admin.rpc("add_user_credits", {
      user_id: userId,
      credit_amount: amount,
    });
    if (!refunded.error && refunded.data != null) return;
    const current = await admin.from(PROFILES_TABLE).select("credits").eq("id", userId).maybeSingle();
    const balance = Number(current.data?.credits);
    if (!Number.isFinite(balance)) return;
    await admin.from(PROFILES_TABLE).update({ credits: balance + amount }).eq("id", userId);
  } catch {
    return;
  }
}
