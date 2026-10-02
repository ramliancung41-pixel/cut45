import { falApiKey } from "@/lib/fal-key";
import type { VisualEngineId } from "@/lib/visual-engines";

export type ReferenceImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

const MODELS: Record<Exclude<VisualEngineId, "stock">, { text: string; image: string }> = {
  budget: {
    text: "fal-ai/ltx-video",
    image: "fal-ai/ltx-video/image-to-video",
  },
  ultra: {
    text: "fal-ai/luma-dream-machine/ray-2",
    image: "fal-ai/luma-dream-machine/ray-2/image-to-video",
  },
};

const POLL_MS = 2000;
const POLL_BUDGET_MS = 40000;
const MAX_IMAGE_BYTES = 1_200_000;

export function parseReferenceImage(value: unknown): ReferenceImage | null | "invalid" {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) return "invalid";
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return "invalid";
  const type = match[1].toLowerCase();
  const contentType = type === "image/png" || type === "image/webp" ? type : "image/jpeg";
  return { contentType, bytes };
}

function falHost(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "fal.run" ||
      url.hostname === "queue.fal.run" ||
      url.hostname.endsWith(".fal.ai") ||
      url.hostname.endsWith(".fal.media") ||
      url.hostname.endsWith(".fal.run")
    );
  } catch {
    return false;
  }
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  return falHost(value) ? value : null;
}

export async function uploadReference(key: string, image: ReferenceImage, signal: AbortSignal) {
  const extension = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
  const initiated = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: `character-reference.${extension}`,
      content_type: image.contentType,
    }),
    signal,
  });
  if (!initiated.ok) return null;
  const payload = (await initiated.json()) as { upload_url?: unknown; file_url?: unknown };
  if (typeof payload.upload_url !== "string" || !payload.upload_url.startsWith("https://")) return null;
  const fileUrl = httpsUrl(payload.file_url);
  if (!fileUrl) return null;
  const uploaded = await fetch(payload.upload_url, {
    method: "PUT",
    headers: { "Content-Type": image.contentType },
    body: new Uint8Array(image.bytes),
    signal,
  });
  return uploaded.ok ? fileUrl : null;
}

function readVideoUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    video?: { url?: unknown };
    data?: { video?: { url?: unknown } };
  };
  return httpsUrl(record.video?.url) ?? httpsUrl(record.data?.video?.url);
}

export async function renderFalClip(input: {
  engine: Exclude<VisualEngineId, "stock">;
  prompt: string;
  image: ReferenceImage | null;
  signal: AbortSignal;
}): Promise<{ videoUrl: string } | { error: string }> {
  const key = falApiKey();
  if (!key) {
    return { error: "Fal.ai is not configured yet." };
  }

  const model = input.image ? MODELS[input.engine].image : MODELS[input.engine].text;
  let imageUrl: string | null = null;
  if (input.image) {
    imageUrl = await uploadReference(key, input.image, input.signal);
    if (!imageUrl) {
      return { error: "The reference image could not be sent to Fal.ai." };
    }
  }

  const submitted = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    }),
    signal: input.signal,
  });
  if (!submitted.ok) {
    return { error: "Fal.ai did not accept this render." };
  }

  const queued = (await submitted.json()) as {
    status_url?: unknown;
    response_url?: unknown;
  };
  const statusUrl = httpsUrl(queued.status_url);
  const responseUrl = httpsUrl(queued.response_url);
  if (!statusUrl || !responseUrl) {
    return { error: "Fal.ai accepted the job without a status URL." };
  }

  const started = Date.now();
  while (Date.now() - started < POLL_BUDGET_MS) {
    if (input.signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const statusResponse = await fetch(statusUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: input.signal,
    });
    if (!statusResponse.ok) continue;
    const status = (await statusResponse.json()) as { status?: string };
    if (status.status === "FAILED") {
      return { error: "Fal.ai could not finish this clip." };
    }
    if (status.status !== "COMPLETED") continue;
    const resultResponse = await fetch(responseUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: input.signal,
    });
    if (!resultResponse.ok) break;
    const videoUrl = readVideoUrl(await resultResponse.json());
    if (!videoUrl) break;
    return { videoUrl };
  }

  return { error: "Fal.ai is still rendering this clip. Try again in a moment." };
}
