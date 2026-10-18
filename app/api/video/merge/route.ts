import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { logApiKey } from "@/lib/api-keys";
import { isAspectRatio, type AspectRatio } from "@/lib/frame";
import { deliverFrame, mergeFalVideos } from "@/lib/fal-video";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in before joining a movie." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { videoUrls?: unknown; aspect?: unknown } | null;
  const aspect: AspectRatio = typeof body?.aspect === "string" && isAspectRatio(body.aspect) ? body.aspect : "9:16";
  const videoUrls = Array.isArray(body?.videoUrls)
    ? body.videoUrls.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];
  if (videoUrls.length < 2) {
    return NextResponse.json({ error: "Two scene clips are required to join the movie." }, { status: 400 });
  }

  if (!logApiKey("FAL_KEY")) {
    return NextResponse.json({ error: "Fal.ai is not configured yet." }, { status: 500 });
  }

  try {
    const merged = await mergeFalVideos(videoUrls, request.signal);
    if ("error" in merged) {
      return NextResponse.json({ error: merged.error }, { status: 502 });
    }
    return NextResponse.json({ videoUrl: await deliverFrame(merged.videoUrl, request.signal, aspect) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Movie stitching was stopped." }, { status: 499 });
    }
    const message = error instanceof Error && error.message ? error.message : "Could not join the scene clips.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
