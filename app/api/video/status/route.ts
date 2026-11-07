import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { continueFalClip } from "@/lib/fal-video";
import { isAspectRatio } from "@/lib/frame";
import { narrateClip, type NarratedClip } from "@/lib/narrate-clip";
import { isNarrationLanguageId } from "@/lib/narration";
import { readRenderTicket } from "@/lib/render-ticket";
import { userFromAccessToken } from "@/lib/supabase/server";
import { deductGenerationCredits } from "@/lib/video-billing";
import { resolveVoiceId } from "@/lib/voices";

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
    const rendered = await continueFalClip({
      statusUrl,
      responseUrl,
      signal: request.signal,
    });
    if ("pending" in rendered) return NextResponse.json({ pending: true });
    if (!("videoUrl" in rendered)) {
      console.error("[fal] video status failed; credits were not charged", rendered.error);
      return NextResponse.json({ error: rendered.error }, { status: 502 });
    }

    let narrated: NarratedClip | null = null;
    let voiceOk = true;
    const voiceId = ticket.voice ? resolveVoiceId(ticket.voice.voiceId) : null;
    if (ticket.voice && voiceId) {
      try {
        narrated = await narrateClip({
          script: ticket.voice.script,
          voiceId,
          language: isNarrationLanguageId(ticket.voice.language) ? ticket.voice.language : "auto",
          videoUrl: rendered.videoUrl,
          aspect: isAspectRatio(ticket.voice.aspect) ? ticket.voice.aspect : "9:16",
          mock: false,
          signal: request.signal,
        });
        voiceOk = narrated.elevenLabs;
      } catch (error) {
        if (request.signal.aborted) throw error;
        console.error("[elevenlabs] voiceover failed", error instanceof Error ? error.message : error);
        voiceOk = false;
      }
    }

    let creditsCharged = 0;
    if (ticket.credits > 0 && voiceOk) {
      const charged = await deductGenerationCredits({
        userId: user.id,
        email: ticket.email || user.email || "",
        credits: ticket.credits,
      });
      if (!charged.ok) return NextResponse.json({ error: charged.error }, { status: 402 });
      creditsCharged = ticket.credits;
    }

    return NextResponse.json({
      videoUrl: narrated?.embedded && narrated.videoUrl ? narrated.videoUrl : rendered.videoUrl,
      creditsCharged,
      ...(narrated
        ? { audioSrc: narrated.audioSrc, audioLabel: narrated.audioLabel, narrationEmbedded: narrated.embedded }
        : {}),
      ...(ticket.voice && !voiceOk
        ? { notice: "The ElevenLabs voiceover could not be recorded, so no credits were charged for this clip." }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal.ai status could not be reached.";
    console.error("[fal] video status failed; credits were not charged", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
