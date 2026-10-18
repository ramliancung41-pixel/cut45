import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { continueFalClip } from "@/lib/fal-video";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in before checking a render." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    statusUrl?: unknown;
    responseUrl?: unknown;
  } | null;
  const statusUrl = typeof body?.statusUrl === "string" ? body.statusUrl : "";
  const responseUrl = typeof body?.responseUrl === "string" ? body.responseUrl : "";
  if (!statusUrl || !responseUrl) {
    return NextResponse.json({ error: "The render job is missing." }, { status: 400 });
  }

  try {
    const rendered = await continueFalClip({
      statusUrl,
      responseUrl,
      signal: request.signal,
    });
    if ("videoUrl" in rendered) return NextResponse.json({ videoUrl: rendered.videoUrl });
    if ("pending" in rendered) return NextResponse.json({ pending: true });
    console.error("[fal] video status failed", rendered.error);
    return NextResponse.json({ error: rendered.error }, { status: 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal.ai status could not be reached.";
    console.error("[fal] video status failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
