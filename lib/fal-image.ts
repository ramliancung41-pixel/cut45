import { falApiKey } from "@/lib/fal-key";
import { uploadReference, type ReferenceImage } from "@/lib/fal-video";

const MODEL = "fal-ai/flux/dev/image-to-image";
const POLL_MS = 2000;
const POLL_BUDGET_MS = 50000;

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

function readImageUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    images?: Array<{ url?: unknown }>;
    data?: { images?: Array<{ url?: unknown }> };
  };
  const images = record.images ?? record.data?.images;
  return httpsUrl(images?.[0]?.url);
}

export async function renderFluxImage(input: {
  prompt: string;
  image: ReferenceImage;
  signal: AbortSignal;
}): Promise<{ imageUrl: string } | { error: string }> {
  const key = falApiKey();
  if (!key) return { error: "Fal.ai is not configured yet." };

  const imageUrl = await uploadReference(key, input.image, input.signal);
  if (!imageUrl) return { error: "The input image could not be sent to Fal.ai." };

  const submitted = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: input.prompt,
      strength: 0.85,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "png",
      num_images: 1,
    }),
    signal: input.signal,
  });
  if (!submitted.ok) return { error: "Fal.ai did not accept this image." };

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
    if (status.status === "FAILED") return { error: "Fal.ai could not finish this image." };
    if (status.status !== "COMPLETED") continue;
    const resultResponse = await fetch(responseUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: input.signal,
    });
    if (!resultResponse.ok) break;
    const rendered = readImageUrl(await resultResponse.json());
    if (!rendered) break;
    return { imageUrl: rendered };
  }

  return { error: "Fal.ai is still rendering this image. Try again in a moment." };
}
