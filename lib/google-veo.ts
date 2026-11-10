import type { AspectRatio } from "@/lib/frame";
import type { ReferenceImage } from "@/lib/fal-video";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const MODEL = "veo-3.1-lite-generate-preview";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_BUDGET_MS = 80_000;
const BUCKET = "gallery";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Veo Lite accepts 4, 6, or 8 seconds. The studio still offers 5s and 10s. */
export function veoDurationSeconds(durationSec: number) {
  if (durationSec >= 10) return 8;
  if (durationSec >= 5) return 6;
  return 4;
}

type VeoResult = { videoUrl: string } | { error: string } | { pending: true; statusUrl: string; responseUrl: string };

function apiKey() {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

function operationUrl(name: string) {
  const path = name.replace(/^\/+/, "");
  return path.startsWith("http") ? path : `${BASE}/${path}`;
}

async function publishVideo(bytes: Buffer, contentType: string) {
  const admin = createSupabaseAdminClient();
  const created = await admin.storage.createBucket(BUCKET, { public: true });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    return { error: "The finished video could not be stored." };
  }
  const path = `veo/${Date.now().toString(36)}.mp4`;
  const uploaded = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: contentType || "video/mp4",
    upsert: true,
  });
  if (uploaded.error) return { error: "The finished video could not be stored." };
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return url ? { videoUrl: url } : { error: "The finished video could not be stored." };
}

async function inlineImage(input: {
  image: ReferenceImage | null;
  startFrameUrl?: string | null;
  signal: AbortSignal;
}) {
  if (input.image) {
    return { mimeType: input.image.contentType || "image/png", data: input.image.bytes.toString("base64") };
  }
  if (!input.startFrameUrl) return null;
  const response = await fetch(input.startFrameUrl, { signal: input.signal });
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  return {
    mimeType: response.headers.get("content-type") || "image/jpeg",
    data: bytes.toString("base64"),
  };
}

function readVideoUri(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = (payload as { response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } } }).response;
  return response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || "";
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const error = (payload as { error?: { message?: string } }).error;
  return error?.message || "";
}

async function downloadVideo(uri: string, signal: AbortSignal) {
  const response = await fetch(uri, {
    headers: { "x-goog-api-key": apiKey() },
    signal,
    redirect: "follow",
  });
  if (!response.ok) {
    console.error("[veo] video download failed", response.status);
    return { error: "Veo finished without a playable video." };
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) return { error: "Veo finished without a playable video." };
  return publishVideo(bytes, response.headers.get("content-type") || "video/mp4");
}

async function pollOperation(name: string, signal: AbortSignal, budgetMs: number): Promise<VeoResult> {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const response = await fetch(operationUrl(name), {
      headers: { "x-goog-api-key": apiKey() },
      signal,
    });
    const payload = (await response.json().catch(() => null)) as { done?: boolean } | null;
    if (!response.ok) {
      const message = readError(payload) || "Veo could not be reached.";
      console.error("[veo] poll failed", response.status, message);
      return { error: message };
    }
    if (!payload?.done) continue;
    const failed = readError(payload);
    if (failed) {
      console.error("[veo] generation failed; credits were not charged", failed);
      return { error: failed };
    }
    const uri = readVideoUri(payload);
    if (!uri) return { error: "Veo finished without a video." };
    return downloadVideo(uri, signal);
  }
  return { pending: true, statusUrl: name, responseUrl: name };
}

export async function renderVeoClip(input: {
  prompt: string;
  image: ReferenceImage | null;
  signal: AbortSignal;
  startFrameUrl?: string | null;
  pollBudgetMs?: number;
  durationSec?: number;
  aspectRatio?: AspectRatio;
}): Promise<VeoResult> {
  const key = apiKey();
  if (!key) return { error: "Google AI Studio is not configured yet." };

  const aspectRatio = input.aspectRatio === "9:16" ? "9:16" : "16:9";
  const durationSeconds = veoDurationSeconds(input.durationSec ?? 5);
  let image: { mimeType: string; data: string } | null = null;
  try {
    image = await inlineImage(input);
  } catch (error) {
    if (input.signal.aborted) throw error;
    console.error("[veo] reference image failed", error instanceof Error ? error.message : error);
  }

  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (image) instance.image = { inlineData: image };

  let submitted: Response;
  try {
    submitted = await fetch(`${BASE}/models/${MODEL}:predictLongRunning`, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio,
          resolution: "720p",
          durationSeconds,
        },
      }),
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted) throw error;
    const message = error instanceof Error ? error.message : "Veo could not be reached.";
    console.error("[veo] submit failed", message);
    return { error: message };
  }

  const payload = (await submitted.json().catch(() => null)) as { name?: string } | null;
  if (!submitted.ok) {
    const message = readError(payload) || "Veo could not start the video.";
    console.error("[veo] submit failed", submitted.status, message);
    return { error: message };
  }
  const name = payload?.name || "";
  if (!name) return { error: "Veo accepted the job without an operation id." };
  return pollOperation(name, input.signal, input.pollBudgetMs ?? POLL_BUDGET_MS);
}

export async function continueVeoClip(input: {
  operationName: string;
  signal: AbortSignal;
  pollBudgetMs?: number;
}): Promise<{ videoUrl: string } | { pending: true } | { error: string }> {
  if (!apiKey()) return { error: "Google AI Studio is not configured yet." };
  const name = input.operationName.trim();
  if (!name) return { error: "That render job could not be resumed." };
  const polled = await pollOperation(name, input.signal, input.pollBudgetMs ?? POLL_BUDGET_MS);
  if ("pending" in polled) return { pending: true };
  return polled;
}
