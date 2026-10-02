import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const STARTING_TOKENS = 100;
export const PROFILES_TABLE = "profiles";

function tokenCount(value: unknown) {
  const tokens = Number(value);
  return Number.isFinite(tokens) ? tokens : STARTING_TOKENS;
}

export async function ensureProfile(userId: string, email: string) {
  try {
    const admin = createSupabaseAdminClient();
    const existing = await admin
      .from(PROFILES_TABLE)
      .select("tokens")
      .eq("id", userId)
      .maybeSingle();

    if (existing.error) return STARTING_TOKENS;
    if (existing.data) return tokenCount(existing.data.tokens);

    const inserted = await admin.from(PROFILES_TABLE).insert({
      id: userId,
      email,
      tokens: STARTING_TOKENS,
    });
    if (!inserted.error) return STARTING_TOKENS;

    if (inserted.error.code === "23505") {
      const again = await admin
        .from(PROFILES_TABLE)
        .select("tokens")
        .eq("id", userId)
        .maybeSingle();
      if (!again.error && again.data) return tokenCount(again.data.tokens);
    }
    return STARTING_TOKENS;
  } catch {
    return STARTING_TOKENS;
  }
}

export async function findAuthUserId(email: string) {
  const admin = createSupabaseAdminClient();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error(listed.error.message);
  const match = listed.data.users.find((user) => user.email?.toLowerCase() === email);
  return match?.id ?? null;
}

export async function grantCheckoutCredits(input: {
  eventId: string;
  userId: string;
  plan: "starter" | "pro" | "topup";
  credits: number;
}) {
  const admin = createSupabaseAdminClient();
  const granted = await admin.rpc("grant_checkout_credits", {
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_plan: input.plan,
    p_credits: input.credits,
  });
  if (!granted.error) {
    return { tokens: Number(granted.data) };
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

  const current = await admin
    .from(PROFILES_TABLE)
    .select("tokens")
    .eq("id", input.userId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new Error("Profile not found.");

  const tokens = Number(current.data.tokens) + input.credits;
  const updated = await admin
    .from(PROFILES_TABLE)
    .update({ tokens })
    .eq("id", input.userId)
    .select("tokens")
    .single();
  if (updated.error) throw new Error(updated.error.message);
  return { tokens: Number(updated.data.tokens) };
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
