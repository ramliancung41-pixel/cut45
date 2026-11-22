import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { STORAGE_BUCKETS, ensurePublicBucket } from "@/lib/storage";
import { createSupabaseAdminClient, userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPES = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
]);

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken).catch(() => null) : null;
  if (!user?.id) return NextResponse.json({ error: "Sign in before uploading a video." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { contentType?: unknown } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const extension = TYPES.get(contentType);
  if (!extension) return NextResponse.json({ error: "Upload an MP4, WebM, or MOV up to 5 minutes." }, { status: 400 });

  const ready = await ensurePublicBucket(STORAGE_BUCKETS.userAssets);
  if ("error" in ready) return NextResponse.json({ error: ready.error }, { status: 502 });

  const objectPath = `${user.id}/news-${crypto.randomUUID()}.${extension}`;
  const signed = await createSupabaseAdminClient().storage.from(STORAGE_BUCKETS.userAssets).createSignedUploadUrl(objectPath);
  if (signed.error || !signed.data?.token) {
    return NextResponse.json({ error: "The video upload could not be started." }, { status: 502 });
  }
  const publicUrl = ready.admin.storage.from(STORAGE_BUCKETS.userAssets).getPublicUrl(objectPath).data.publicUrl;
  return NextResponse.json({ path: objectPath, token: signed.data.token, publicUrl });
}
