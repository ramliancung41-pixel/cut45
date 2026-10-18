import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { falApiKey } from "@/lib/fal-key";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken) : null;
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in before saving a movie." }, { status: 401 });
  }
  const key = falApiKey();
  if (!key) {
    return NextResponse.json({ error: "Cloud save is not configured yet." }, { status: 500 });
  }

  let initiated: Response;
  try {
    initiated = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        file_name: "cut45-movie.mp4",
        content_type: "video/mp4",
      }),
      signal: request.signal,
    });
  } catch {
    return NextResponse.json({ error: "Cloud storage could not be reached." }, { status: 502 });
  }
  if (!initiated.ok) {
    return NextResponse.json({ error: "Cloud storage did not accept the movie." }, { status: 502 });
  }
  const payload = (await initiated.json()) as {
    upload_url?: unknown;
    file_url?: unknown;
    fileUrl?: unknown;
  };
  const uploadUrl = typeof payload.upload_url === "string" ? payload.upload_url : "";
  const fileUrl = typeof payload.file_url === "string" ? payload.file_url : typeof payload.fileUrl === "string" ? payload.fileUrl : "";
  if (!uploadUrl.startsWith("https://") || !fileUrl.startsWith("https://")) {
    return NextResponse.json({ error: "Cloud storage did not return an upload URL." }, { status: 502 });
  }
  return NextResponse.json({ uploadUrl, fileUrl });
}
