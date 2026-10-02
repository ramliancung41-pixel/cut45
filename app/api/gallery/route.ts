import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { listGalleryItems, saveGalleryImage, saveGalleryItem } from "@/lib/gallery-store";
import { userFromAccessToken } from "@/lib/supabase/server";
import { isVisualEngineId } from "@/lib/visual-engines";

function isFalVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "fal.run" ||
        url.hostname.endsWith(".fal.ai") ||
        url.hostname.endsWith(".fal.media") ||
        url.hostname.endsWith(".fal.run"))
    );
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function signedInUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken) return null;
  const user = await userFromAccessToken(accessToken);
  return user?.id ? user : null;
}

export async function GET(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ items: [] });
  const items = await listGalleryItems(user.id);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in before saving a render." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    prompt?: unknown;
    script?: unknown;
    engine?: unknown;
    voiceName?: unknown;
    videoUrl?: unknown;
    imageUrl?: unknown;
    styleName?: unknown;
    kind?: unknown;
    credits?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const script = typeof body?.script === "string" ? body.script.trim() : "";
  const engine = typeof body?.engine === "string" ? body.engine : "";
  const voiceName = typeof body?.voiceName === "string" ? body.voiceName.trim() : "";
  const videoUrl = typeof body?.videoUrl === "string" ? body.videoUrl.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  const styleName = typeof body?.styleName === "string" ? body.styleName.trim() : "";
  const credits = Number(body?.credits);

  if (body?.kind === "image") {
    if (!id || !prompt || !isFalVideoUrl(imageUrl) || !Number.isFinite(credits) || credits <= 0) {
      return NextResponse.json({ error: "A finished image is required." }, { status: 400 });
    }
    const storedUrl = await saveGalleryImage({
      userId: user.id,
      id,
      prompt: prompt.slice(0, 800),
      styleName: styleName.slice(0, 80) || "Avatar Studio",
      imageUrl,
      credits,
    });
    if (!storedUrl) {
      return NextResponse.json({ error: "Could not save this image to the gallery." }, { status: 500 });
    }
    return NextResponse.json({ id, imageUrl: storedUrl });
  }

  if (!id || !prompt || !script || !isVisualEngineId(engine) || engine === "stock") {
    return NextResponse.json({ error: "That render cannot be saved." }, { status: 400 });
  }
  if (!isFalVideoUrl(videoUrl) || !Number.isFinite(credits) || credits <= 0) {
    return NextResponse.json({ error: "A finished video is required." }, { status: 400 });
  }

  const storedUrl = await saveGalleryItem({
    userId: user.id,
    id,
    prompt: prompt.slice(0, 800),
    script: script.slice(0, 4000),
    engine,
    voiceName: voiceName.slice(0, 80) || "Voice",
    videoUrl,
    credits,
  });

  if (!storedUrl) {
    return NextResponse.json({ error: "Could not save this render to the gallery." }, { status: 500 });
  }
  return NextResponse.json({ id, videoUrl: storedUrl });
}
