import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fal } from "@fal-ai/client";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Speaker = "A" | "B";
type Segment = {
  speaker: Speaker;
  videoPath: string;
  audioPath: string;
  durationSec: number;
  imageIndex: number;
  text: string;
};

const FONT = path.join(process.cwd(), "public", "fonts", "NotoSansMyanmar-Regular.ttf");

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    jobId?: unknown;
    title?: unknown;
    lines?: unknown;
    imageUrls?: unknown;
    hostAImage?: unknown;
    hostBImage?: unknown;
    videos?: unknown;
  } | null;
  const jobId = typeof body?.jobId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(body.jobId) ? body.jobId : "";
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "News";
  const imageUrls = Array.isArray(body?.imageUrls)
    ? body.imageUrls
        .filter((item): item is string => typeof item === "string" && (/^https?:\/\//.test(item) || item.startsWith("data:image/")))
        .slice(0, 3)
    : [];
  const texts = Array.isArray(body?.lines)
    ? body.lines.map((item) => (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : ""))
    : [];
  const segments = parseSegments(body?.videos, texts);
  if (!jobId || !segments || !ffmpegPath) {
    return Response.json({ error: "Send the lip-sync clips for this podcast job." }, { status: 400 });
  }
  if (!process.env.FAL_KEY && !process.env.FAL_AI_API_KEY) {
    return Response.json({ error: "Fal is not configured yet." }, { status: 500 });
  }
  fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_AI_API_KEY || "" });
  if (!(await exists(FONT))) {
    return Response.json({ error: "The Burmese subtitle font is missing." }, { status: 400 });
  }

  const directory = path.join(os.tmpdir(), `podcast-${jobId}`);
  await mkdir(directory, { recursive: true });
  const hosts = {
    A: (await resolveHost(body?.hostAImage, path.join(directory, "host_a"))) || (await findHost(directory, "host_a")),
    B: (await resolveHost(body?.hostBImage, path.join(directory, "host_b"))) || (await findHost(directory, "host_b")),
  };
  if (!hosts.A || !hosts.B) {
    return Response.json({ error: "Upload a portrait for Host A and Host B." }, { status: 400 });
  }
  const images = await Promise.all(imageUrls.map((url, index) => downloadImage(url, path.join(directory, `news-${index}`))));

  const parts: string[] = [];
  let cursor = 0;
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const file = path.join(directory, `segment-${String(index).padStart(2, "0")}.mp4`);
    const image = images[segment.imageIndex] || "";
    try {
      segment.videoPath = await materialize(segment.videoPath, path.join(directory, `talk-${String(index).padStart(2, "0")}.mp4`));
      segment.audioPath = await materialize(segment.audioPath, path.join(directory, `voice-${String(index).padStart(2, "0")}.mp3`));
      await renderSegment({ segment, image, title, output: file, hosts });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ffmpeg";
      return Response.json({ error: `Could not assemble segment ${index + 1}. ${message}`.slice(0, 500) }, { status: 502 });
    }
    parts.push(`file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    cues.push({ start: cursor, end: cursor + segment.durationSec, text: segment.text });
    cursor += segment.durationSec;
  }

  const listPath = path.join(directory, "segments.txt");
  const assPath = path.join(directory, "subtitles.ass");
  const silentPath = path.join(directory, "joined.mp4");
  const finalPath = path.join(directory, "final.mp4");
  await writeFile(listPath, parts.join("\n"));
  await writeFile(assPath, assFile(cues));
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silentPath]);
    await burnSubtitles(silentPath, assPath, finalPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ffmpeg";
    return Response.json({ error: `Could not finish the news video. ${message}`.slice(0, 500) }, { status: 502 });
  }

  const mp4 = await readFile(finalPath);
  const hosted = await fal.storage.upload(new File([new Uint8Array(mp4)], "cut45-news.mp4", { type: "video/mp4" }));
  if (!hosted.startsWith("https://")) {
    return Response.json({ error: "Fal storage did not return an https video URL." }, { status: 502 });
  }

  return Response.json({
    jobId,
    videoPath: finalPath,
    videoUrl: hosted,
    durationSec: Math.round(cursor * 100) / 100,
  });
}

function parseSegments(value: unknown, texts: string[]): Segment[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 14) return null;
  const root = os.tmpdir();
  const segments: Segment[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object") return null;
    const record = item as { speaker?: unknown; videoPath?: unknown; videoUrl?: unknown; audioPath?: unknown; audioUrl?: unknown; durationSec?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const videoPath = remoteUrl(record.videoUrl) || safeMedia(record.videoPath, root, ".mp4");
    const audioPath = remoteUrl(record.audioUrl) || remoteUrl(record.audioPath) || safeMedia(record.audioPath, root, ".mp3");
    const durationSec = typeof record.durationSec === "number" && record.durationSec > 0 ? Math.min(record.durationSec, 30) : 0;
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    if (!speaker || !videoPath || !audioPath || !durationSec) return null;
    segments.push({ speaker, videoPath, audioPath, durationSec, imageIndex, text: (texts[index] || "").slice(0, 240) });
  }
  return segments;
}

function remoteUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("https://") ? value : "";
}

async function materialize(source: string, destination: string) {
  if (!source.startsWith("https://")) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not download media (${response.status}).`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

async function resolveHost(value: unknown, filePath: string) {
  const saved = await saveHostImage(value, filePath);
  if (saved) return saved;
  if (typeof value === "string" && value.startsWith("https://")) return downloadImage(value, filePath);
  return "";
}

function safeMedia(value: unknown, root: string, extension: string) {
  if (typeof value !== "string") return "";
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !resolved.endsWith(extension)) return "";
  return resolved;
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

async function findHost(directory: string, name: string) {
  for (const extension of [".png", ".jpg", ".webp"]) {
    const file = path.join(directory, `${name}${extension}`);
    if (await exists(file)) return file;
  }
  return "";
}

async function downloadImage(url: string, filePath: string) {
  try {
    if (url.startsWith("data:image/")) {
      const match = /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(url);
      if (!match) return "";
      const extension = match[1].toLowerCase() === "png" ? ".png" : match[1].toLowerCase() === "webp" ? ".webp" : ".jpg";
      const target = `${filePath}${extension}`;
      await writeFile(target, Buffer.from(match[2].replace(/\s/g, ""), "base64"));
      return target;
    }
    const response = await fetch(url);
    if (!response.ok) return "";
    const type = response.headers.get("content-type") || "";
    const extension = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : ".jpg";
    const target = `${filePath}${extension}`;
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    return target;
  } catch {
    return "";
  }
}

async function renderSegment(input: { segment: Segment; image: string; title: string; output: string; hosts: { A: string; B: string } }) {
  const { segment, image, title, output, hosts } = input;
  const duration = segment.durationSec.toFixed(2);
  const frames = Math.max(8, Math.round(segment.durationSec * 30));
  const talkingA = segment.speaker === "A";
  const news = image
    ? `[1:v]scale=1400:820:force_original_aspect_ratio=increase,crop=1400:820,zoompan=z='min(1+0.0007*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=960x560:fps=30[news]`
    : `[1:v]drawtext=fontfile='${filterPath(FONT)}':text='${escapeDrawtext(title || "News")}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2[news]`;
  const filter = [
    news,
    `[2:v]scale=480:540:force_original_aspect_ratio=increase,crop=480:540,fps=30,trim=duration=${duration},setpts=PTS-STARTPTS[hosta]`,
    `[3:v]scale=480:540:force_original_aspect_ratio=increase,crop=480:540,fps=30,trim=duration=${duration},setpts=PTS-STARTPTS[hostb]`,
    `[0:v]drawbox=x=0:y=0:w=1080:h=110:color=0x0c1018:t=fill[bar]`,
    `[bar]drawtext=fontfile='${filterPath(FONT)}':text='CUT45   NEWS':fontsize=34:fontcolor=white:x=60:y=38[brand]`,
    `[brand][news]overlay=60:160[withnews]`,
    `[withnews][hosta]overlay=40:760[witha]`,
    `[witha][hostb]overlay=560:760[withb]`,
    `[withb]drawbox=x=40:y=1280:w=1000:h=28:color=0x2c3448:t=fill[vout]`,
  ].join(";");
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x12161f:s=1080x1920:r=30:d=${duration}`,
    ...(image ? ["-loop", "1", "-t", duration, "-i", image] : ["-f", "lavfi", "-i", `color=c=0x1a202c:s=960x560:r=30:d=${duration}`]),
    ...(talkingA ? ["-t", duration, "-i", segment.videoPath] : ["-loop", "1", "-t", duration, "-i", hosts.A]),
    ...(!talkingA ? ["-t", duration, "-i", segment.videoPath] : ["-loop", "1", "-t", duration, "-i", hosts.B]),
    "-i",
    segment.audioPath,
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-map",
    "4:a:0",
    "-t",
    duration,
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    output,
  ];
  await runFfmpeg(args);
}

function assFile(cues: Array<{ start: number; end: number; text: string }>) {
  const events = cues
    .filter((cue) => cue.text.trim())
    .map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},News,,0,0,0,,${escapeAss(cue.text)}`)
    .join("\n");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: News,Noto Sans Myanmar,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,0,2,70,70,430,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

function assTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const whole = Math.floor(centiseconds / 100);
  const cent = centiseconds % 100;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cent).padStart(2, "0")}`;
}

function escapeAss(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

function escapeDrawtext(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/\r?\n/g, " ");
}

function filterPath(file: string) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function burnSubtitles(input: string, ass: string, output: string) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .videoFilters(`ass='${filterPath(ass)}':fontsdir='${filterPath(path.dirname(FONT))}'`)
      .videoCodec("libx264")
      .outputOptions(["-pix_fmt", "yuv420p", "-c:a", "copy"])
      .on("end", () => resolve())
      .on("error", (error: Error) => reject(error))
      .save(output);
  });
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg.setFfmpegPath(ffmpegPath || "ffmpeg");
    const child = spawn(ffmpegPath || "ffmpeg", args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-1800);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").slice(-8).join(" ") || `ffmpeg exited ${code}`));
    });
  });
}

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
