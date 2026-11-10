import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { extractLastFrame, parseReferenceImage } from "@/lib/fal-video";
import { renderFalLtx } from "@/lib/fal-ltx";
import { ensureProfile, readProfileBalance } from "@/lib/profiles";
import { userFromAccessToken } from "@/lib/supabase/server";
import { deductGenerationCredits } from "@/lib/video-billing";
import { INSUFFICIENT_CREDITS_MESSAGE } from "@/lib/video-models";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLIP_CREDITS = 15;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    actionPrompt?: unknown;
    characterImageUrl?: unknown;
    continueFromVideoUrl?: unknown;
  } | null;
  const actionPrompt = typeof body?.actionPrompt === "string" ? body.actionPrompt.trim() : "";
  const characterImageUrl = typeof body?.characterImageUrl === "string" ? body.characterImageUrl.trim() : "";
  const continueFromVideoUrl = typeof body?.continueFromVideoUrl === "string" ? body.continueFromVideoUrl.trim() : "";
  if (actionPrompt.length < 3) {
    return NextResponse.json({ success: false, error: "Describe the video first." }, { status: 400 });
  }
  const characterImage = characterImageUrl.startsWith("data:") ? parseReferenceImage(characterImageUrl) : null;
  if (characterImage === "invalid") {
    return NextResponse.json({ success: false, error: "The character image could not be read." }, { status: 400 });
  }
  if (characterImageUrl && !characterImageUrl.startsWith("https://") && !characterImage) {
    return NextResponse.json({ success: false, error: "The character image must be an https URL." }, { status: 400 });
  }
  if (continueFromVideoUrl && !continueFromVideoUrl.startsWith("https://")) {
    return NextResponse.json({ success: false, error: "The previous video could not be continued." }, { status: 400 });
  }

  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id || !user.email) {
    return NextResponse.json({ success: false, error: "Sign in before spending credits." }, { status: 401 });
  }

  try {
    await ensureProfile(user.id, user.email);
    const balance = await readProfileBalance(user.id);
    if (balance == null) {
      return NextResponse.json({ success: false, error: "Could not read the credit balance." }, { status: 500 });
    }
    if (balance < CLIP_CREDITS) {
      return NextResponse.json({ success: false, error: INSUFFICIENT_CREDITS_MESSAGE }, { status: 402 });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Could not read the credit balance." }, { status: 500 });
  }

  let startFrameUrl = "";
  if (continueFromVideoUrl) {
    const frame = await extractLastFrame(continueFromVideoUrl, request.signal);
    if ("error" in frame || !frame.imageUrl) {
      return NextResponse.json(
        { success: false, error: "error" in frame ? frame.error : "The last frame could not be read." },
        { status: 502 },
      );
    }
    startFrameUrl = frame.imageUrl;
  }

  const rendered = await renderFalLtx({
    prompt: actionPrompt,
    characterImageUrl: startFrameUrl || (characterImage ? "" : characterImageUrl),
    image: startFrameUrl ? null : characterImage,
    startFrameUrl,
    durationSec: 5,
  });
  if (!("videoUrl" in rendered)) {
    return NextResponse.json({ success: false, error: rendered.error }, { status: 502 });
  }

  const charged = await deductGenerationCredits({
    userId: user.id,
    email: user.email,
    credits: CLIP_CREDITS,
  });
  if (!charged.ok) {
    return NextResponse.json({ success: false, error: charged.error }, { status: 402 });
  }

  return NextResponse.json({ success: true, videoUrl: rendered.videoUrl });
}
