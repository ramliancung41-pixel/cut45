import { NextResponse, type NextRequest } from "next/server";
import { cleanAgencyRequest } from "@/lib/agency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function missingTable(message: string) {
  return /agency_requests/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

async function notifyAgency(request: { name: string; email: string; packageName: string; message: string }) {
  const key = process.env.RESEND_API_KEY;
  const inbox = process.env.AGENCY_INBOX || "support@codeandbuild.tech";
  const from = process.env.AGENCY_FROM;
  if (!key || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [inbox],
      reply_to: request.email,
      subject: `Website request: ${request.packageName}`,
      text: `${request.name} <${request.email}>\n${request.packageName}\n\n${request.message}`,
    }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    packageId?: unknown;
    message?: unknown;
    company?: unknown;
  } | null;
  const cleaned = cleanAgencyRequest(body ?? {});
  if (!cleaned.ok) {
    return NextResponse.json({ error: "Add your name, email, package, and a short note." }, { status: 400 });
  }
  if (cleaned.ignored) return NextResponse.json({ saved: true, emailed: false });

  try {
    const admin = createSupabaseAdminClient();
    const saved = await admin.from("agency_requests").insert({
      name: cleaned.request.name,
      email: cleaned.request.email,
      package: cleaned.request.packageId,
      message: cleaned.request.message,
    });
    if (saved.error) {
      if (missingTable(saved.error.message)) {
        return NextResponse.json(
          { error: "The request inbox is not ready. Run supabase/agency.sql in the Supabase SQL editor." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "The request could not be saved." }, { status: 500 });
    }
    const emailed = await notifyAgency(cleaned.request);
    return NextResponse.json({ saved: true, emailed });
  } catch {
    return NextResponse.json({ error: "The request could not be saved." }, { status: 500 });
  }
}
