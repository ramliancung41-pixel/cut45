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

export async function grantProfileCredits(input: {
  eventId: string;
  userId: string;
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
  if (claim.error && !missingEvents) throw new Error(claim.error.message);

  const current = await admin.from(PROFILES_TABLE).select("*").eq("id", input.userId).maybeSingle();
  console.log("supabase profiles select", JSON.stringify({ data: current.data, error: current.error }));
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new Error("Profile not found.");

  const row = current.data as Record<string, unknown>;
  const currentCredits =
    "credits" in row && row.credits != null && row.credits !== ""
      ? Number(row.credits)
      : Number(row.tokens);
  const next = (Number.isFinite(currentCredits) ? currentCredits : 0) + input.credits;
  const patch: Record<string, number> = { credits: next };
  if ("tokens" in row) patch.tokens = next;

  let updated = await admin.from(PROFILES_TABLE).update(patch).eq("id", input.userId).select("*").maybeSingle();
  console.log(
    "supabase profiles credits update",
    JSON.stringify({ patch, data: updated.data, error: updated.error }),
  );

  if (updated.error && /credits|schema cache|column/i.test(updated.error.message)) {
    updated = await admin
      .from(PROFILES_TABLE)
      .update({ tokens: next })
      .eq("id", input.userId)
      .select("*")
      .maybeSingle();
    console.log("supabase profiles tokens update", JSON.stringify({ data: updated.data, error: updated.error }));
  }
  if (updated.error) {
    if (!missingEvents) {
      const removed = await admin.from("stripe_events").delete().eq("id", input.eventId);
      console.log("supabase stripe_events delete", JSON.stringify({ data: removed.data, error: removed.error }));
    }
    throw new Error(updated.error.message);
  }
  if (!updated.data) throw new Error("Profile not found.");

  const saved = updated.data as Record<string, unknown>;
  const credits =
    "credits" in saved && saved.credits != null && saved.credits !== "" ? Number(saved.credits) : next;
  return { credits };
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
