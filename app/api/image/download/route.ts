import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function allowedImageHost(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (
      url.hostname === "fal.run" ||
      url.hostname.endsWith(".fal.ai") ||
      url.hostname.endsWith(".fal.media") ||
      url.hostname.endsWith(".fal.run")
    ) {
      return true;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;
    const storageHost = new URL(supabaseUrl).hostname;
    return url.hostname === storageHost && url.pathname.includes("/storage/v1/object/public/gallery/");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in before downloading an image." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { imageUrl?: unknown } | null;
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!allowedImageHost(imageUrl)) {
    return NextResponse.json({ error: "That image cannot be downloaded." }, { status: 400 });
  }

  const source = await fetch(imageUrl, { signal: request.signal });
  if (!source.ok) {
    return NextResponse.json({ error: "Could not download that image." }, { status: 502 });
  }
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 20_000_000) {
    return NextResponse.json({ error: "That image is too large to download." }, { status: 400 });
  }
  const contentType = source.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="cut45-image.${extension}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
