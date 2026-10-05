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

async function requireUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  return user?.id ? user : null;
}

function attachmentResponse(source: Response, mediaUrl: string) {
  const contentType = source.headers.get("content-type") || "application/octet-stream";
  const video = contentType.startsWith("video/") || /\.mp4($|\?)/i.test(mediaUrl);
  const extension = video
    ? "mp4"
    : contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
  const filename = video ? `cut45-video.${extension}` : `cut45-image.${extension}`;
  return new NextResponse(source.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in before downloading a file." }, { status: 401 });
  }
  const mediaUrl = request.nextUrl.searchParams.get("fileUrl")?.trim() ?? "";
  if (!allowedImageHost(mediaUrl)) {
    return NextResponse.json({ error: "That file cannot be downloaded." }, { status: 400 });
  }
  const source = await fetch(mediaUrl, { signal: request.signal });
  if (!source.ok || !source.body) {
    return NextResponse.json({ error: "Could not download that file." }, { status: 502 });
  }
  return attachmentResponse(source, mediaUrl);
}

export async function POST(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in before downloading a file." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    imageUrl?: unknown;
    videoUrl?: unknown;
    fileUrl?: unknown;
  } | null;
  const fileUrl = [body?.fileUrl, body?.imageUrl, body?.videoUrl].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const mediaUrl = fileUrl?.trim() ?? "";
  if (!allowedImageHost(mediaUrl)) {
    return NextResponse.json({ error: "That file cannot be downloaded." }, { status: 400 });
  }

  const source = await fetch(mediaUrl, { signal: request.signal });
  if (!source.ok || !source.body) {
    return NextResponse.json({ error: "Could not download that file." }, { status: 502 });
  }
  return attachmentResponse(source, mediaUrl);
}
