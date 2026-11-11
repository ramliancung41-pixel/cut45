import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type AgencyInboxRow = {
  name: string;
  email: string;
  packageId: string;
  packageName: string;
  message: string;
};

function missingColumn(message: string) {
  return message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

function schemaReload(message: string) {
  return /PGRST002|schema cache is unavailable|schema cache not/i.test(message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function liveColumns() {
  const admin = createSupabaseAdminClient();
  const spec = await admin.schema("public").getOpenApiSpec();
  const definition = spec.data?.definitions?.agency_requests as { properties?: Record<string, unknown> } | undefined;
  return { admin, columns: new Set(Object.keys(definition?.properties ?? {})) };
}

function rowPayload(row: AgencyInboxRow, columns: Set<string>) {
  const payload: Record<string, string> = {};
  const known = columns.size > 0;
  const use = (column: string) => !known || columns.has(column);
  if (use("name")) payload.name = row.name;
  if (use("email")) payload.email = row.email;
  if (use("package")) payload.package = row.packageId;
  if (use("package_name")) payload.package_name = row.packageName;
  if (use("message")) payload.message = row.message;
  if (use("note")) payload.note = row.message;
  return payload;
}

export async function countAgencyRequests() {
  try {
    const admin = createSupabaseAdminClient();
    const counted = await admin.schema("public").from("agency_requests").select("id", { count: "exact", head: true });
    if (counted.error) return null;
    return counted.count ?? 0;
  } catch {
    return null;
  }
}

export async function insertAgencyRequest(row: AgencyInboxRow) {
  const { admin, columns } = await liveColumns();
  const payload = rowPayload(row, columns);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const saved = await admin.schema("public").from("agency_requests").insert(payload).select("id").maybeSingle();
    if (!saved.error) return { ok: true as const };
    const column = missingColumn(saved.error.message);
    if (column && column in payload) {
      delete payload[column];
      if (!payload.name || !payload.email) return { ok: false as const };
      continue;
    }
    if (!schemaReload(saved.error.message) || attempt === 5) return { ok: false as const };
    await wait(300 * (attempt + 1));
  }
  return { ok: false as const };
}
