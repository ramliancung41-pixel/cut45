import { fal } from "@fal-ai/client";
import { falApiKey } from "@/lib/fal-key";
import type { ReferenceImage } from "@/lib/fal-video";
import { isPublicImageUrl, isVideoMedia } from "@/lib/saved-characters";

const TEXT_MODEL = "fal-ai/wan-t2v";
const IMAGE_MODEL = "fal-ai/wan-i2v";
const FAL_TIMEOUT_MS = 120_000;

function configure() {
  const key = falApiKey();
  if (!key) return "";
  fal.config({ credentials: key });
  return key;
}

function videoUrlFrom(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const data = (result as { data?: { video?: { url?: unknown } } }).data;
  return typeof data?.video?.url === "string" ? data.video.url : "";
}

async function imageUrlFor(input: {
  characterImageUrl?: string | null;
  image?: ReferenceImage | null;
  startFrameUrl?: string | null;
}) {
  const direct = input.characterImageUrl?.trim() || input.startFrameUrl?.trim() || "";
  if (isPublicImageUrl(direct)) return direct;
  if (isVideoMedia(direct) || !input.image) return "";
  const file = new File([new Uint8Array(input.image.bytes)], "character.png", {
    type: input.image.contentType,
  });
  return fal.storage.upload(file);
}

export async function renderFalLtx(input: {
  prompt: string;
  characterImageUrl?: string | null;
  image?: ReferenceImage | null;
  startFrameUrl?: string | null;
  durationSec?: number;
}): Promise<{ videoUrl: string } | { error: string }> {
  if (!configure()) return { error: "Fal is not configured yet." };
  const prompt = input.prompt.trim();
  if (!prompt) return { error: "Describe the video first." };

  let imageUrl = "";
  try {
    imageUrl = await imageUrlFor(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The character image could not be uploaded.";
    console.error("[fal] image upload failed", message);
    return { error: message };
  }

  const seconds = input.durationSec === 10 ? 10 : 5;
  const signal = AbortSignal.timeout(FAL_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      fal.subscribe(imageUrl ? IMAGE_MODEL : TEXT_MODEL, {
        abortSignal: signal,
        timeout: FAL_TIMEOUT_MS,
        input: imageUrl
          ? {
              prompt,
              image_url: imageUrl,
              resolution: "720p",
              aspect_ratio: "16:9",
              num_frames: seconds === 10 ? 100 : 81,
              frames_per_second: 16,
            }
          : {
              prompt,
              resolution: "720p",
              aspect_ratio: "16:9",
              num_frames: seconds === 10 ? 100 : 81,
              frames_per_second: 16,
            },
      }),
      new Promise<never>((_, reject) => {
        const fail = () => reject(new Error("Generation timed out"));
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
      }),
    ]);
    const videoUrl = videoUrlFrom(result);
    if (!videoUrl) return { error: "Fal finished without a video URL." };
    return { videoUrl };
  } catch (error) {
    const timedOut = signal.aborted || (error instanceof Error && /timeout|timed out|aborted/i.test(error.message));
    const message = timedOut ? "Generation timed out" : error instanceof Error ? error.message : "Fal could not render the video.";
    console.error("[fal] video render failed; credits were not charged", message);
    return { error: message };
  }
}
