import { logApiKey } from "@/lib/api-keys";
import { falApiKey } from "@/lib/fal-key";
import { frameSize, type AspectRatio } from "@/lib/frame";
import {
  getVideoModel,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-models";
import type { VisualEngineId } from "@/lib/visual-engines";

export type ReferenceImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

const LTX_TEXT = "fal-ai/ltx-video";
const LTX_IMAGE = "fal-ai/ltx-video/image-to-video";

const MODELS: Record<Exclude<VisualEngineId, "stock">, { text: string; image: string }> = {
  budget: { text: LTX_TEXT, image: LTX_IMAGE },
  ultra: { text: LTX_TEXT, image: LTX_IMAGE },
};

const POLL_START_MS = 2000;
const POLL_MAX_MS = 10000;
const POLL_BUDGET_MS = 80000;
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

export function falMediaUrl(value: unknown) {
  return httpsUrl(value);
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

function referenceDataUri(image: ReferenceImage) {
  return `data:${image.contentType};base64,${image.bytes.toString("base64")}`;
}

function motionSeconds(durationSec: number) {
  return durationSec >= 10 ? 10 : 5;
}

function hunyuanAspect(aspect: AspectRatio) {
  return aspect === "9:16" ? "9:16" : "16:9";
}

function videoInput(
  model: string,
  prompt: string,
  imageUrl: string | null,
  durationSec: number,
  aspect: AspectRatio,
  resolution: string,
) {
  const seconds = motionSeconds(durationSec);

  if (model.includes("ltx-video")) {
    return {
      prompt,
      negative_prompt: "worst quality, inconsistent motion, blurry, jittery, distorted, still frame, slideshow, static image",
      resolution: "720p",
      aspect_ratio: aspect,
      num_frames: seconds * 24 + 1,
      frame_rate: 24,
      expand_prompt: false,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  }

  if (model.includes("pika")) {
    return {
      prompt,
      aspect_ratio: aspect,
      resolution,
      duration: seconds,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  }

  if (model.includes("hunyuan-video")) {
    return {
      prompt,
      aspect_ratio: hunyuanAspect(aspect),
      resolution,
      num_frames: 129,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  }

  if (model.includes("fast-svd")) {
    const size = frameSize(aspect);
    const scale = (Number.parseInt(resolution, 10) || 1080) / Math.min(size.width, size.height);
    return {
      prompt,
      video_size: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  }

  if (model.includes("runway")) {
    return {
      prompt,
      duration: seconds,
      ratio: aspect,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  }

  return {
    prompt,
    aspect_ratio: aspect,
    duration: `${seconds}s`,
    resolution,
    ...(imageUrl ? { image_url: imageUrl } : {}),
  };
}

async function submitVideo(input: {
  key: string;
  model: string;
  prompt: string;
  imageUrl: string | null;
  durationSec: number;
  aspect: AspectRatio;
  resolution: string;
  signal: AbortSignal;
}) {
  return fetch(`https://queue.fal.run/${input.model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${input.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(
      videoInput(input.model, input.prompt, input.imageUrl, input.durationSec, input.aspect, input.resolution),
    ),
    signal: input.signal,
  });
}

function pollDelay(attempt: number) {
  return Math.min(POLL_MAX_MS, POLL_START_MS * 2 ** attempt);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function logFal(scope: string, status: number | null, message: string) {
  const key = process.env.FAL_KEY?.trim() || process.env.FAL_AI_API_KEY?.trim() || "";
  if (!key) {
    console.error(`[fal] ${scope}: FAL_KEY is not set`);
    return;
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid api key|api key/i.test(message)) {
    console.error(`[fal] ${scope}: authorization failed`, status ?? "", message);
    return;
  }
  console.error(`[fal] ${scope}:`, status ?? "", message);
}

async function pollQueue(input: {
  key: string;
  statusUrl: string;
  responseUrl: string;
  signal: AbortSignal;
  pollBudgetMs: number;
  scope: string;
}): Promise<{ payload: unknown } | { error: string } | { pending: true }> {
  const started = Date.now();
  let attempt = 0;
  while (Date.now() - started < input.pollBudgetMs) {
    await sleep(pollDelay(attempt), input.signal);
    attempt += 1;
    let statusResponse: Response;
    try {
      statusResponse = await fetch(input.statusUrl, {
        headers: { Authorization: `Key ${input.key}`, Accept: "application/json" },
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal.aborted) throw error;
      const message = error instanceof Error ? error.message : "Fal.ai status could not be reached.";
      logFal(input.scope, null, message);
      continue;
    }
    if (statusResponse.status === 401 || statusResponse.status === 403) {
      const message = await falResponseError(statusResponse);
      logFal(input.scope, statusResponse.status, message);
      return { error: "Fal.ai rejected the API key. Check FAL_KEY." };
    }
    if (!statusResponse.ok) {
      const message = await falResponseError(statusResponse);
      logFal(input.scope, statusResponse.status, message);
      continue;
    }
    const status = (await statusResponse.json()) as { status?: string; error?: unknown };
    const state = (status.status ?? "").toUpperCase();
    if (state === "FAILED" || state === "ERROR") {
      const message = falErrorDetail(status.error) || falErrorDetail(status) || "Fal.ai could not finish this job.";
      logFal(input.scope, null, message);
      if (/credit|quota|exhausted|insufficient|billing|balance/i.test(message)) {
        return { error: `Fal.ai credits are depleted. ${message}` };
      }
      return { error: message };
    }
    if (state !== "COMPLETED") {
      console.info(`[fal] ${input.scope}: queue ${state || "IN_PROGRESS"}`);
      continue;
    }
    const resultResponse = await fetch(input.responseUrl, {
      headers: { Authorization: `Key ${input.key}`, Accept: "application/json" },
      signal: input.signal,
    });
    if (resultResponse.status === 401 || resultResponse.status === 403) {
      const message = await falResponseError(resultResponse);
      logFal(input.scope, resultResponse.status, message);
      return { error: "Fal.ai rejected the API key. Check FAL_KEY." };
    }
    if (!resultResponse.ok) {
      const message = await falResponseError(resultResponse);
      logFal(input.scope, resultResponse.status, message);
      return { error: message };
    }
    return { payload: await resultResponse.json() };
  }
  console.error(`[fal] ${input.scope}: queue still processing after ${input.pollBudgetMs}ms`);
  return { pending: true };
}

function readVideoUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    video?: { url?: unknown };
    data?: { video?: { url?: unknown } };
  };
  return httpsUrl(record.video?.url) ?? httpsUrl(record.data?.video?.url);
}

function videoEndpoints(engine: Exclude<VisualEngineId, "stock">, videoModel?: VideoModelId) {
  if (videoModel) {
    const model = getVideoModel(videoModel);
    return { text: model.textEndpoint, image: model.imageEndpoint };
  }
  return MODELS[engine];
}

export async function renderFalClip(input: {
  engine: Exclude<VisualEngineId, "stock">;
  prompt: string;
  image: ReferenceImage | null;
  signal: AbortSignal;
  startFrameUrl?: string | null;
  pollBudgetMs?: number;
  durationSec?: number;
  aspectRatio?: AspectRatio;
  videoModel?: VideoModelId;
  resolution?: VideoResolution;
}): Promise<{ videoUrl: string } | { error: string } | { pending: true; statusUrl: string; responseUrl: string }> {
  if (!logApiKey("FAL_KEY")) {
    return { error: "Fal.ai is not configured yet." };
  }
  const key = process.env.FAL_KEY?.trim() || falApiKey();
  if (!key) {
    return { error: "Fal.ai is not configured yet." };
  }

  const startFrame = input.startFrameUrl ? httpsUrl(input.startFrameUrl) : null;
  const endpoints = videoEndpoints(input.engine, input.videoModel);
  const model = input.image || startFrame ? endpoints.image : endpoints.text;
  const resolution = "720p" as const;
  let imageUrl: string | null = startFrame;
  let storageUrl: string | null = startFrame;
  if (input.image && !imageUrl) {
    const uploaded = await uploadReference(key, input.image, input.signal);
    if ("fileUrl" in uploaded) {
      storageUrl = uploaded.fileUrl;
      imageUrl = storageUrl;
    } else {
      console.error("Fal video upload failed", uploaded.error);
      imageUrl = referenceDataUri(input.image);
    }
  }

  let submitted: Response;
  try {
    submitted = await submitVideo({
      key,
      model,
      prompt: input.prompt,
      imageUrl,
      durationSec: input.durationSec ?? 5,
      aspect: input.aspectRatio ?? "9:16",
      resolution,
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted) throw error;
    if (!input.image || imageUrl !== storageUrl) {
      const message = error instanceof Error ? error.message : "Fal.ai could not be reached.";
      console.error("Fal video submit failed", message);
      return { error: message };
    }
    submitted = new Response(null, { status: 599 });
  }
  if (!submitted.ok && input.image && storageUrl && imageUrl === storageUrl) {
    try {
      submitted = await submitVideo({
        key,
        model,
        prompt: input.prompt,
        imageUrl: referenceDataUri(input.image),
        durationSec: input.durationSec ?? 5,
        aspect: input.aspectRatio ?? "9:16",
        resolution,
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal.aborted) throw error;
      const message = error instanceof Error ? error.message : "Fal.ai could not be reached.";
      console.error("Fal video submit failed", message);
      return { error: message };
    }
  }
  if (!submitted.ok) {
    const message = await falResponseError(submitted);
    logFal("video submit", submitted.status, message);
    if (submitted.status === 401 || submitted.status === 403) {
      return { error: "Fal.ai rejected the API key. Check FAL_KEY." };
    }
    if (submitted.status === 402 || /credit|quota|exhausted|insufficient|billing|balance/i.test(message)) {
      return { error: `Fal.ai credits are depleted. ${message}` };
    }
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

  const polled = await pollQueue({
    key,
    statusUrl,
    responseUrl,
    signal: input.signal,
    pollBudgetMs: input.pollBudgetMs ?? POLL_BUDGET_MS,
    scope: "video",
  });
  if ("pending" in polled) {
    return { pending: true as const, statusUrl, responseUrl };
  }
  if ("error" in polled) return polled;
  const videoUrl = readVideoUrl(polled.payload);
  if (!videoUrl) return { error: "Fal.ai finished without a video URL." };
  return { videoUrl };
}

export async function continueFalClip(input: {
  statusUrl: string;
  responseUrl: string;
  signal: AbortSignal;
  pollBudgetMs?: number;
}): Promise<{ videoUrl: string } | { pending: true } | { error: string }> {
  if (!logApiKey("FAL_KEY")) {
    return { error: "Fal.ai is not configured yet." };
  }
  const key = process.env.FAL_KEY?.trim() || falApiKey();
  if (!key) {
    return { error: "Fal.ai is not configured yet." };
  }
  const statusUrl = httpsUrl(input.statusUrl);
  const responseUrl = httpsUrl(input.responseUrl);
  if (!statusUrl || !responseUrl) return { error: "That render job could not be resumed." };
  const polled = await pollQueue({
    key,
    statusUrl,
    responseUrl,
    signal: input.signal,
    pollBudgetMs: input.pollBudgetMs ?? POLL_BUDGET_MS,
    scope: "video",
  });
  if ("pending" in polled) return { pending: true };
  if ("error" in polled) return polled;
  const videoUrl = readVideoUrl(polled.payload);
  if (!videoUrl) return { error: "Fal.ai finished without a video URL." };
  return { videoUrl };
}

async function queueFal(input: {
  model: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  pollBudgetMs: number;
}): Promise<{ payload: unknown } | { error: string }> {
  if (!logApiKey("FAL_KEY")) {
    return { error: "Fal.ai is not configured yet." };
  }
  const key = process.env.FAL_KEY?.trim() || falApiKey();
  if (!key) {
    return { error: "Fal.ai is not configured yet." };
  }
  let submitted: Response;
  try {
    submitted = await fetch(`https://queue.fal.run/${input.model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted) throw error;
    const message = error instanceof Error ? error.message : "Fal.ai could not be reached.";
    console.error("Fal job submit failed", message);
    return { error: message };
  }
  if (!submitted.ok) {
    const message = await falResponseError(submitted);
    logFal("job submit", submitted.status, message);
    if (submitted.status === 401 || submitted.status === 403) {
      return { error: "Fal.ai rejected the API key. Check FAL_KEY." };
    }
    if (submitted.status === 402 || /credit|quota|exhausted|insufficient|billing|balance/i.test(message)) {
      return { error: `Fal.ai credits are depleted. ${message}` };
    }
    return { error: message };
  }
  const queued = (await submitted.json()) as { status_url?: unknown; response_url?: unknown };
  const statusUrl = httpsUrl(queued.status_url);
  const responseUrl = httpsUrl(queued.response_url);
  if (!statusUrl || !responseUrl) return { error: "Fal.ai accepted the job without a status URL." };

  const polled = await pollQueue({
    key,
    statusUrl,
    responseUrl,
    signal: input.signal,
    pollBudgetMs: input.pollBudgetMs,
    scope: "job",
  });
  if ("pending" in polled) return { error: "Fal.ai is still working. Try the extension again in a moment." };
  if ("error" in polled) return polled;
  return { payload: polled.payload };
}

function readFrameUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    images?: Array<{ url?: unknown }>;
    image?: { url?: unknown };
    frame?: { url?: unknown };
  };
  return (
    httpsUrl(record.images?.[0]?.url) ?? httpsUrl(record.image?.url) ?? httpsUrl(record.frame?.url)
  );
}

export async function extractLastFrame(videoUrl: string, signal: AbortSignal) {
  if (!httpsUrl(videoUrl)) return { error: "The finished video cannot be extended." };
  const queued = await queueFal({
    model: "fal-ai/ffmpeg-api/extract-frame",
    body: { video_url: videoUrl, frame_type: "last" },
    signal,
    pollBudgetMs: 15000,
  });
  if ("error" in queued) return queued;
  const imageUrl = readFrameUrl(queued.payload);
  if (!imageUrl) return { error: "Fal.ai did not return the last frame." };
  return { imageUrl };
}

export async function mergeFalVideos(videoUrls: string[], signal: AbortSignal) {
  const urls = videoUrls.map((url) => httpsUrl(url)).filter((url): url is string => Boolean(url));
  if (urls.length < 2) return { error: "Two clips are required to join the video." };
  const queued = await queueFal({
    model: "fal-ai/ffmpeg-api/merge-videos",
    body: { video_urls: urls },
    signal,
    pollBudgetMs: Math.min(50000, 12000 * urls.length),
  });
  if ("error" in queued) return queued;
  const videoUrl = readVideoUrl(queued.payload);
  if (!videoUrl) return { error: "Fal.ai did not return the joined video." };
  return { videoUrl };
}

export async function uploadAudio(
  bytes: Uint8Array,
  signal: AbortSignal,
  contentType = "audio/mpeg",
): Promise<{ fileUrl: string } | { error: string }> {
  const key = falApiKey();
  if (!key) return { error: "Fal.ai is not configured yet." };
  const wav = contentType.includes("wav");
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
        file_name: wav ? "cutvoice-narration.wav" : "cutvoice-narration.mp3",
        content_type: wav ? "audio/wav" : "audio/mpeg",
      }),
      signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fal storage could not be reached.";
    return { error: message };
  }
  if (!initiated.ok) return { error: await falResponseError(initiated) };
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
    headers: { "Content-Type": wav ? "audio/wav" : "audio/mpeg" },
    body: Buffer.from(bytes),
    signal,
  });
  if (!uploaded.ok) return { error: await falResponseError(uploaded) };
  return { fileUrl };
}

