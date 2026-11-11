import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { STORAGE_BUCKETS, uploadPublicObject } from "@/lib/storage";
import { userFromAccessToken } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function signedInUser(request: NextRequest) {
  const accessToken = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken) return null;
  const user = await userFromAccessToken(accessToken);
  return user?.id ? user : null;
}

export async function GET(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to use your images." }, { status: 401 });
  const { createSupabaseAdminClient } = await import("@/lib/supabase/server");
  const admin = createSupabaseAdminClient();
  const listed = await admin.storage.from(STORAGE_BUCKETS.userAssets).list(user.id, {
    limit: 24,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (listed.error) return NextResponse.json({ assets: [] });
  const assets = (listed.data ?? [])
    .filter((item) => item.name && !item.name.endsWith("/"))
    .map((item) => ({
      name: item.name,
      url: admin.storage.from(STORAGE_BUCKETS.userAssets).getPublicUrl(`${user.id}/${item.name}`).data.publicUrl,
    }))
    .filter((item) => item.url.startsWith("https://"));
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to upload an image." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const extension = TYPES.get(file.type);
  if (!extension) return NextResponse.json({ error: "Use a PNG, JPG, or WebP image." }, { status: 400 });
  if (file.size <= 0 || file.size > 5_000_000) {
    return NextResponse.json({ error: "That image is empty or larger than 5 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await uploadPublicObject({
    bucket: STORAGE_BUCKETS.userAssets,
    path: `${user.id}/${Date.now()}.${extension}`,
    bytes,
    contentType: file.type,
  });
  if (!("publicUrl" in stored) || !stored.publicUrl) {
    return NextResponse.json({ error: "The file could not be stored." }, { status: 502 });
  }
  const publicUrl = stored.publicUrl;
  return NextResponse.json({ asset: { name: publicUrl.split("/").pop() ?? "image", url: publicUrl } });
}
