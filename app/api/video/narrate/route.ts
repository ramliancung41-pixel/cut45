import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { dialogueAudioLabel, parseDialogue } from "@/lib/dialogue";
import { isMockVideoUrl } from "@/lib/mock-video";
import { ElevenLabsQuotaError, synthesizeDialogue, synthesizeSpeech } from "@/lib/elevenlabs";
import { isAspectRatio, type AspectRatio } from "@/lib/frame";
import { deliverFrame, falMediaUrl, lipSyncVideo, muxVideoAudio, uploadAudio } from "@/lib/fal-video";
import { isNarrationLanguageId } from "@/lib/narration";
import { userFromAccessToken } from "@/lib/supabase/server";
import { getVoice, resolveVoiceId } from "@/lib/voices";

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
  const voice = getVoice(voiceId);
  if (!voice) {
    return NextResponse.json({ error: "Select a voice style." }, { status: 400 });
  }

  try {
    const turns = parseDialogue(script, voice.id);
    const spoken = turns
      ? await synthesizeDialogue({
          turns,
          language,
          signal: request.signal,
        })
      : await synthesizeSpeech({
          script,
          elevenLabsVoiceId: voice.elevenLabsVoiceId,
          language,
          signal: request.signal,
        });
    const audioLabel = turns ? dialogueAudioLabel(turns) : `${voice.name} · ElevenLabs`;
    const localVoice = spoken.audioSrc.startsWith("data:audio/wav");
    const voiceNote = localVoice ? "ElevenLabs did not answer, so a local male and female voice was used." : undefined;
    if (mock) {
      return NextResponse.json({
        audioSrc: spoken.audioSrc,
        audioLabel,
        videoUrl: videoUrl ?? undefined,
        embedded: false,
        mock: true,
        notice: voiceNote ?? "Dialogue is on the voice track. The stock picture stays in the timeline at 0:00.",
      });
    }
    if (!videoUrl) {
      return NextResponse.json({ audioSrc: spoken.audioSrc, audioLabel, embedded: false, ...(voiceNote ? { notice: voiceNote } : {}) });
    }

    const mime = spoken.bytes[0] === 0x52 && spoken.bytes[1] === 0x49 ? "audio/wav" : "audio/mpeg";
    const uploaded = await uploadAudio(spoken.bytes, request.signal, mime);
    if ("error" in uploaded) {
      return NextResponse.json({
        audioSrc: spoken.audioSrc,
        audioLabel,
        embedded: false,
        notice: voiceNote ?? uploaded.error,
      });
    }
    const [muxed, synced] = await Promise.all([
      muxVideoAudio(videoUrl, uploaded.fileUrl, request.signal),
      turns ? lipSyncVideo(videoUrl, uploaded.fileUrl, request.signal, 45000) : Promise.resolve({ error: "" }),
    ]);
    const withSound = "videoUrl" in synced ? synced.videoUrl : "videoUrl" in muxed ? muxed.videoUrl : "";
    if (!withSound) {
      const reason = "error" in muxed ? muxed.error : "Dialogue audio is ready.";
      return NextResponse.json({
        audioSrc: spoken.audioSrc,
        audioLabel,
        embedded: false,
        notice: voiceNote ?? reason,
      });
    }
    return NextResponse.json({
      videoUrl: await deliverFrame(withSound, request.signal, aspect),
      audioSrc: spoken.audioSrc,
      audioLabel,
      embedded: true,
      ...("videoUrl" in synced ? { lipSynced: true } : {}),
      ...(!("videoUrl" in synced) && turns
        ? { notice: voiceNote ?? "Dialogue audio is on the video. Mouth sync could not be applied." }
        : voiceNote
          ? { notice: voiceNote }
          : {}),
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