export async function lipSyncVideo(
  videoUrl: string,
  audioUrl: string,
  signal: AbortSignal,
  pollBudgetMs = 110000,
) {
  const video = httpsUrl(videoUrl);
  const audio = issuedFileUrl(audioUrl) ?? httpsUrl(audioUrl);
  if (!video || !audio) return { error: "Lip-sync needs the finished video and the dialogue audio." };
  const queued = await queueFal({
    model: "fal-ai/sync-lipsync/v2",
    body: {
      video_url: video,
      audio_url: audio,
      model: "lipsync-2",
      sync_mode: "remap",
    },
    signal,
    pollBudgetMs,
  });
  if ("error" in queued) return queued;
  const synced = readVideoUrl(queued.payload);
  if (!synced) return { error: "Fal.ai did not return the lip-synced video." };
  return { videoUrl: synced };
}

export async function fitVerticalVideo(videoUrl: string, signal: AbortSignal, aspect: AspectRatio = "9:16") {
  const video = httpsUrl(videoUrl);
  if (!video) return { error: "The finished video cannot be resized." };
  const { width, height } = frameSize(aspect);
  const queued = await queueFal({
    model: "fal-ai/workflow-utilities/scale-video",
    body: {
      video_url: video,
      width,
      height,
      mode: "stretch",
      codec: "libx264",
      preset: "fast",
      crf: 18,
    },
    signal,
    pollBudgetMs: 25000,
  });
  if ("error" in queued) return queued;
  const scaled = readVideoUrl(queued.payload);
  if (!scaled) return { error: `Fal.ai did not return the ${width}x${height} video.` };
  return { videoUrl: scaled };
}

export async function deliverFrame(videoUrl: string, signal: AbortSignal, aspect: AspectRatio = "9:16") {
  const fitted = await fitVerticalVideo(videoUrl, signal, aspect);
  if ("videoUrl" in fitted) return fitted.videoUrl;
  const { width, height } = frameSize(aspect);
  console.error(`[fal] ${width}x${height} scale skipped`, fitted.error);
  return videoUrl;
}

export async function deliverPortrait(videoUrl: string, signal: AbortSignal) {
  return deliverFrame(videoUrl, signal, "9:16");
}

export async function muxVideoAudio(videoUrl: string, audioUrl: string, signal: AbortSignal) {
  const video = httpsUrl(videoUrl);
  const audio = issuedFileUrl(audioUrl) ?? httpsUrl(audioUrl);
  if (!video || !audio) return { error: "The narration could not be attached to this video." };
  const queued = await queueFal({
    model: "fal-ai/ffmpeg-api/merge-audio-video",
    body: { video_url: video, audio_url: audio },
    signal,
    pollBudgetMs: 45000,
  });
  if ("error" in queued) return queued;
  const merged = readVideoUrl(queued.payload);
  if (!merged) return { error: "Fal.ai did not return the narrated video." };
  return { videoUrl: merged };
}
