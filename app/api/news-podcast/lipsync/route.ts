import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fal } from "@fal-ai/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Speaker = "A" | "B";
type Preset = "father-son" | "hosts";
type Clip = { speaker: Speaker; audioPath: string; durationSec: number; imageIndex: number };

const AVATAR_DIR = path.join(process.cwd(), "public", "avatars");

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { jobId?: unknown; preset?: unknown; clips?: unknown } | null;
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
    avatars = await ensureAvatars(preset);
  } catch {
    return Response.json({ error: "The cartoon hosts could not be created." }, { status: 502 });
  }

  const videos = [];
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const videoPath = path.join(directory, `${String(index).padStart(2, "0")}-${clip.speaker}.mp4`);
    try {
      const videoUrl = await lipSync(avatars[clip.speaker], clip.audioPath);
      const bytes = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
      await writeFile(videoPath, bytes);
      videos.push({
        speaker: clip.speaker,
        videoPath,
        audioPath: clip.audioPath,
        durationSec: clip.durationSec,
        imageIndex: clip.imageIndex,
      });
    } catch {
      return Response.json({ error: `Could not lip-sync line ${index + 1}.`, jobId, videos }, { status: 502 });
    }
  }

  return Response.json({ jobId, videos });
}

function parseClips(value: unknown): Clip[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 14) return null;
  const root = os.tmpdir();
  const clips: Clip[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as { speaker?: unknown; audioPath?: unknown; path?: unknown; durationSec?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const audioPath = typeof record.audioPath === "string" ? record.audioPath : typeof record.path === "string" ? record.path : "";
    const resolved = path.resolve(audioPath);
    const relative = path.relative(root, resolved);
    const durationSec = typeof record.durationSec === "number" && record.durationSec > 0 ? record.durationSec : 0;
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    if (!speaker || relative.startsWith("..") || path.isAbsolute(relative) || !relative.endsWith(".mp3")) return null;
    clips.push({ speaker, audioPath: resolved, durationSec, imageIndex });
  }
  return clips;
}

async function ensureAvatars(preset: Preset) {
  await mkdir(AVATAR_DIR, { recursive: true });
  const files = { A: path.join(AVATAR_DIR, "host_a.png"), B: path.join(AVATAR_DIR, "host_b.png") } as const;
  if (!(await exists(files.A)) || !(await exists(files.B))) {
    const prompts = avatarPrompts(preset);
    await writeFile(files.A, await fluxPortrait(prompts.A));
    await writeFile(files.B, await fluxPortrait(prompts.B));
  }
  return { A: await uploadFile(files.A, "image/png", "host_a.png"), B: await uploadFile(files.B, "image/png", "host_b.png") };
}

function avatarPrompts(preset: Preset) {
  const style = "Clean 2D flat vector illustration, chest-up portrait, facing camera, simple shapes, solid dark studio background #1a202c, no text";
  if (preset === "father-son") {
    return {
      A: `${style}. Young son podcast host on the left side of a two-host setup, short hair, friendly expression.`,
      B: `${style}. Older father podcast host on the right side of a two-host setup, glasses, calm expression.`,
    };
  }
  return {
    A: `${style}. Male podcast host on the left side of a two-host setup, short hair, confident expression.`,
    B: `${style}. Female podcast host on the right side of a two-host setup, shoulder-length hair, warm expression.`,
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
  if (!url) throw new Error("flux");
  const response = await fetch(url);
  if (!response.ok) throw new Error("flux download");
  return Buffer.from(await response.arrayBuffer());
}

async function lipSync(imageUrl: string, audioPath: string) {
  const audioUrl = await uploadFile(audioPath, "audio/mpeg", path.basename(audioPath));
  const result = await fal.subscribe("fal-ai/sadtalker", {
    input: {
      source_image_url: imageUrl,
      driven_audio_url: audioUrl,
    },
  });
  const url = videoUrlFrom(result);
  if (!url) throw new Error("sadtalker");
  return url;
}

async function uploadFile(filePath: string, type: string, name: string) {
  const bytes = await readFile(filePath);
  return fal.storage.upload(new File([bytes], name, { type }));
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function imageUrlFrom(result: unknown) {
  const data = (result as { data?: { images?: Array<{ url?: unknown }> } })?.data;
  const url = data?.images?.[0]?.url;
  return typeof url === "string" ? url : "";
}

function videoUrlFrom(result: unknown) {
  const data = (result as { data?: { video?: { url?: unknown } } })?.data;
  const url = data?.video?.url;
  return typeof url === "string" ? url : "";
}
