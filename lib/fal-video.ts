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
const MAX_IMAGE_BYTES = 3_500_000;

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
    const host = url.hostname;
    return (
      host === "fal.run" ||
      host === "queue.fal.run" ||
      host === "fal.ai" ||
      host === "fal.media" ||
      host.endsWith(".fal.ai") ||
      host.endsWith(".fal.media") ||
      host.endsWith(".fal.run")
    );
  } catch {
    return false;
  }
}

function httpsUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  return falHost(value) ? value : null;
}

function issuedFileUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function uploadReference(
  key: string,
  image: ReferenceImage,
  signal: AbortSignal,
): Promise<{ fileUrl: string } | { error: string }> {
  const extension = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
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
        file_name: `character-reference.${extension}`,
        content_type: image.contentType,
      }),
      signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal storage could not be reached.";
    return { error: message };
  }
  if (!initiated.ok) {
    return { error: await falResponseError(initiated) };
  }
  const payload = (await initiated.json()) as {
    upload_url?: unknown;
    file_url?: unknown;
    fileUrl?: unknown;
    access_url?: unknown;
  };
  const uploadUrl = typeof payload.upload_url === "string" ? payload.upload_url : "";
  const fileUrl =
    issuedFileUrl(payload.file_url) ?? issuedFileUrl(payload.fileUrl) ?? issuedFileUrl(payload.access_url);
  if (!uploadUrl.startsWith("https://") || !fileUrl) {
    return { error: "Fal storage did not return an upload URL." };
  }
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": image.contentType },
    body: new Uint8Array(image.bytes),
    signal,
  });
  if (!uploaded.ok) {
    return { error: await falResponseError(uploaded) };
  }
  return { fileUrl };
}

export async function falResponseError(response: Response) {
  const text = await response.text().catch(() => "");
  const detail = falErrorDetail(text);
  return detail || `Fal.ai returned ${response.status}.`;
}

export function falErrorDetail(value: unknown) {
  const parsed = typeof value === "string" ? safeJson(value) ?? value : value;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    return trimmed ? trimmed.slice(0, 500) : "";
  }
  if (!parsed || typeof parsed !== "object") return "";
  const record = parsed as {
    detail?: unknown;
    error?: unknown;
    message?: unknown;
    payload?: { detail?: unknown };
  };
  const detail = record.detail ?? record.payload?.detail ?? record.error ?? record.message;
  if (typeof detail === "string") return detail.slice(0, 500);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") return item.msg;
        return "";
      })
      .filter(Boolean);
    return parts.join("; ").slice(0, 500);
  }
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") {
    return detail.message.slice(0, 500);
  }
  return "";
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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
    const uploaded = await uploadReference(key, input.image, input.signal);
    if ("error" in uploaded) return uploaded;
    imageUrl = uploaded.fileUrl;
  }

  let submitted: Response;
  try {
    submitted = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      }),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal.ai could not be reached.";
    console.error("Fal video submit failed", message);
    return { error: message };
  }
  if (!submitted.ok) {
    const message = await falResponseError(submitted);
    console.error("Fal video submit rejected", submitted.status, message);
    return { error: message };
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
    if (!statusResponse.ok) {
      const message = await falResponseError(statusResponse);
      console.error("Fal video status failed", statusResponse.status, message);
      continue;
    }
    const status = (await statusResponse.json()) as { status?: string; error?: unknown };
    if (status.status === "FAILED") {
      const message =
        falErrorDetail(status.error) || falErrorDetail(status) || "Fal.ai could not finish this clip.";
      console.error("Fal video job failed", message);
      return { error: message };
    }
    if (status.status !== "COMPLETED") continue;
    const resultResponse = await fetch(responseUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: input.signal,
    });
    if (!resultResponse.ok) {
      const message = await falResponseError(resultResponse);
      console.error("Fal video result failed", resultResponse.status, message);
      return { error: message };
    }
    const videoUrl = readVideoUrl(await resultResponse.json());
    if (!videoUrl) break;
    return { videoUrl };
  }

  return { error: "Fal.ai is still rendering this clip. Try again in a moment." };
}
