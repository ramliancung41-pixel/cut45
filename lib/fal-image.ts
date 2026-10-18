import { logApiKey } from "@/lib/api-keys";
import { falApiKey } from "@/lib/fal-key";
import {
  falErrorDetail,
  falResponseError,
  uploadReference,
  type ReferenceImage,
} from "@/lib/fal-video";
import { DEFAULT_IMAGE_ASPECT, falImageAspectFields, type ImageAspectId } from "@/lib/image-aspects";
import { DEFAULT_IMAGE_MODEL, getImageModel, type ImageModelId } from "@/lib/image-models";

const POLL_MS = 2000;
const POLL_BUDGET_MS = 50000;

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

function readImageUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    images?: Array<{ url?: unknown }>;
    data?: { images?: Array<{ url?: unknown }> };
    image?: { url?: unknown };
  };
  const images = record.images ?? record.data?.images;
  return httpsUrl(images?.[0]?.url) ?? httpsUrl(record.image?.url);
}

function referenceDataUri(image: ReferenceImage) {
  return `data:${image.contentType};base64,${image.bytes.toString("base64")}`;
}

function modelInput(modelId: ImageModelId, prompt: string, aspect: ImageAspectId, imageUrl?: string) {
  const model = getImageModel(modelId);
  const body: Record<string, unknown> = {
    prompt,
    ...model.extras,
    ...falImageAspectFields(modelId, aspect),
  };
  if (!imageUrl) return body;
  if (model.imageField === "image_url") body.image_url = imageUrl;
  else body.image_urls = [imageUrl];
  return body;
}

async function submitImageJob(input: {
  key: string;
  endpoint: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<{ statusUrl: string; responseUrl: string } | { error: string }> {
  let submitted: Response;
  try {
    submitted = await fetch(`https://queue.fal.run/${input.endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${input.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal.ai could not be reached.";
    console.error("Fal image submit failed", message);
    return { error: message };
  }

  if (!submitted.ok) {
    const message = await falResponseError(submitted);
    console.error("Fal image submit rejected", submitted.status, message);
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
  return { statusUrl, responseUrl };
}

async function queueImage(input: {
  key: string;
  modelId: ImageModelId;
  prompt: string;
  aspect: ImageAspectId;
  imageUrl?: string;
  signal: AbortSignal;
}) {
  const model = getImageModel(input.modelId);
  return submitImageJob({
    key: input.key,
    endpoint: input.imageUrl ? model.editEndpoint : model.textEndpoint,
    body: modelInput(input.modelId, input.prompt, input.aspect, input.imageUrl),
    signal: input.signal,
  });
}

export async function renderStudioImage(input: {
  prompt: string;
  model?: ImageModelId;
  aspect?: ImageAspectId;
  image?: ReferenceImage | null;
  signal: AbortSignal;
}): Promise<{ imageUrl: string } | { error: string }> {
  if (!logApiKey("FAL_KEY")) return { error: "Fal.ai is not configured yet." };
  const key = falApiKey();
  if (!key) return { error: "Fal.ai is not configured yet." };
  const modelId = input.model ?? DEFAULT_IMAGE_MODEL;
  const aspect = input.aspect ?? DEFAULT_IMAGE_ASPECT;

  if (!input.image) {
    const queued = await queueImage({
      key,
      modelId,
      prompt: input.prompt,
      aspect,
      signal: input.signal,
    });
    if ("error" in queued) return queued;
    return readImageResult(key, queued, input.signal);
  }

  const dataUri = referenceDataUri(input.image);
  let queued = await queueImage({
    key,
    modelId,
    prompt: input.prompt,
    aspect,
    imageUrl: dataUri,
    signal: input.signal,
  });

  if ("error" in queued) {
    const uploaded = await uploadReference(key, input.image, input.signal);
    if ("error" in uploaded) {
      console.error("Fal image upload failed", uploaded.error);
      return { error: queued.error || uploaded.error };
    }
    queued = await queueImage({
      key,
      modelId,
      prompt: input.prompt,
      aspect,
      imageUrl: uploaded.fileUrl,
      signal: input.signal,
    });
    if ("error" in queued) return queued;
  }

  return readImageResult(key, queued, input.signal);
}

export async function renderFluxImage(input: {
  prompt: string;
  image?: ReferenceImage | null;
  signal: AbortSignal;
}) {
  return renderStudioImage({ ...input, model: DEFAULT_IMAGE_MODEL });
}

async function readImageResult(
  key: string,
  queued: { statusUrl: string; responseUrl: string },
  signal: AbortSignal,
): Promise<{ imageUrl: string } | { error: string }> {
  const started = Date.now();
  while (Date.now() - started < POLL_BUDGET_MS) {
    if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const statusResponse = await fetch(queued.statusUrl, {
      headers: { Authorization: `Key ${key}` },
      signal,
    });
    if (!statusResponse.ok) {
      const message = await falResponseError(statusResponse);
      console.error("Fal image status failed", statusResponse.status, message);
      continue;
    }
    const status = (await statusResponse.json()) as { status?: string; error?: unknown };
    if (status.status === "FAILED") {
      const message = falErrorDetail(status.error) || falErrorDetail(status) || "Fal.ai could not finish this image.";
      console.error("Fal image job failed", message);
      return { error: message };
    }
    if (status.status !== "COMPLETED") continue;
    const resultResponse = await fetch(queued.responseUrl, {
      headers: { Authorization: `Key ${key}` },
      signal,
    });
    if (!resultResponse.ok) {
      const message = await falResponseError(resultResponse);
      console.error("Fal image result failed", resultResponse.status, message);
      return { error: message };
    }
    const rendered = readImageUrl(await resultResponse.json());
    if (!rendered) return { error: "Fal.ai finished without an image URL." };
    return { imageUrl: rendered };
  }

  return { error: "Fal.ai is still rendering this image. Try again in a moment." };
}
