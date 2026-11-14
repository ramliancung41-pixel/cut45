import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { uploadPublicObject, STORAGE_BUCKETS } from "@/lib/storage";

let binary = "";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Speaker = "A" | "B";
type Segment = {
  speaker: Speaker;
  audioPath: string;
  audioDataUrl: string;
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
  if (!jobId || !segments) {
    return Response.json({ error: "Send the lip-sync clips for this podcast job." }, { status: 400 });
  }
  try {
    await ensureFfmpeg();
  } catch (error) {
    const message = error instanceof Error ? error.message : "ffmpeg";
    return Response.json({ error: message }, { status: 500 });
  }
  if (!(await exists(FONT))) {
    return Response.json({ error: "The Burmese subtitle font is missing." }, { status: 400 });
  }

  const directory = path.join(os.tmpdir(), `podcast-${jobId}`);
  await mkdir(directory, { recursive: true });
  const hosts = {
    A: (await resolveHost(body?.hostAImage, path.join(directory, "host_a"))) || (await findHost(directory, "host_a")),
    B: (await resolveHost(body?.hostBImage, path.join(directory, "host_b"))) || (await findHost(directory, "host_b")),
  };
  if (!hosts.A) hosts.A = await solidPortrait(path.join(directory, "host_a.png"), "0x243044");
  if (!hosts.B) hosts.B = await solidPortrait(path.join(directory, "host_b.png"), "0x3a2a44");
  const images = await Promise.all(imageUrls.map((url, index) => downloadImage(url, path.join(directory, `news-${index}`))));

  const parts: string[] = [];
  let cursor = 0;
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const file = path.join(directory, `segment-${String(index).padStart(2, "0")}.mp4`);
    const image = images[segment.imageIndex] || "";
    try {
      segment.audioPath = await writeAudio(segment.audioDataUrl, path.join(directory, `voice-${String(index).padStart(2, "0")}.mp3`));
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
  let videoUrl = "";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const stored = await uploadPublicObject({
      bucket: STORAGE_BUCKETS.userAssets,
      path: `news-podcast/${jobId}.mp4`,
      bytes: mp4,
      contentType: "video/mp4",
      upsert: true,
    });
    if ("publicUrl" in stored && stored.publicUrl) videoUrl = stored.publicUrl;
  }
  if (!videoUrl) videoUrl = `data:video/mp4;base64,${mp4.toString("base64")}`;

  return Response.json({
    jobId,
    videoPath: finalPath,
    videoUrl,
    durationSec: Math.round(cursor * 100) / 100,
  });
}

function parseSegments(value: unknown, texts: string[]): Segment[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 14) return null;
  const segments: Segment[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object") return null;
    const record = item as { speaker?: unknown; audioDataUrl?: unknown; durationSec?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const audioDataUrl = typeof record.audioDataUrl === "string" && record.audioDataUrl.startsWith("data:audio/") ? record.audioDataUrl : "";
    const durationSec = typeof record.durationSec === "number" && record.durationSec > 0 ? Math.min(record.durationSec, 30) : 0;
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    if (!speaker || !audioDataUrl || !durationSec) return null;
    segments.push({ speaker, audioPath: "", audioDataUrl, durationSec, imageIndex, text: (texts[index] || "").slice(0, 240) });
  }
  return segments;
}

async function writeAudio(dataUrl: string, destination: string) {
  const match = /^data:audio\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("The voice clip was not a valid audio data URL.");
  await writeFile(destination, Buffer.from(match[1].replace(/\s/g, ""), "base64"));
  return destination;
}

async function resolveHost(value: unknown, filePath: string) {
  const saved = await saveHostImage(value, filePath);
  if (saved) return saved;
  if (typeof value === "string" && value.startsWith("https://")) return downloadImage(value, filePath);
  return "";
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
    hostFilter(2, talkingA, frames, "hosta"),
    hostFilter(3, !talkingA, frames, "hostb"),
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
    "-loop",
    "1",
    "-t",
    duration,
    "-i",
    hosts.A,
    "-loop",
    "1",
    "-t",
    duration,
    "-i",
    hosts.B,
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

function hostFilter(input: number, active: boolean, frames: number, label: string) {
  const pulse = active
    ? `zoompan=z='1.04+0.035*sin(on/7)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=456x516:fps=30,pad=480:540:12:12:color=0x818cf8`
    : `scale=456:516:force_original_aspect_ratio=increase,crop=456:516,eq=brightness=-0.22:saturation=0.7,pad=480:540:12:12:color=0x1a1d27,fps=30,trim=duration=${(frames / 30).toFixed(2)}`;
  return `[${input}:v]scale=700:780:force_original_aspect_ratio=increase,crop=700:780,${pulse},setpts=PTS-STARTPTS[${label}]`;
}

function markExecutable(file: string) {
  try {
    chmodSync(file, 0o755);
  } catch {
    return;
  }
}

function locateFfmpeg() {
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    binary,
    typeof ffmpegPath === "string" ? ffmpegPath : "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", name),
    "/var/task/node_modules/ffmpeg-static/ffmpeg",
    "/tmp/ffmpeg",
  ];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    markExecutable(candidate);
    binary = candidate;
    ffmpeg.setFfmpegPath(candidate);
    return candidate;
  }
  return "";
}

async function ensureFfmpeg() {
  const found = locateFfmpeg();
  if (found) return found;
  if (process.platform !== "linux") throw new Error("The ffmpeg binary was not found.");
  const target = "/tmp/ffmpeg";
  const response = await fetch("https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64");
  if (!response.ok) throw new Error(`Could not download ffmpeg (${response.status}).`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  markExecutable(target);
  binary = target;
  ffmpeg.setFfmpegPath(target);
  return target;
}

function solidPortrait(file: string, color: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, ["-y", "-f", "lavfi", "-i", `color=c=${color}:s=480x540`, "-frames:v", "1", file], { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(file) : reject(new Error("Could not prepare a host portrait."))));
  });
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
    ffmpeg.setFfmpegPath(binary);
    const child = spawn(binary, args, { windowsHide: true });
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
