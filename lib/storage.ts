import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const STORAGE_BUCKETS = {
  characters: "characters",
  userAssets: "user_assets",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export async function ensurePublicBucket(bucket: StorageBucket) {
  const admin = createSupabaseAdminClient();
  const created = await admin.storage.createBucket(bucket, { public: true });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    return { error: "Storage is not available." as const };
  }
  return { admin };
}

export async function uploadPublicObject(input: {
  bucket: StorageBucket;
  path: string;
  bytes: Buffer;
  contentType: string;
  upsert?: boolean;
}) {
  const ready = await ensurePublicBucket(input.bucket);
  if ("error" in ready) return ready;
  const uploaded = await ready.admin.storage.from(input.bucket).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: input.upsert ?? false,
  });
  if (uploaded.error) return { error: "The file could not be stored." as const };
  const publicUrl = ready.admin.storage.from(input.bucket).getPublicUrl(input.path).data.publicUrl;
  return publicUrl ? { publicUrl } : { error: "The file could not be stored." as const };
}

export async function storeUserAsset(userId: string, sourceUrl: string, filename: string) {
  const downloaded = await fetch(sourceUrl);
  if (!downloaded.ok) return { error: "The file could not be downloaded." as const };
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) {
    return { error: "The file is empty or too large." as const };
  }
  const safeName = filename.replace(/[^a-z0-9._-]+/gi, "-").replace(/^\.+/, "").slice(0, 80) || "asset";
  return uploadPublicObject({
    bucket: STORAGE_BUCKETS.userAssets,
    path: `${userId}/${Date.now()}-${safeName}`,
    bytes,
    contentType: downloaded.headers.get("content-type") || "application/octet-stream",
  });
}
