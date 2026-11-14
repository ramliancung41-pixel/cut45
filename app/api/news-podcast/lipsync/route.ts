import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fal } from "@fal-ai/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Speaker = "A" | "B";
type Preset = "father-son" | "hosts";
type Clip = { speaker: Speaker; audioPath: string; durationSec: number; imageIndex: number };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    jobId?: unknown;
    preset?: unknown;
    clips?: unknown;
    hostAImage?: unknown;
    hostBImage?: unknown;
  } | null;
  const preset: Preset = body?.preset === "father-son" ? "father-son" : "hosts";
  const clips = parseClips(body?.clips);
  const jobId = typeof body?.jobId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(body.jobId) ? body.jobId : crypto.randomUUID();
  if (!clips) return Response.json({ error: "Send the dialogue audio clips." }, { status: 400 });
  if (!process.env.FAL_KEY && !process.env.FAL_AI_API_KEY) {
    return Response.json({ error: "Fal is not configured yet." }, { status: 500 });
  }
  fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_AI_API_KEY || "" });

  const directory = path.join(os.tmpdir(), `podcast-${jobId}`);
  await mkdir(directory, { recursive: true });

  let avatars: Record<Speaker, string>;
  try {
    avatars = await ensureAvatars(directory, preset, body?.hostAImage, body?.hostBImage);
  } catch (error) {
    const message = describe(error);
    console.error("[news-podcast] host creation failed", message);
    return Response.json({ error: `The cartoon hosts could not be created. ${message}` }, { status: 502 });
  }

  const videos = [];
  const idleVideos = new Map<string, string>();
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const videoPath = path.join(directory, `${String(index).padStart(2, "0")}-${clip.speaker}.mp4`);
    try {
      const videoUrl = await lipSync(avatars[clip.speaker], clip.audioPath, idleVideos);
      const bytes = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
      await writeFile(videoPath, bytes);
      videos.push({
        speaker: clip.speaker,
        videoPath,
        videoUrl,
        audioPath: clip.audioPath,
        audioUrl: clip.audioPath.startsWith("https://") ? clip.audioPath : "",
        durationSec: clip.durationSec,
        imageIndex: clip.imageIndex,
      });
    } catch (error) {
      const message = describe(error);
      console.error("[news-podcast] lip-sync failed", index + 1, message);
      return Response.json({ error: `Could not lip-sync line ${index + 1}. ${message}`, jobId, videos }, { status: 502 });
    }
  }

  return Response.json({ jobId, videos, hostAImage: avatars.A, hostBImage: avatars.B });
}

function localMedia(value: string, root: string, extension: string) {
  if (!value) return "";
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !resolved.endsWith(extension)) return "";
  return resolved;
}

function parseClips(value: unknown): Clip[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 14) return null;
  const root = os.tmpdir();
  const clips: Clip[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as { speaker?: unknown; audioPath?: unknown; audioUrl?: unknown; path?: unknown; durationSec?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const audioUrl = typeof record.audioUrl === "string" && record.audioUrl.startsWith("https://") ? record.audioUrl : "";
    const audioPath = typeof record.audioPath === "string" ? record.audioPath : typeof record.path === "string" ? record.path : "";
    const resolved = audioUrl || localMedia(audioPath, root, ".mp3");
    const durationSec = typeof record.durationSec === "number" && record.durationSec > 0 ? record.durationSec : 0;
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    if (!speaker || !resolved || !durationSec) return null;
    clips.push({ speaker, audioPath: resolved, durationSec, imageIndex });
  }
  return clips;
}

async function ensureAvatars(directory: string, preset: Preset, hostAImage: unknown, hostBImage: unknown) {
  const savedA = await saveHostImage(hostAImage, path.join(directory, "host_a"));
  const savedB = await saveHostImage(hostBImage, path.join(directory, "host_b"));
  const files = {
    A: savedA || (await generatedHost(path.join(directory, "host_a.png"), avatarPrompts(preset).A)),
    B: savedB || (await generatedHost(path.join(directory, "host_b.png"), avatarPrompts(preset).B)),
  };
  return {
    A: await uploadFile(files.A, contentType(files.A), path.basename(files.A)),
    B: await uploadFile(files.B, contentType(files.B), path.basename(files.B)),
  };
}

async function saveHostImage(value: unknown, filePath: string) {
  if (typeof value !== "string") return "";
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return "";
  const extension = match[1].toLowerCase() === "png" ? ".png" : match[1].toLowerCase() === "webp" ? ".webp" : ".jpg";
  const target = `${filePath}${extension}`;
  await writeFile(target, Buffer.from(match[2].replace(/\s/g, ""), "base64"));
  return target;
}

