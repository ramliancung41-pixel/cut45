import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Cue = { startSec?: number; endSec?: number; subtitleText?: string };
type Aspect = "9:16" | "4:5" | "16:9";

let ffmpeg: FFmpeg | null = null;

export async function renderLocalRecap(options: {
  file: File;
  lines: Cue[];
  aspect: Aspect;
  onProgress: (percent: number) => void;
}) {
  const engine = await loadEngine(options.onProgress);
  const frame = options.aspect === "16:9" ? { w: 1280, h: 720, cover: true } : options.aspect === "4:5" ? { w: 864, h: 1080, cover: false } : { w: 720, h: 1280, cover: false };
  const inputName = `input${extension(options.file.name)}`;
  await engine.writeFile(inputName, await fetchFile(options.file));
  await engine.writeFile("subs.ass", assFile(options.lines, frame));
  await engine.writeFile("NotoSansMyanmar-Regular.ttf", await fetchFile("/fonts/NotoSansMyanmar-Regular.ttf"));
  const duration = Math.max(...options.lines.map((line) => line.endSec ?? 0), 1).toFixed(2);
  const blur = frame.cover ? "64:36" : "36:64";
  const fit = frame.cover
    ? `scale=${frame.w}:${frame.h}:force_original_aspect_ratio=increase,crop=${frame.w}:${frame.h}`
    : `scale=${frame.w}:${frame.h}:force_original_aspect_ratio=decrease`;
  const filter = [
    "[0:v]fps=30,setpts=PTS-STARTPTS,split=2[bg][fg]",
    `[bg]scale=${blur}:force_original_aspect_ratio=increase,crop=${blur},scale=${frame.w}:${frame.h}:flags=bilinear,eq=brightness=-0.12:saturation=1.1,setsar=1[blur]`,
    `[fg]${fit},setsar=1,drawbox=x=0:y=0:w=iw:h=ih:color=white@0.8:t=2,drawbox=x=2:y=ih-6:w='max(2\\,(iw-4)*t/${duration})':h=4:color=white@0.95:t=fill[fit]`,
    "[blur][fit]overlay=(W-w)/2:(H-h)/2,ass=subs.ass:fontsdir=. [vout]",
  ].join(";");
  const code = await engine.exec([
    "-i",
    inputName,
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "recap.mp4",
  ]);
  if (code !== 0) throw new Error("The video could not be rendered in the browser.");
  const data = await engine.readFile("recap.mp4");
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  return new Blob([Uint8Array.from(bytes)], { type: "video/mp4" });
}

async function loadEngine(onProgress: (percent: number) => void) {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress(Math.max(0, Math.min(100, Math.round(progress * 100)))));
  if (!ffmpeg.loaded) {
    const base = "/ffmpeg";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }
  return ffmpeg;
}

function extension(name: string) {
  const match = name.toLowerCase().match(/\.(mp4|webm|mov)$/);
  return match ? match[0] : ".mp4";
}

function assFile(lines: Cue[], frame: { w: number; h: number }) {
  const events = lines
    .filter((line) => (line.subtitleText || "").trim())
    .map((line) => {
      const style = (line.subtitleText || "").includes("\n") ? "Dual" : "News";
      return `Dialogue: 0,${assTime(line.startSec ?? 0)},${assTime(line.endSec ?? 0)},${style},,0,0,0,,${escapeAss(line.subtitleText || "")}`;
    })
    .join("\n");
  const wide = frame.w > frame.h;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${frame.w}
PlayResY: ${frame.h}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: News,Noto Sans Myanmar,${wide ? 42 : 46},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,0,2,70,70,${wide ? 56 : frame.h >= 1200 ? 90 : 72},1
Style: Dual,Noto Sans Myanmar,${wide ? 34 : 36},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,0,2,70,70,${wide ? 48 : frame.h >= 1200 ? 70 : 60},1

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
