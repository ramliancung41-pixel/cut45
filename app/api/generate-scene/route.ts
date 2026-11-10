import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
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
  } | null;
  const actionPrompt = typeof body?.actionPrompt === "string" ? body.actionPrompt.trim() : "";
  const characterImageUrl = typeof body?.characterImageUrl === "string" ? body.characterImageUrl.trim() : "";
  if (actionPrompt.length < 3) {
    return NextResponse.json({ success: false, error: "Describe the video first." }, { status: 400 });
  }
  if (characterImageUrl && !characterImageUrl.startsWith("https://")) {
    return NextResponse.json({ success: false, error: "The character image must be an https URL." }, { status: 400 });
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

  const rendered = await renderFalLtx({
    prompt: actionPrompt,
    characterImageUrl,
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
