import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SavedCharacter = {
  id: string;
  userId: string;
  name: string;
  characterImageUrl: string;
  createdAt: string;
};

const BUCKET = "characters";

export function rowToCharacter(row: Record<string, unknown>): SavedCharacter | null {
  const id = typeof row.id === "string" ? row.id : "";
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  const name = typeof row.name === "string" ? row.name : "";
  const characterImageUrl = typeof row.character_image_url === "string" ? row.character_image_url : "";
  if (!id || !userId || !name || !characterImageUrl) return null;
  return {
    id,
    userId,
    name,
    characterImageUrl,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

export function isVideoMedia(url: string) {
  return /\.mp4(\?|#|$)/i.test(url) || /video\/mp4/i.test(url);
}

export function isStillImage(url: string) {
  if (!url || isVideoMedia(url)) return false;
  return url.startsWith("https://") || url.startsWith("data:image/jpeg") || url.startsWith("data:image/png") || url.startsWith("data:image/webp");
}

export async function latestCharacterImage(userId: string) {
  const admin = createSupabaseAdminClient();
  const listed = await admin
    .from("characters")
    .select("character_image_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const url = listed.data?.[0]?.character_image_url;
  return typeof url === "string" && isStillImage(url) ? url : "";
}

export async function storeCharacterImage(userId: string, sourceUrl: string) {
  const downloaded = await fetch(sourceUrl);
  if (!downloaded.ok) return { error: "The character image could not be downloaded." };
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) {
    return { error: "The character image is empty or too large." };
  }
  const admin = createSupabaseAdminClient();
  const created = await admin.storage.createBucket(BUCKET, { public: true });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    return { error: "Character storage is not available." };
  }
  const path = `characters/${userId}_${Date.now()}.png`;
  const uploaded = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: downloaded.headers.get("content-type") || "image/png",
    upsert: false,
  });
  if (uploaded.error) return { error: "The character image could not be stored." };
  const characterImageUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return characterImageUrl ? { characterImageUrl } : { error: "The character image could not be stored." };
}