async function generatedHost(filePath: string, prompt: string) {
  await writeFile(filePath, await fluxPortrait(prompt));
  return filePath;
}

function contentType(filePath: string) {
  if (filePath.endsWith(".jpg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function avatarPrompts(preset: Preset) {
  const scene = "3D Pixar style animated character portrait, wearing headphones and a casual smart shirt, sitting at a modern podcast microphone, warm cinematic studio lighting, clean dark slate background #12161f, front-facing chest-up view, high detail 3D render, no text";
  if (preset === "father-son") {
    return {
      A: `${scene}. Friendly Burmese/Asian boy, the son podcast host.`,
      B: `${scene}. Friendly Burmese/Asian father podcast host, older, warm expression.`,
    };
  }
  return {
    A: `${scene}. Friendly Burmese/Asian young male podcast host.`,
    B: `${scene}. Friendly Burmese/Asian young female podcast host.`,
  };
}

async function fluxPortrait(prompt: string) {
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "portrait_4_3",
      num_images: 1,
      output_format: "png",
    },
  });
  const url = imageUrlFrom(result);
  if (!url) throw new Error(`Flux returned no image URL. ${JSON.stringify(result).slice(0, 280)}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Flux image download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function lipSync(imageUrl: string, audioPath: string, idleVideos: Map<string, string>) {
  const audioUrl = audioPath.startsWith("https://") ? audioPath : await uploadFile(audioPath, "audio/mpeg", path.basename(audioPath));
  try {
    const result = await fal.subscribe("fal-ai/veed/fabric-1.0", {
      input: { image_url: imageUrl, audio_url: audioUrl, resolution: "480p" },
    });
    const url = videoUrlFrom(result);
    if (!url.startsWith("https://")) throw new Error(`Fabric returned no video URL. ${JSON.stringify(result).slice(0, 280)}`);
    return url;
  } catch (error) {
    console.error("[news-podcast] fabric lip-sync failed", describe(error));
    const baseVideo = await idleHostVideo(imageUrl, idleVideos);
    try {
      const result = await fal.subscribe("fal-ai/kling-video/lipsync/audio-to-video", {
        input: { video_url: baseVideo, audio_url: audioUrl },
      });
      const url = videoUrlFrom(result);
      if (!url.startsWith("https://")) throw new Error(`Kling lip-sync returned no video URL. ${JSON.stringify(result).slice(0, 280)}`);
      return url;
    } catch (klingError) {
      throw new Error(`Kling lip-sync failed. ${describe(klingError)}`);
    }
  }
}

async function idleHostVideo(imageUrl: string, idleVideos: Map<string, string>) {
  const cached = idleVideos.get(imageUrl);
  if (cached) return cached;
  const prompt = "Subtle idle podcast host, small natural head nod, mouth nearly closed, looking at the camera, static camera";
  try {
    const result = await fal.subscribe("fal-ai/kling-video/v1.6/standard/image-to-video", {
      input: { image_url: imageUrl, prompt, duration: "5" },
    });
    const url = videoUrlFrom(result);
    if (!url.startsWith("https://")) throw new Error("Kling image-to-video returned no video URL.");
    idleVideos.set(imageUrl, url);
    return url;
  } catch (error) {
    throw new Error(`Could not create an idle host video. ${describe(error)}`);
  }
}

async function uploadFile(filePath: string, type: string, name: string) {
  const bytes = await readFile(filePath);
  const hosted = await fal.storage.upload(new File([new Uint8Array(bytes)], name, { type }));
  if (!hosted.startsWith("https://")) throw new Error("Fal storage did not return an https URL.");
  return hosted;
}

function describe(error: unknown) {
  if (error instanceof Error) {
    const body = (error as { body?: unknown }).body;
    const detail = body ? ` ${JSON.stringify(body).slice(0, 300)}` : "";
    return `${error.message}${detail}`.slice(0, 420);
  }
  return "Unexpected lip-sync error.";
}

function imageUrlFrom(result: unknown) {
  const record = result as { data?: { images?: Array<{ url?: unknown }> }; images?: Array<{ url?: unknown }> };
  const url = record.data?.images?.[0]?.url ?? record.images?.[0]?.url;
  return typeof url === "string" ? url : "";
}

function videoUrlFrom(result: unknown) {
  const record = result as { data?: { video?: { url?: unknown } }; video?: { url?: unknown } };
  const url = record.data?.video?.url ?? record.video?.url;
  return typeof url === "string" ? url : "";
}
