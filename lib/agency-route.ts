import { NextResponse } from "next/server";
import { insertAgencyRequest } from "@/lib/agency-inbox";
import { cleanAgencyRequest } from "@/lib/agency";

const RECEIVED = { success: true, saved: true, message: "Request received!" };

async function notifyAgency(request: { name: string; email: string; packageName: string; message: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AGENCY_FROM;
  if (!key || !from) return false;
  const inbox = process.env.AGENCY_INBOX || "support@codeandbuild.tech";
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

export async function postAgencyRequest(request: Request) {
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
  if (cleaned.ignored) return NextResponse.json(RECEIVED);

  try {
    const saved = await insertAgencyRequest({
      name: cleaned.request.name,
      email: cleaned.request.email,
      packageId: cleaned.request.packageId,
      packageName: cleaned.request.packageName,
      message: cleaned.request.message,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: "The request could not be saved." }, { status: 500 });
    }
    await notifyAgency(cleaned.request);
    return NextResponse.json(RECEIVED);
  } catch {
    return NextResponse.json({ error: "The request could not be saved." }, { status: 500 });
  }
}
