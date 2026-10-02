import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isVisualEngineId, type VisualEngineId } from "@/lib/visual-engines";

export type SavedGalleryItem = {
  id: string;
  prompt: string;
  script: string;
  engine: VisualEngineId | "image";
  voiceName: string;
  videoUrl: string | null;
  imageUrl: string | null;
  credits: number;
  createdAt: string;
};

const BUCKET = "gallery";

function rowToItem(row: Record<string, unknown>): SavedGalleryItem | null {
  const id = typeof row.id === "string" ? row.id : "";
  const engine = typeof row.engine === "string" ? row.engine : "";
  if (!id || (engine !== "image" && !isVisualEngineId(engine))) return null;
  return {
    id,
    prompt: typeof row.prompt === "string" ? row.prompt : "",
    script: typeof row.script === "string" ? row.script : "",
    engine,
    voiceName: typeof row.voice_name === "string" ? row.voice_name : "",
    videoUrl: typeof row.video_url === "string" ? row.video_url : null,
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
    credits: Number(row.credits) || 0,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

async function storeAsset(
  userId: string,
  id: string,
  sourceUrl: string,
  extension: string,
  fallbackType: string,
) {
  const response = await fetch(sourceUrl);
  if (!response.ok) return sourceUrl;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 40_000_000) return sourceUrl;
  const admin = createSupabaseAdminClient();
  const created = await admin.storage.createBucket(BUCKET, { public: true });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    return sourceUrl;
  }
  const path = `${userId}/${id}.${extension}`;
  const uploaded = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: response.headers.get("content-type") || fallbackType,
    upsert: true,
  });
  if (uploaded.error) return sourceUrl;
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || sourceUrl;
}

export async function saveGalleryItem(input: {
  userId: string;
  id: string;
  prompt: string;
  script: string;
  engine: VisualEngineId;
  voiceName: string;
  videoUrl: string;
  credits: number;
}) {
  let videoUrl = input.videoUrl;
  try {
    videoUrl = await storeAsset(input.userId, input.id, input.videoUrl, "mp4", "video/mp4");
  } catch {
    videoUrl = input.videoUrl;
  }

  try {
    const admin = createSupabaseAdminClient();
    const saved = await admin.from("gallery").upsert({
      id: input.id,
      user_id: input.userId,
      prompt: input.prompt,
      script: input.script,
      engine: input.engine,
      voice_name: input.voiceName,
      video_url: videoUrl,
      credits: input.credits,
    });
    if (saved.error) return null;
    return videoUrl;
  } catch {
    return null;
  }
}

export async function saveGalleryImage(input: {
  userId: string;
  id: string;
  prompt: string;
  styleName: string;
  imageUrl: string;
  credits: number;
}) {
  let imageUrl = input.imageUrl;
  try {
    imageUrl = await storeAsset(input.userId, input.id, input.imageUrl, "png", "image/png");
  } catch {
    imageUrl = input.imageUrl;
  }

  try {
    const admin = createSupabaseAdminClient();
    const saved = await admin.from("gallery").upsert({
      id: input.id,
      user_id: input.userId,
      prompt: input.prompt,
      script: input.prompt,
      engine: "image",
      voice_name: input.styleName,
      image_url: imageUrl,
      credits: input.credits,
    });
    if (saved.error) return null;
    return imageUrl;
  } catch {
    return null;
  }
}

export async function listGalleryItems(userId: string) {
  try {
    const admin = createSupabaseAdminClient();
    const listed = await admin
      .from("gallery")
      .select("id, prompt, script, engine, voice_name, video_url, image_url, credits, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (listed.error?.message.includes("image_url")) {
      const fallback = await admin
        .from("gallery")
        .select("id, prompt, script, engine, voice_name, video_url, credits, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (fallback.error || !fallback.data) return [];
      return fallback.data
        .map((row) => rowToItem(row as Record<string, unknown>))
        .filter((item): item is SavedGalleryItem => item !== null);
    }
    if (listed.error || !listed.data) return [];
    return listed.data
      .map((row) => rowToItem(row as Record<string, unknown>))
      .filter((item): item is SavedGalleryItem => item !== null);
  } catch {
    return [];
  }
}
