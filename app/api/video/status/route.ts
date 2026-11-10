import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { continueVeoClip } from "@/lib/google-veo";
import { readRenderTicket } from "@/lib/render-ticket";
import { userFromAccessToken } from "@/lib/supabase/server";
import { deductGenerationCredits } from "@/lib/video-billing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in before checking a render." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    statusUrl?: unknown;
    responseUrl?: unknown;
    ticket?: unknown;
  } | null;
  const statusUrl = typeof body?.statusUrl === "string" ? body.statusUrl : "";
  const responseUrl = typeof body?.responseUrl === "string" ? body.responseUrl : "";
  if (!statusUrl || !responseUrl) {
    return NextResponse.json({ error: "The render job is missing." }, { status: 400 });
  }
  const ticket = readRenderTicket(body?.ticket, responseUrl);
  if (!ticket || (ticket.userId && ticket.userId !== user.id)) {
    return NextResponse.json({ error: "This render job does not belong to your account." }, { status: 403 });
  }

  try {
    const rendered = await continueVeoClip({
      operationName: responseUrl || statusUrl,
      signal: request.signal,
    });
    if ("pending" in rendered) return NextResponse.json({ pending: true });
    if (!("videoUrl" in rendered)) {
      console.error("[veo] video status failed; credits were not charged", rendered.error);
      return NextResponse.json({ error: rendered.error }, { status: 502 });
    }

    let creditsCharged = 0;
    if (ticket.credits > 0) {
      const charged = await deductGenerationCredits({
        userId: user.id,
        email: ticket.email || user.email || "",
        credits: ticket.credits,
      });
      if (!charged.ok) return NextResponse.json({ error: charged.error }, { status: 402 });
      creditsCharged = ticket.credits;
    }

    return NextResponse.json({
      videoUrl: rendered.videoUrl,
      creditsCharged,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Veo status could not be reached.";
    console.error("[veo] video status failed; credits were not charged", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
