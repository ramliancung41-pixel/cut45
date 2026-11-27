import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import {
  assAlignmentForAnchor,
  marginVForAnchor,
  mergeOverlappingCues,
  wrapSubtitleLines,
  type SubtitleAnchor,
} from "@/lib/subtitle-cues";

type Cue = { startSec?: number; endSec?: number; subtitleText?: string };
type Aspect = "9:16" | "4:5" | "16:9";

/** How to cover / remove hardcoded burned-in subtitles in the lower third. */
export type SubtitleMaskMode = "none" | "blur" | "banner";

export type SubtitleMaskRegion = {
  /** Horizontal origin as % of frame width (0–100). */
  xPercent: number;
  /** Vertical origin as % of frame height (0–100). */
  yPercent: number;
  /** Width as % of frame width. */
  wPercent: number;
  /** Height as % of frame height. */
  hPercent: number;
};

export const DEFAULT_SUBTITLE_MASK: SubtitleMaskRegion = {
  xPercent: 8,
  yPercent: 82,
  wPercent: 84,
  hPercent: 12,
};

let ffmpeg: FFmpeg | null = null;

export async function renderLocalRecap(options: {
  file: File;
  lines: Cue[];
  aspect: Aspect;
  onProgress: (percent: number) => void;
  maskMode?: SubtitleMaskMode;
  maskRegion?: SubtitleMaskRegion;
  /** Prefer opaque ASS box behind new captions (covers old text + readability). */
  subtitleStyle?: "outline" | "pill";
  /** ASS MarginV override — ignored when subtitleAnchor is set. */
  subtitleMarginV?: number;
  /** Responsive safe-area anchor for burned-in captions. */
  subtitleAnchor?: SubtitleAnchor;
}) {
  const engine = await loadEngine(options.onProgress);
  const frame = options.aspect === "16:9" ? { w: 1280, h: 720, cover: true } : options.aspect === "4:5" ? { w: 864, h: 1080, cover: false } : { w: 720, h: 1280, cover: false };
  const inputName = `input${extension(options.file.name)}`;
  await engine.writeFile(inputName, await fetchFile(options.file));
  const style = options.subtitleStyle ?? (options.maskMode === "banner" || options.maskMode === "blur" ? "pill" : "outline");
  const anchor = options.subtitleAnchor ?? "bottom";
  const marginV =
    typeof options.subtitleMarginV === "number" && options.subtitleMarginV > 0 && !options.subtitleAnchor
      ? Math.round(options.subtitleMarginV)
      : marginVForAnchor(anchor, frame.h);
  const cues = mergeOverlappingCues(options.lines);
  await engine.writeFile("subs.ass", assFile(cues, frame, style, marginV, anchor));
  await engine.writeFile("NotoSansMyanmar-Regular.ttf", await fetchFile("/fonts/NotoSansMyanmar-Regular.ttf"));
  await engine.writeFile("NotoSans-Regular.ttf", await fetchFile("/fonts/NotoSans-Regular.ttf"));
  const duration = Math.max(...cues.map((line) => line.endSec ?? 0), 1).toFixed(2);
  const blur = frame.cover ? "64:36" : "36:64";
  const fit = frame.cover
    ? `scale=${frame.w}:${frame.h}:force_original_aspect_ratio=increase,crop=${frame.w}:${frame.h}`
    : `scale=${frame.w}:${frame.h}:force_original_aspect_ratio=decrease`;

  const maskMode = options.maskMode ?? "none";
  const region = options.maskRegion ?? DEFAULT_SUBTITLE_MASK;
  const chrome = `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.55:t=2,drawbox=x=2:y=ih-5:w='max(2\\,(iw-4)*t/${duration})':h=3:color=white@0.9:t=fill`;
  const fgChain = buildForegroundChain(fit, maskMode, region, frame, chrome);

  const filter = [
    "[0:v]fps=30,setpts=PTS-STARTPTS,split=2[bg][fg]",
    `[bg]scale=${blur}:force_original_aspect_ratio=increase,crop=${blur},scale=${frame.w}:${frame.h}:flags=bilinear,eq=brightness=-0.12:saturation=1.1,setsar=1[blur]`,
    ...fgChain,
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

/**
 * Smart blur / solid cover over the hardcoded subtitle region.
 * Uses crop+boxblur+overlay (delogo-like) or a solid frosted drawbox.
 */
function buildForegroundChain(
  fit: string,
  mode: SubtitleMaskMode,
  region: SubtitleMaskRegion,
  frame: { w: number; h: number },
  chrome: string,
) {
  if (mode === "none") {
    return [`[fg]${fit},setsar=1,${chrome}[fit]`];
  }
  const x = Math.max(0, Math.round((region.xPercent / 100) * frame.w));
  const y = Math.max(0, Math.round((region.yPercent / 100) * frame.h));
  const w = Math.max(8, Math.round((region.wPercent / 100) * frame.w));
  const h = Math.max(8, Math.round((region.hPercent / 100) * frame.h));
  const safeW = Math.min(w, frame.w - x);
  const safeH = Math.min(h, frame.h - y);
  if (mode === "blur") {
    return [
      `[fg]${fit},setsar=1,split=2[base][band]`,
      `[band]crop=${safeW}:${safeH}:${x}:${y},boxblur=12:8[blurred]`,
      `[base][blurred]overlay=${x}:${y},${chrome}[fit]`,
    ];
  }
  // Compact frosted cover — old text unreadable without swallowing the whole lower frame.
  return [`[fg]${fit},setsar=1,drawbox=x=${x}:y=${y}:w=${safeW}:h=${safeH}:color=black@0.78:t=fill,${chrome}[fit]`];
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

function responsiveFontSize(frame: { w: number; h: number }, dual: boolean) {
  // Proportional to clamp(13px, 2.2vw, 20px) scaled into PlayRes coordinates.
  const base = Math.round(Math.min(frame.w, frame.h) * (frame.w > frame.h ? 0.032 : 0.036));
  const size = Math.max(26, Math.min(frame.w > frame.h ? 40 : 44, base));
  return dual ? Math.max(22, size - 6) : size;
}

function assFile(lines: Cue[], frame: { w: number; h: number }, style: "outline" | "pill", marginV: number, anchor: SubtitleAnchor) {
  const alignment = assAlignmentForAnchor(anchor);
  const events = lines
    .filter((line) => (line.subtitleText || "").trim())
    .map((line) => {
      const text = wrapSubtitleLines(line.subtitleText || "", frame.w > frame.h ? 48 : 36);
      const styleName = text.includes("\n") ? "Dual" : "News";
      const myanmar = /[\u1000-\u109F]/.test(text);
      const font = myanmar ? "" : "{\\fnNoto Sans\\b1}";
      return `Dialogue: 0,${assTime(line.startSec ?? 0)},${assTime(line.endSec ?? 0)},${styleName},,0,0,0,,${font}${escapeAss(text)}`;
    })
    .join("\n");
  const newsSize = responsiveFontSize(frame, false);
  const dualSize = responsiveFontSize(frame, true);
  // BorderStyle 3 = opaque pill. Compact outline padding keeps the box tight.
  const borderStyle = style === "pill" ? 3 : 1;
  const outline = style === "pill" ? 6 : 2.4;
  const shadow = style === "pill" ? 0 : 1;
  const back = style === "pill" ? "&HC70A0C10" : "&H64000000";
  const side = Math.round(frame.w * 0.075);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${frame.w}
PlayResY: ${frame.h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: News,Noto Sans Myanmar,${newsSize},&H00FFFFFF,&H00FFFFFF,&H00000000,${back},1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${side},${side},${marginV},1
Style: Dual,Noto Sans Myanmar,${dualSize},&H00FFFFFF,&H00FFFFFF,&H00000000,${back},1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${side},${side},${Math.max(24, marginV - 4)},1

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
