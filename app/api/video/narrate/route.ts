import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { isMockVideoUrl } from "@/lib/mock-video";
import { ElevenLabsQuotaError } from "@/lib/elevenlabs";
import { isAspectRatio, type AspectRatio } from "@/lib/frame";
import { falMediaUrl } from "@/lib/fal-video";
import { narrateClip } from "@/lib/narrate-clip";
import { isNarrationLanguageId } from "@/lib/narration";
import { userFromAccessToken } from "@/lib/supabase/server";
import { resolveVoiceId } from "@/lib/voices";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in before recording narration." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    videoUrl?: unknown;
    script?: unknown;
    voice?: unknown;
    language?: unknown;
    mock?: unknown;
    aspect?: unknown;
  } | null;
  const script = typeof body?.script === "string" ? body.script.trim() : "";
  const voiceId = typeof body?.voice === "string" ? resolveVoiceId(body.voice) : null;
  const language = typeof body?.language === "string" && isNarrationLanguageId(body.language) ? body.language : "auto";
  const requestedVideo = typeof body?.videoUrl === "string" ? body.videoUrl : "";
  const mock = body?.mock === true || isMockVideoUrl(requestedVideo);
  const aspect: AspectRatio = typeof body?.aspect === "string" && isAspectRatio(body.aspect) ? body.aspect : "9:16";
  const videoUrl = requestedVideo ? falMediaUrl(requestedVideo) ?? (isMockVideoUrl(requestedVideo) ? requestedVideo : null) : null;
  if (script.length < 8) {
    return NextResponse.json({ error: "The narration is too short to record." }, { status: 400 });
  }
  if (!voiceId) {
    return NextResponse.json({ error: "Select a voice style." }, { status: 400 });
  }
  if (requestedVideo && !videoUrl) {
    return NextResponse.json({ error: "The finished video cannot take a narration track." }, { status: 400 });
  }

  try {
    const narrated = await narrateClip({ script, voiceId, language, videoUrl, aspect, mock, signal: request.signal });
    return NextResponse.json({
      audioSrc: narrated.audioSrc,
      audioLabel: narrated.audioLabel,
      embedded: narrated.embedded,
      ...(narrated.videoUrl ? { videoUrl: narrated.videoUrl } : {}),
      ...(narrated.lipSynced ? { lipSynced: true } : {}),
      ...(mock ? { mock: true } : {}),
      ...(narrated.notice ? { notice: narrated.notice } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Narration was stopped." }, { status: 499 });
    }
    const message =
      error instanceof ElevenLabsQuotaError || error instanceof Error
        ? error.message
        : "Could not record the character dialogue.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
