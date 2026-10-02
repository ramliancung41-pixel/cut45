import { falApiKey } from "@/lib/fal-key";
import {
  falErrorDetail,
  falResponseError,
  uploadReference,
  type ReferenceImage,
} from "@/lib/fal-video";

const MODEL = "fal-ai/flux/dev/image-to-image";
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

async function submitFlux(input: {
  key: string;
  imageUrl: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<{ statusUrl: string; responseUrl: string } | { error: string }> {
  let submitted: Response;
  try {
    submitted = await fetch(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${input.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        image_url: input.imageUrl,
        prompt: input.prompt,
        strength: 0.85,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        output_format: "png",
        num_images: 1,
      }),
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

export async function renderFluxImage(input: {
  prompt: string;
  image: ReferenceImage;
  signal: AbortSignal;
}): Promise<{ imageUrl: string } | { error: string }> {
  const key = falApiKey();
  if (!key) return { error: "Fal.ai is not configured yet." };

  const dataUri = referenceDataUri(input.image);
  let queued = await submitFlux({
    key,
    imageUrl: dataUri,
    prompt: input.prompt,
    signal: input.signal,
  });

  if ("error" in queued) {
    const uploaded = await uploadReference(key, input.image, input.signal);
    if ("error" in uploaded) {
      console.error("Fal image upload failed", uploaded.error);
      return { error: queued.error || uploaded.error };
    }
    queued = await submitFlux({
      key,
      imageUrl: uploaded.fileUrl,
      prompt: input.prompt,
      signal: input.signal,
    });
    if ("error" in queued) return queued;
  }

  const started = Date.now();
  while (Date.now() - started < POLL_BUDGET_MS) {
    if (input.signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const statusResponse = await fetch(queued.statusUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: input.signal,
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
      signal: input.signal,
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
