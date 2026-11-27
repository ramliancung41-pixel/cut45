"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { CreditBar } from "@/components/credit-provider";
import { useStudioAccount } from "@/components/profile-credit-bar";

import {
  DEFAULT_SUBTITLE_MASK,
  renderLocalRecap,
  type SubtitleMaskMode,
  type SubtitleMaskRegion,
} from "@/lib/local-recap";
import {
  SUBTITLE_ANCHORS,
  activeCueAt,
  mergeOverlappingCues,
  type SubtitleAnchor,
} from "@/lib/subtitle-cues";
import { SUBTITLE_LANGUAGE_OPTIONS, type SubtitleLanguageCode } from "@/lib/subtitle-languages";

const subtitleFont = Inter({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-subtitle",
  display: "swap",
});

const STEPS = ["Writing script", "Recording voices", "3D lip-sync", "Rendering"] as const;
const VIDEO_PIPELINE_STEPS = ["Uploading", "Detecting Voice", "Transcribing", "Translating", "Rendering"] as const;

type Line = {
  speaker?: "A" | "B";
  voiceText?: string;
  text?: string;
  subtitleText?: string;
  subtitle?: string;
  imageIndex?: number;
  startSec?: number;
  endSec?: number;
  speakerType?: "male" | "male_elder" | "female" | "female_elder" | "child_boy" | "child_girl";
};
type Clip = Line & { path: string; audioDataUrl?: string; durationSec: number; actualDurationSec?: number };
type Language = "burmese" | "english";
type SubtitleLanguage = SubtitleLanguageCode;
type Aspect = "9:16" | "4:5" | "16:9";
type Gender = "male" | "female";
type Preset = "father-son" | "hosts";
type PipelineStep = (typeof VIDEO_PIPELINE_STEPS)[number] | "";

const glass = "bg-white/[0.04] backdrop-blur-2xl border border-white/[0.12] shadow-[0_8px_40px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/10 rounded-2xl";

export default function NewsPodcastPage() {
  const [news, setNews] = useState("");
  const [images, setImages] = useState<string[]>(["", "", ""]);
  const [mediaMode, setMediaMode] = useState<"images" | "video">("images");
  const [sourceVideoUrl, setSourceVideoUrl] = useState("");
  const [sourcePreview, setSourcePreview] = useState("");
  const [sourceDuration, setSourceDuration] = useState(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const [sourceMeta, setSourceMeta] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState<Language>("english");
  const [subtitleLanguage, setSubtitleLanguage] = useState<SubtitleLanguage>("english");
  const [aspectChoice, setAspectChoice] = useState<"auto" | Aspect>("auto");
  const [deviceAspect, setDeviceAspect] = useState<Aspect>("9:16");
  const [preset, setPreset] = useState<Preset>("hosts");
  const [hostAGender, setHostAGender] = useState<Gender>("male");
  const [hostBGender, setHostBGender] = useState<Gender>("female");
  const [hostAImage, setHostAImage] = useState("");
  const [hostBImage, setHostBImage] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [mobileGallery, setMobileGallery] = useState(false);
  const [scanningScript, setScanningScript] = useState(false);
  const [scriptProgress, setScriptProgress] = useState("");
  const sourceFileRef = useRef<File | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [videoStep, setVideoStep] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showPlayer, setShowPlayer] = useState(true);
  const [detectedLanguageLabel, setDetectedLanguageLabel] = useState("");
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("");
  const [coverOriginalSubs, setCoverOriginalSubs] = useState(true);
  const [maskMode, setMaskMode] = useState<SubtitleMaskMode>("banner");
  const [maskRegion, setMaskRegion] = useState<SubtitleMaskRegion>(DEFAULT_SUBTITLE_MASK);
  const [subtitleAnchor, setSubtitleAnchor] = useState<SubtitleAnchor>("bottom");
  const newsPicker = useRef<HTMLInputElement>(null);
  const slotRef = useRef(0);

  const newsImages = images.filter((item) => item.startsWith("data:image/"));
  const hosts = { hostAGender, hostBGender, hostAImage, hostBImage };
  const previewCues = mergeOverlappingCues(lines);

  async function writeDubScript(file: File, durationSec: number) {
    setScanningScript(true);
    setError("");
    setDetectedLanguageLabel("");
    setPipelineStep("Uploading");
    setScriptProgress("Uploading · preparing 16 kHz mono PCM audio...");
    try {
      setLines([]);
      setPipelineStep("Detecting Voice");
      setScriptProgress("Detecting Voice · extracting audio + reading on-screen subtitles...");
      const [chunks, ocrFrames] = await Promise.all([extractAudioChunks(file, durationSec), extractSubtitleFrames(file, durationSec)]);
      let finished = 0;
      let wrote = 0;
      let lastError = "The subtitles could not be written.";
      let detected = "";
      setPipelineStep("Transcribing");
      setScriptProgress(`Transcribing full ${formatClock(durationSec)} · overlapping 60s streams · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}...`);
      await mapPool(chunks, 1, async (chunk) => {
        try {
          if (finished === 0) {
            setPipelineStep("Detecting Voice");
            setScriptProgress("Detecting Voice · Whisper auto-detect (temperature 0)...");
          } else {
            setPipelineStep("Translating");
            setScriptProgress(`Translating · chunk ${finished + 1}/${chunks.length} (audio + OCR merge)...`);
          }
          const audioBase64 = await blobToBase64(chunk.blob);
          const chunkFrames = ocrFrames.filter(
            (frame) => frame.timeSec >= chunk.offset - 0.05 && frame.timeSec < chunk.offset + chunk.duration + 0.05,
          );
          const scriptResponse = await fetch("/api/news-podcast/script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Never send news-topic text into video transcription — it causes fake fallback dialogue.
              news: "",
              subtitleLanguage,
              audioBase64,
              audioMimeType: chunk.mime,
              chunkOffsetSec: chunk.offset,
              chunkDurationSec: chunk.duration,
              ocrFrames: chunkFrames.map((frame) => ({
                timeSec: Math.max(0, frame.timeSec - chunk.offset),
                imageBase64: frame.imageBase64,
                mime: frame.mime,
              })),
            }),
          });
          const script = (await scriptResponse.json().catch(() => null)) as {
            lines?: Line[];
            error?: string;
            detectedLanguageLabel?: string;
            detectedLanguage?: string;
            keys?: { groq?: boolean; openai?: boolean; gemini?: boolean };
            detail?: { hasAudioChunk?: boolean; audioMimeType?: string | null; ocrFrameCount?: number };
          } | null;
          if (!scriptResponse.ok || !script?.lines) {
            const keyHint = script?.keys
              ? ` Keys: Groq=${script.keys.groq ? "yes" : "no"}, OpenAI=${script.keys.openai ? "yes" : "no"}, Gemini=${script.keys.gemini ? "yes" : "no"}.`
              : "";
            throw new Error(`${script?.error ?? "The subtitles could not be written."}${keyHint}`);
          }
          if (!detected && (script.detectedLanguageLabel || script.detectedLanguage)) {
            detected = script.detectedLanguageLabel || script.detectedLanguage || "";
            setDetectedLanguageLabel(detected);
          }
          const cues = script.lines;
          wrote += cues.length;
          setPipelineStep("Translating");
          setLines((current) => mergeOverlappingCues([...current, ...cues]));
        } catch (caught) {
          lastError = caught instanceof Error ? caught.message : lastError;
        } finally {
          finished += 1;
          setScriptProgress(
            `Transcribing → Translating · ${formatClock(durationSec)} · ${finished}/${chunks.length}${detected ? ` · Detected: ${detected}` : ""}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      });
      if (wrote === 0) throw new Error(lastError);
      setPipelineStep("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The script could not be written.");
      setPipelineStep("");
    } finally {
      setScanningScript(false);
      setScriptProgress("");
    }
  }

  async function generateVideo() {
    setRunning(true);
    setError("");
    setVideoUrl("");
    setShowPlayer(true);
    setClips([]);
    setCaptionIndex(0);
    if (mediaMode !== "video") setLines([]);
    try {
      let scriptLines = lines;
      if (mediaMode !== "video") {
        setVideoStep(STEPS[0]);
        const scriptResponse = await fetch("/api/news-podcast/script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            news,
            voiceLanguage,
            subtitleLanguage,
            preset,
            imageCount: newsImages.length,
            videoUrl: "",
          }),
        });
        const script = (await scriptResponse.json().catch(() => null)) as { lines?: Line[]; error?: string } | null;
        if (!scriptResponse.ok || !script?.lines) throw new Error(script?.error ?? "The script could not be written.");
        scriptLines = script.lines;
        setLines(script.lines);
      } else if (scriptLines.length === 0) {
        throw new Error("Wait for the subtitles, or press Regenerate Subtitles.");
      }

      let jobId = crypto.randomUUID();
      let videos: Array<Record<string, unknown>> = [];
      if (mediaMode === "video") {
        const sourceFile = sourceFileRef.current;
        if (!sourceFile) throw new Error("Choose a video first.");
        const aspect = aspectChoice === "auto" ? deviceAspect : aspectChoice;
        setPipelineStep("Rendering");
        setVideoStep("Rendering · burning clean subtitles... 0%");
        const activeMask: SubtitleMaskMode = coverOriginalSubs ? maskMode : "none";
        const blob = await renderLocalRecap({
          file: sourceFile,
          lines: mergeOverlappingCues(scriptLines),
          aspect,
          maskMode: activeMask,
          maskRegion,
          subtitleStyle: "pill",
          subtitleAnchor,
          onProgress: (percent) => setVideoStep(`Rendering · burning clean subtitles... ${percent}%`),
        });
        const localVideo = URL.createObjectURL(blob);
        setVideoUrl((current) => {
          if (current.startsWith("blob:")) URL.revokeObjectURL(current);
          return localVideo;
        });
        setShowPlayer(true);
        setVideoStep("Complete");
        setPipelineStep("");
        return;
      } else {
      setVideoStep(STEPS[1]);
      const audioResponse = await fetch("/api/news-podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: voiceLanguage, lines: scriptLines, mediaMode, ...hosts }),
      });
      const audioRaw = await audioResponse.text();
      let audio: { jobId?: string; clips?: Clip[]; error?: string } | null = null;
      try {
        audio = audioRaw ? (JSON.parse(audioRaw) as { jobId?: string; clips?: Clip[]; error?: string }) : null;
      } catch {
        audio = null;
      }
      if (!audioResponse.ok || !audio?.jobId || !audio.clips?.length) {
        throw new Error(audio?.error || audioRaw.slice(0, 500) || "The voices could not be generated.");
      }
      setClips(audio.clips);
      jobId = audio.jobId;
      videos = audio.clips.map((clip) => ({
        speaker: clip.speaker,
        speakerType: clip.speakerType,
        audioDataUrl: clip.audioDataUrl,
        durationSec: clip.actualDurationSec || clip.durationSec,
        imageIndex: clip.imageIndex ?? 0,
        startSec: clip.startSec,
        endSec: clip.endSec,
        subtitleText: clip.subtitleText ?? "",
      }));
      }

      setVideoStep("Rendering");
      const renderResponse = await fetch("/api/news-podcast/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          title: news.trim().slice(0, 120),
          lines: scriptLines,
          imageUrls: newsImages,
          sourceVideoUrl: "",
          aspectRatio: "9:16",
          hostAGender,
          hostBGender,
          hostAImage,
          hostBImage,
          videos,
        }),
      });
      const raw = await renderResponse.text();
      let rendered: { videoUrl?: string; error?: string } | null = null;
      try {
        rendered = raw ? (JSON.parse(raw) as { videoUrl?: string; error?: string }) : null;
      } catch {
        rendered = null;
      }
      const finalVideoUrl = rendered?.videoUrl || "";
      if (!renderResponse.ok || !finalVideoUrl) throw new Error(rendered?.error || raw.slice(0, 500) || "The news video could not be assembled.");
      setVideoUrl(finalVideoUrl);
      setShowPlayer(true);
      setVideoStep("Complete");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The news video could not be assembled.";
      setError(message);
      setVideoStep("Failed");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    setMobileGallery(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    const width = window.innerWidth;
    setDeviceAspect(width >= 1024 ? "16:9" : width >= 768 ? "4:5" : "9:16");
  }, []);

  useEffect(() => {
    if (!running || lines.length < 2) return;
    const timer = window.setInterval(() => {
      setCaptionIndex((current) => (current + 1) % lines.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [running, lines]);

  function downloadSrt() {
    const body = previewCues
      .map((line, index) => `${index + 1}\n${srtClock(line.startSec ?? 0)} --> ${srtClock(line.endSec ?? 0)}\n${line.subtitleText || ""}\n`)
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    link.download = "cut45-recap.srt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function downloadMp4(url: string) {
    const response = await fetch(url);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cut45-recap.mp4";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function saveToGallery(url: string) {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], "cut45-recap.mp4", { type: "video/mp4" });
    try {
      await navigator.share({ files: [file], title: "CUT45 Video" });
    } catch {
      /* The share sheet was dismissed. */
    }
  }

  async function playVoices() {
    for (const clip of clips) {
      if (!clip.audioDataUrl) continue;
      const audio = new Audio(clip.audioDataUrl);
      audio.volume = 1;
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
    }
  }

  async function acceptSourceVideo(file: File | undefined) {
    if (!file || !/^video\/(mp4|webm|quicktime)$/.test(file.type)) {
      setError("Upload an MP4, WebM, or MOV.");
      return;
    }
    const localUrl = URL.createObjectURL(file);
    const duration = await new Promise<number>((resolve) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0);
      probe.onerror = () => resolve(0);
      probe.src = localUrl;
    });
    if (duration <= 0 || duration > 3600) {
      URL.revokeObjectURL(localUrl);
      setError(duration > 3600 ? "Keep the source video under 60 minutes." : "That video could not be read.");
      return;
    }
    sourceFileRef.current = file;
    setSourceMeta(`${formatSize(file.size)} · ${formatClock(duration)}`);
    setSourceDuration(duration);
    setSourcePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return localUrl;
    });
    void writeDubScript(file, duration);
    setError("");
  }

  function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function srtClock(seconds: number) {
  return vttClock(seconds).replace(".", ",");
}

function vttClock(seconds: number) {
  const whole = Math.max(0, seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

async function extractAudioChunks(file: File, durationSec: number) {
  // Equivalent to FFmpeg: -vn -acodec pcm_s16le -ar 16000 -ac 1
  // Overlapping 60s windows keep quiet speech near chunk boundaries from being dropped.
  const decoded = await new AudioContext().decodeAudioData(await file.arrayBuffer());
  const totalSamples = Math.max(1, Math.ceil(Math.max(decoded.duration, durationSec) * 16000));
  const offline = new OfflineAudioContext(1, totalSamples, 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  const pieces: Array<{ offset: number; duration: number; samples: Float32Array }> = [];
  const span = 60;
  const overlap = 2;
  const step = Math.max(1, span - overlap);
  for (let offset = 0; offset < durationSec; offset += step) {
    const length = Math.min(span, durationSec - offset);
    if (length < 0.25) break;
    const start = Math.floor(offset * 16000);
    const end = Math.min(samples.length, Math.floor((offset + length) * 16000));
    // Copy the slice — subarray views can be invalidated across chunks.
    pieces.push({ offset, duration: length, samples: samples.slice(start, end) });
    if (offset + length >= durationSec - 0.01) break;
  }
  if (pieces.length === 0) {
    pieces.push({ offset: 0, duration: durationSec, samples: samples.slice() });
  }
  const chunks: Array<{ offset: number; duration: number; blob: Blob; mime: "audio/wav" }> = [];
  for (const piece of pieces) {
    // Always send PCM WAV — Opus/WebM increases Whisper hallucination risk.
    chunks.push({ offset: piece.offset, duration: piece.duration, blob: encodeWav(piece.samples, 16000), mime: "audio/wav" });
  }
  return chunks;
}

/** Sample lower-third keyframes so Gemini Vision can OCR burned-in captions. */
async function extractSubtitleFrames(file: File, durationSec: number) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not read video frames for subtitle OCR."));
    });
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    const canvas = document.createElement("canvas");
    const cropY = Math.floor(height * 0.68);
    const cropH = Math.max(32, Math.floor(height * 0.28));
    canvas.width = Math.min(960, width);
    canvas.height = Math.round((canvas.width / width) * cropH);
    const context = canvas.getContext("2d");
    if (!context) return [];

    const step = durationSec <= 45 ? 2 : durationSec <= 180 ? 3.5 : 5;
    const times: number[] = [];
    for (let time = 0.2; time < durationSec; time += step) times.push(Math.min(durationSec - 0.05, time));
    if (times.length === 0) times.push(Math.min(durationSec / 2, durationSec - 0.05));
    // Always include the final second so ending captions are OCR'd.
    const last = Math.max(0.1, durationSec - 0.15);
    if (!times.some((time) => Math.abs(time - last) < 0.4)) times.push(last);

    const frames: Array<{ timeSec: number; imageBase64: string; mime: "image/jpeg" }> = [];
    for (const time of times.slice(0, 36)) {
      await seekVideo(video, time);
      context.drawImage(video, 0, cropY, width, cropH, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      const imageBase64 = dataUrl.split(",")[1] || "";
      if (imageBase64) frames.push({ timeSec: time, imageBase64, mime: "image/jpeg" });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not seek the video for OCR."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = Math.max(0, time);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Could not seek the video for OCR."));
    }
  });
}

function encodeOpusWebm(samples: Float32Array, sampleRate: number) {
  return new Promise<Blob>((resolve, reject) => {
    const packets: Array<{ data: Uint8Array; timestamp: number }> = [];
    const encoder = new AudioEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        packets.push({ data, timestamp: chunk.timestamp });
      },
      error: () => reject(new Error("The audio track could not be compressed.")),
    });
    encoder.configure({ codec: "opus", sampleRate, numberOfChannels: 1, bitrate: 24_000 });
    const frame = Math.floor(sampleRate / 50);
    for (let index = 0; index < samples.length; index += frame) {
      const data = new Float32Array(frame);
      data.set(samples.subarray(index, Math.min(samples.length, index + frame)));
      const audio = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frame,
        numberOfChannels: 1,
        timestamp: Math.round((index / sampleRate) * 1_000_000),
        data,
      });
      encoder.encode(audio);
      audio.close();
    }
    void encoder.flush().then(() => resolve(new Blob([muxOpusWebm(packets, sampleRate)], { type: "audio/webm" }))).catch(reject);
  });
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeText(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function muxOpusWebm(packets: Array<{ data: Uint8Array; timestamp: number }>, sampleRate: number) {
  const clusters: Uint8Array[] = [];
  for (let index = 0; index < packets.length; ) {
    const origin = packets[index]?.timestamp ?? 0;
    const group: Array<{ data: Uint8Array; timestamp: number }> = [];
    while (index < packets.length && (packets[index]?.timestamp ?? 0) - origin < 30_000_000) {
      const packet = packets[index];
      if (packet) group.push(packet);
      index += 1;
    }
    clusters.push(ebml(0x1f43b675, muxCluster(group, origin)));
  }
  const segment = concatBytes([ebml(0x1549a966, muxInfo()), ebml(0x1654ae6b, muxTracks(sampleRate)), ...clusters]);
  return concatBytes([ebml(0x1a45dfa3, concatBytes([ebml(0x4286, bytes(1)), ebml(0x42f7, bytes(1)), ebml(0x42f2, bytes(4)), ebml(0x42f3, bytes(8)), ebml(0x4282, text("webm")), ebml(0x4287, bytes(4)), ebml(0x4285, bytes(2))])), ebml(0x18538067, segment)]);
}

function muxInfo() {
  return concatBytes([ebml(0x2ad7b1, bytes(0x0f, 0x42, 0x40)), ebml(0x4d80, text("CUT45")), ebml(0x5741, text("CUT45"))]);
}

function muxTracks(sampleRate: number) {
  const head = new Uint8Array(19);
  writeTextBytes(head, 0, "OpusHead");
  head[8] = 1;
  head[9] = 1;
  new DataView(head.buffer).setUint32(12, sampleRate, true);
  const track = concatBytes([
    ebml(0xd7, bytes(1)),
    ebml(0x73c5, bytes(1)),
    ebml(0x83, bytes(2)),
    ebml(0x86, text("A_OPUS")),
    ebml(0x63a2, head),
  ]);
  return ebml(0xae, track);
}

function muxCluster(packets: Array<{ data: Uint8Array; timestamp: number }>, origin: number) {
  const blocks = packets.map((packet) => {
    const timecode = Math.max(0, Math.min(32767, Math.round((packet.timestamp - origin) / 1000)));
    const body = new Uint8Array(4 + packet.data.length);
    body[0] = 0x81;
    body[1] = (timecode >> 8) & 0xff;
    body[2] = timecode & 0xff;
    body[3] = 0x80;
    body.set(packet.data, 4);
    return ebml(0xa3, body);
  });
  return concatBytes([ebml(0xe7, uintBytes(Math.round(origin / 1000))), ...blocks]);
}

function uintBytes(value: number) {
  if (value <= 0xff) return bytes(value);
  if (value <= 0xffff) return bytes((value >> 8) & 0xff, value & 0xff);
  return bytes((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function ebml(id: number, data: Uint8Array) {
  const idBytes = id > 0xffffff ? bytes((id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff) : id > 0xffff ? bytes((id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff) : bytes((id >> 8) & 0xff, id & 0xff);
  return concatBytes([idBytes, vint(data.length), data]);
}

function vint(length: number) {
  if (length < 0x7f) return bytes(0x80 | length);
  if (length < 0x3fff) return bytes(0x40 | ((length >> 8) & 0x3f), length & 0xff);
  if (length < 0x1fffff) return bytes(0x20 | ((length >> 16) & 0x1f), (length >> 8) & 0xff, length & 0xff);
  return bytes(0x10 | ((length >> 24) & 0x07), (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff);
}

function bytes(...values: number[]) {
  return Uint8Array.from(values);
}

function text(value: string) {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function writeTextBytes(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) target[offset + index] = value.charCodeAt(index);
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function compressStudioVideo(file: File, duration: number, onProgress: (percent: number) => void) {
  return new Promise<File>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = false;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That video could not be optimized."));
    };
    video.onloadeddata = () => {
      const longest = Math.max(video.videoWidth, video.videoHeight, 1);
      const scale = Math.min(1, 1280 / longest);
      const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
      const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
        URL.revokeObjectURL(url);
        reject(new Error("This browser cannot optimize the video."));
        return;
      }
      const mime = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((item) => MediaRecorder.isTypeSupported(item)) ?? "";
      if (!mime) {
        URL.revokeObjectURL(url);
        reject(new Error("This browser cannot optimize the video."));
        return;
      }
      const stream = canvas.captureStream(24);
      const withSound = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      withSound?.getAudioTracks().forEach((track) => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The video could not be optimized."));
      };
      recorder.onstop = () => {
        URL.revokeObjectURL(url);
        const type = mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
        onProgress(100);
        resolve(new File([new Blob(chunks, { type })], type === "video/mp4" ? "news.mp4" : "news.webm", { type }));
      };
      const draw = () => {
        context.drawImage(video, 0, 0, width, height);
        onProgress(Math.min(99, Math.round((video.currentTime / Math.max(duration, 0.1)) * 100)));
        if (!video.ended && !video.paused) requestAnimationFrame(draw);
      };
      video.onended = () => recorder.stop();
      recorder.start(500);
      void video.play().then(draw).catch(() => {
        URL.revokeObjectURL(url);
        reject(new Error("The video could not be played for optimizing."));
      });
    };
  });
}

function readImage(file: File | undefined, onReady: (value: string) => void) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    void compressImage(file).then(onReady).catch(() => undefined);
  }

  return (
    <main className={`relative min-h-[100dvh] overflow-hidden bg-[#070914] text-zinc-100 ${subtitleFont.variable}`}>
      <NewsHeader />
      <div className="pointer-events-none absolute -top-48 left-1/3 h-[36rem] w-[36rem] rounded-full bg-indigo-500/25 blur-[140px]" />
      <div className="pointer-events-none absolute top-24 right-0 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[24rem] w-[24rem] rounded-full bg-violet-600/20 blur-[130px]" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <header>
            <h1 className="bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
              CUT45 · AI News Studio
            </h1>
            <p className="mt-2 text-sm text-zinc-400">A vertical news conversation, ready to render.</p>
          </header>

          <label className={`${glass} flex flex-col gap-2 p-4 text-sm`}>
            <span className="text-zinc-300">News article or topic</span>
            <textarea
              value={news}
              onChange={(event) => setNews(event.target.value)}
              rows={6}
              placeholder="Paste the article or describe the story."
              className="resize-none bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </label>

          {mediaMode === "video" ? (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`${glass} flex flex-col gap-2 px-4 py-3 text-sm`}>
                  <span className="text-xs tracking-wide text-zinc-500 uppercase">Target subtitle language</span>
                  <select value={subtitleLanguage} onChange={(event) => setSubtitleLanguage(event.target.value as SubtitleLanguage)} className="bg-transparent text-sm outline-none">
                    {SUBTITLE_LANGUAGE_OPTIONS.filter((option) => option.code !== "none").map((option) => (
                      <option key={option.code} value={option.code} className="bg-[#07090e]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${glass} flex flex-col gap-2 px-4 py-3 text-sm`}>
                  <span className="text-xs tracking-wide text-zinc-500 uppercase">Screen format</span>
                  <select value={aspectChoice} onChange={(event) => setAspectChoice(event.target.value as "auto" | Aspect)} className="bg-transparent text-sm outline-none">
                    <option value="auto" className="bg-[#07090e]">Auto (Device Fit)</option>
                    <option value="9:16" className="bg-[#07090e]">Phone (9:16)</option>
                    <option value="4:5" className="bg-[#07090e]">Tablet (4:5)</option>
                    <option value="16:9" className="bg-[#07090e]">PC / Widescreen (16:9)</option>
                  </select>
                </label>
              </div>
              {detectedLanguageLabel ? (
                <div className={`${glass} flex flex-wrap items-center gap-3 px-4 py-3`}>
                  <span className="text-xs tracking-wide text-zinc-500 uppercase">Detected Audio</span>
                  <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-200">
                    {detectedLanguageLabel}
                  </span>
                </div>
              ) : null}
              <div className={`${glass} flex flex-col gap-3 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Remove / Cover Original Subtitles</h3>
                    <p className="mt-1 text-xs text-zinc-500">Mask hardcoded lower-third captions before burning new ones.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={coverOriginalSubs}
                    onClick={() => setCoverOriginalSubs((current) => !current)}
                    className={`relative h-7 w-12 rounded-full border transition ${coverOriginalSubs ? "border-indigo-300/50 bg-indigo-500/80" : "border-white/15 bg-white/10"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${coverOriginalSubs ? "left-6" : "left-0.5"}`} />
                  </button>
                </div>
                {coverOriginalSubs ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="text-xs tracking-wide text-zinc-500 uppercase">Cover method</span>
                        <select
                          value={maskMode}
                          onChange={(event) => setMaskMode(event.target.value as SubtitleMaskMode)}
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                        >
                          <option value="banner" className="bg-[#07090e]">Clean Background Pill / Banner</option>
                          <option value="blur" className="bg-[#07090e]">Smart Blur / Inpaint Mask</option>
                          <option value="none" className="bg-[#07090e]">Pill only (no region mask)</option>
                        </select>
                      </label>
                      <div className="flex flex-col justify-end text-xs text-zinc-500">
                        {maskMode === "blur"
                          ? "Blurs the subtitle band so old text is unreadable."
                          : maskMode === "banner"
                            ? "Draws a frosted box over the lower third, then burns new ASS captions with BorderStyle=3."
                            : "Keeps the frame clean and relies on the opaque subtitle pill."}
                      </div>
                    </div>
                    {maskMode !== "none" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["yPercent", "Top %", maskRegion.yPercent],
                            ["hPercent", "Height %", maskRegion.hPercent],
                            ["xPercent", "Left %", maskRegion.xPercent],
                            ["wPercent", "Width %", maskRegion.wPercent],
                          ] as const
                        ).map(([key, label, value]) => (
                          <label key={key} className="flex flex-col gap-1 text-xs text-zinc-400">
                            <span className="flex justify-between">
                              <span>{label}</span>
                              <span>{Math.round(value)}</span>
                            </span>
                            <input
                              type="range"
                              min={key === "yPercent" || key === "xPercent" ? 0 : 4}
                              max={key === "hPercent" || key === "wPercent" ? 60 : 95}
                              value={value}
                              onChange={(event) =>
                                setMaskRegion((current) => ({ ...current, [key]: Number(event.target.value) }))
                              }
                              className="accent-indigo-400"
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="flex flex-col gap-2">
                  <span className="text-xs tracking-wide text-zinc-500 uppercase">Subtitle placement</span>
                  <div className="grid grid-cols-3 gap-2">
                    {SUBTITLE_ANCHORS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSubtitleAnchor(option.id)}
                        className={`rounded-xl border px-2 py-2 text-xs transition ${
                          subtitleAnchor === option.id
                            ? "border-indigo-300/50 bg-indigo-500/25 text-indigo-100"
                            : "border-white/10 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {SUBTITLE_ANCHORS.find((option) => option.id === subtitleAnchor)?.hint} · single dark pill · never stacks duplicates
                  </span>
                </div>
              </div>
              {(scanningScript || running || pipelineStep) && mediaMode === "video" ? (
                <div className={`${glass} flex flex-wrap gap-2 px-4 py-3`}>
                  {VIDEO_PIPELINE_STEPS.map((step) => {
                    const active = pipelineStep === step || (running && step === "Rendering" && !pipelineStep);
                    const done =
                      VIDEO_PIPELINE_STEPS.indexOf(step) < VIDEO_PIPELINE_STEPS.indexOf((pipelineStep || "Rendering") as (typeof VIDEO_PIPELINE_STEPS)[number]) ||
                      (videoStep === "Complete" && Boolean(videoUrl));
                    return (
                      <span
                        key={step}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          active
                            ? "border-indigo-300/50 bg-indigo-500/25 text-indigo-100"
                            : done
                              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                              : "border-white/10 text-zinc-500"
                        }`}
                      >
                        {step}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <section className={`${glass} p-4`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Media</h2>
              <div className="grid grid-cols-2 rounded-full border border-white/10 bg-black/30 p-1 text-xs">
                {(["images", "video"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMediaMode(mode)}
                    className={`h-8 rounded-full px-3 ${mediaMode === mode ? "bg-white text-black" : "text-zinc-400"}`}
                  >
                    {mode === "images" ? "News Podcast" : "Video Recap"}
                  </button>
                ))}
              </div>
            </div>
            {mediaMode === "images" ? (
              <>
                <input
                  ref={newsPicker}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    const index = slotRef.current;
                    event.target.value = "";
                    readImage(file, (value) => {
                      setImages((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
                    });
                  }}
                />
                <div className="grid grid-cols-3 gap-3">
                  {images.map((value, index) => (
                    <div key={index} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (value) return;
                          slotRef.current = index;
                          newsPicker.current?.click();
                        }}
                        className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] ring-1 ring-inset ring-white/10 transition hover:border-indigo-300/50 hover:shadow-[0_0_28px_rgba(99,102,241,0.28)]"
                      >
                        {value ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={value} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
                            <UploadIcon />
                            <span className="text-[11px]">Add image</span>
                          </span>
                        )}
                      </button>
                      {value ? (
                        <button
                          type="button"
                          aria-label={`Remove image ${index + 1}`}
                          onClick={() => setImages((current) => current.map((item, itemIndex) => (itemIndex === index ? "" : item)))}
                          className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-black/70 text-sm"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void acceptSourceVideo(event.dataTransfer.files?.[0]);
                }}
                className="flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center ring-1 ring-inset ring-white/10 transition hover:border-indigo-300/50 hover:shadow-[0_0_32px_rgba(99,102,241,0.25)]"
              >
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void acceptSourceVideo(file);
                  }}
                />
                {sourcePreview ? (
                  <video src={sourcePreview} autoPlay muted loop playsInline controls className="max-h-64 w-full rounded-xl bg-black" />
                ) : (
                  <>
                    <UploadIcon />
                    <span className="text-sm text-zinc-300">
                      {optimizeProgress > 0
                        ? `Optimizing video for studio upload... ${optimizeProgress}%`
                        : uploadingVideo
                          ? "Uploading..."
                          : "Drop a video or click to choose"}
                    </span>
                    <span className="text-xs text-zinc-500">MP4, WebM, or MOV · 60 minutes maximum · auto language detect</span>
                  </>
                )}
                {sourceMeta ? <span className="text-xs text-zinc-300">{sourceMeta}</span> : null}
                {detectedLanguageLabel ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
                    Detected Audio: {detectedLanguageLabel}
                  </span>
                ) : null}
                {optimizeProgress > 0 ? <span className="text-xs text-indigo-200">Optimizing video for studio upload... {optimizeProgress}%</span> : null}
                {sourcePreview ? <span className="text-xs text-emerald-300">Ready · {formatClock(sourceDuration)}</span> : null}
              </label>
            )}
          </section>

          {mediaMode === "video" ? (
            <section className={`${glass} flex flex-col gap-3 p-4`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Subtitle timeline</h2>
                <button
                  type="button"
                  disabled={!sourcePreview || scanningScript || running}
                  onClick={() => sourceFileRef.current && void writeDubScript(sourceFileRef.current, sourceDuration)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Regenerate Subtitles
                </button>
              </div>
              {scanningScript ? <p className="text-sm text-indigo-200">{scriptProgress || "AI is writing subtitles..."}</p> : null}
              {previewCues.map((line, index) => (
                <div key={`${line.startSec ?? index}-${index}`} className="grid gap-2 rounded-xl border border-white/10 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span>{formatClock(line.startSec ?? 0)} – {formatClock(line.endSec ?? 0)}</span>
                  </div>
                  {subtitleLanguage !== "none" ? (
                    <textarea
                      value={line.subtitleText || ""}
                      rows={2}
                      onChange={(event) => {
                        const start = line.startSec;
                        const end = line.endSec;
                        const next = event.target.value;
                        setLines((current) =>
                          mergeOverlappingCues(
                            current.map((item) =>
                              item.startSec === start && item.endSec === end ? { ...item, subtitleText: next } : item,
                            ),
                          ),
                        );
                      }}
                      className="resize-none bg-transparent text-xs leading-[1.4] text-zinc-300 outline-none"
                      style={{ fontFamily: "var(--font-subtitle), 'Noto Sans', 'Noto Sans Myanmar', system-ui, sans-serif" }}
                    />
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {mediaMode === "images" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <HostCard title="Host A" detail="Questioner · Left" gender={hostAGender} image={hostAImage} onGender={setHostAGender} onImage={setHostAImage} />
              <HostCard title="Host B" detail="Main Speaker · Right" gender={hostBGender} image={hostBImage} onGender={setHostBGender} onImage={setHostBImage} />
            </div>
          ) : null}

          {mediaMode === "images" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${glass} flex flex-col gap-2 px-4 py-3 text-sm`}>
              <span className="text-xs tracking-wide text-zinc-500 uppercase">Voice language</span>
              <select
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value as Language)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="english" className="bg-[#07090e]">English</option>
                <option value="burmese" className="bg-[#07090e]">Burmese</option>
              </select>
            </label>
            <label className={`${glass} flex flex-col gap-2 px-4 py-3 text-sm`}>
              <span className="text-xs tracking-wide text-zinc-500 uppercase">Subtitle language</span>
              <select
                value={subtitleLanguage}
                onChange={(event) => setSubtitleLanguage(event.target.value as SubtitleLanguage)}
                className="bg-transparent text-sm outline-none"
              >
                {SUBTITLE_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code} className="bg-[#07090e]">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {mediaMode === "images" ? (
            <label className={`${glass} flex flex-col gap-2 px-4 py-3 text-sm`}>
              <span className="text-xs tracking-wide text-zinc-500 uppercase">Character preset</span>
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as Preset)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="hosts" className="bg-[#07090e]">Male & Female Hosts</option>
                <option value="father-son" className="bg-[#07090e]">Father & Son</option>
              </select>
            </label>
            ) : null}
          </div>
          ) : null}

          <button
            type="button"
            disabled={running || scanningScript || (mediaMode === "video" ? !sourcePreview || lines.length === 0 : news.trim().length < 8)}
            onClick={() => void generateVideo()}
            className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-500 text-sm font-semibold text-white shadow-[0_0_32px_rgba(99,102,241,0.45)] transition hover:brightness-110 disabled:opacity-40"
          >
            {running ? videoStep : mediaMode === "video" ? "Generate Video Recap" : "Generate News Video"}
          </button>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>

        <aside className={`${glass} h-fit p-4 lg:sticky lg:top-6`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">Studio preview</h2>
            {videoStep ? <span className="text-xs text-indigo-200">{videoStep}</span> : null}
          </div>
          <div className={`mx-auto w-full ${mediaMode !== "video" ? "max-w-[320px]" : (aspectChoice === "auto" ? deviceAspect : aspectChoice) === "16:9" ? "max-w-none" : (aspectChoice === "auto" ? deviceAspect : aspectChoice) === "4:5" ? "max-w-[540px]" : "max-w-[320px]"}`}>
            <div className={`relative max-h-[700px] overflow-hidden rounded-[1.6rem] border border-white/[0.1] bg-black shadow-[0_16px_48px_rgba(0,0,0,0.55)] ${mediaMode !== "video" || (aspectChoice === "auto" ? deviceAspect : aspectChoice) === "9:16" ? "aspect-[9/16]" : (aspectChoice === "auto" ? deviceAspect : aspectChoice) === "4:5" ? "aspect-[4/5]" : "aspect-video"}`}>
              {videoUrl && showPlayer ? (
                // Final export already has burned-in ASS — never attach a second <track> layer.
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className={`absolute inset-0 h-full w-full rounded-xl bg-black ${mediaMode === "video" && (aspectChoice === "auto" ? deviceAspect : aspectChoice) === "16:9" ? "object-cover" : "object-contain"}`}
                />
              ) : mediaMode === "video" && sourcePreview ? (
                <>
                  <video
                    ref={previewVideoRef}
                    src={sourcePreview}
                    controls
                    playsInline
                    className="absolute inset-0 h-full w-full bg-black object-contain"
                  />
                  {subtitleLanguage !== "none" ? (
                    <SubtitleOverlay videoRef={previewVideoRef} cues={previewCues} anchor={subtitleAnchor} />
                  ) : null}
                </>
              ) : (
                <LiveStage
                  mode={mediaMode}
                  sourcePreview={sourcePreview}
                  newsImage={newsImages[lines[captionIndex]?.imageIndex ?? 0] || newsImages[0] || ""}
                  hostA={hostAImage}
                  hostB={hostBImage}
                  speaker={lines[captionIndex]?.speaker}
                  caption={
                    error ||
                    (subtitleLanguage === "none"
                      ? "Subtitles off"
                      : lines[captionIndex]?.subtitleText || lines[captionIndex]?.subtitle || lines[captionIndex]?.voiceText || lines[captionIndex]?.text || "")
                  }
                  running={running}
                  anchor={subtitleAnchor}
                />
              )}
            </div>
            {error && !(videoUrl && showPlayer) ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            <div className="mt-3 flex flex-col gap-2">
              {mediaMode !== "video" && clips.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void playVoices()}
                  className="h-11 rounded-2xl bg-white text-sm font-semibold text-black"
                >
                  Play voices
                </button>
              ) : null}
              {mediaMode === "video" && lines.length > 0 && !videoUrl ? (
                <button type="button" onClick={downloadSrt} className="h-11 rounded-2xl border border-white/15 text-sm font-semibold text-white">
                  Download .SRT
                </button>
              ) : null}
              {videoUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPlayer(true)}
                    className="h-11 rounded-2xl border border-white/15 text-sm font-semibold text-white"
                  >
                    Play video
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadMp4(videoUrl)}
                      className="flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-400 to-violet-400 text-sm font-semibold text-white"
                    >
                      Download MP4
                    </button>
                    <button
                      type="button"
                      disabled={lines.length === 0}
                      onClick={downloadSrt}
                      className="h-11 rounded-2xl border border-white/15 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Download .SRT
                    </button>
                  </div>
                  {mobileGallery ? (
                    <button
                      type="button"
                      onClick={() => void saveToGallery(videoUrl)}
                      className="h-11 rounded-2xl border border-white/15 text-sm font-semibold text-white"
                    >
                      Save to Gallery
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowPlayer(false)}
                    className="h-11 rounded-2xl border border-white/10 text-sm text-zinc-300"
                  >
                    Back to stage
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function HostCard({
  title,
  detail,
  gender,
  image,
  onGender,
  onImage,
}: {
  title: string;
  detail: string;
  gender: Gender;
  image: string;
  onGender: (gender: Gender) => void;
  onImage: (image: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <section className={`${glass} flex flex-col gap-4 p-4 transition hover:shadow-[0_0_28px_rgba(129,140,248,0.18)]`}>
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
      <div className="grid grid-cols-2 rounded-full border border-white/10 bg-black/40 p-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        {(["male", "female"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onGender(option)}
            className={`h-8 rounded-full capitalize transition ${gender === option ? "bg-gradient-to-r from-white to-indigo-100 text-black shadow-[0_0_16px_rgba(255,255,255,0.25)]" : "text-zinc-400 hover:text-white"}`}
          >
            {option}
          </button>
        ))}
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
          void compressImage(file).then(onImage).catch(() => undefined);
        }}
      />
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (!image) picker.current?.click();
          }}
          className="aspect-square w-full overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03] ring-1 ring-inset ring-white/10 transition hover:border-violet-300/60 hover:shadow-[0_0_28px_rgba(139,92,246,0.35)]"
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
              <UploadIcon />
              <span className="text-[11px]">Upload portrait</span>
            </span>
          )}
        </button>
        {image ? (
          <button
            type="button"
            aria-label={`Remove ${title} portrait`}
            onClick={() => onImage("")}
            className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-black/70 text-sm"
          >
            ×
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SubtitleOverlay({
  videoRef,
  cues,
  anchor,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cues: Line[];
  anchor: SubtitleAnchor;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      const cue = activeCueAt(cues, video.currentTime || 0);
      setText((cue?.subtitleText || "").trim());
    };
    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    video.addEventListener("play", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("play", sync);
    };
  }, [videoRef, cues]);
  if (!text) return null;
  const placement =
    anchor === "top" ? "top-[7%] bottom-auto" : anchor === "lower-mid" ? "bottom-[14%]" : "bottom-[7%]";
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3 ${placement}`}>
      <p
        className="max-w-[85%] rounded-lg px-[14px] py-[6px] text-center font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
        style={{
          fontFamily: "var(--font-subtitle), 'Noto Sans', 'Noto Sans Myanmar', system-ui, -apple-system, sans-serif",
          fontSize: "clamp(13px, 2.2vw, 20px)",
          lineHeight: 1.4,
          fontWeight: 600,
          background: "rgba(10, 12, 16, 0.78)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          textShadow: "0 1px 2px rgba(0,0,0,0.55)",
          textWrap: "balance",
          whiteSpace: "pre-line",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {text}
      </p>
    </div>
  );
}

function LiveStage({
  mode,
  sourcePreview,
  newsImage,
  hostA,
  hostB,
  speaker,
  caption,
  running,
  anchor = "bottom",
}: {
  mode: "images" | "video";
  sourcePreview: string;
  newsImage: string;
  hostA: string;
  hostB: string;
  speaker?: "A" | "B";
  caption: string;
  running: boolean;
  anchor?: SubtitleAnchor;
}) {
  if (mode === "video") {
    const placement =
      anchor === "top" ? "top-[7%] bottom-auto" : anchor === "lower-mid" ? "bottom-[14%]" : "bottom-[7%]";
    return (
      <div className="absolute inset-0 bg-black">
        {sourcePreview ? (
          <video src={sourcePreview} muted playsInline className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[11px] tracking-[0.16em] text-zinc-500 uppercase">Full-screen video recap</div>
        )}
        <div className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 ${placement}`}>
          <p
            className="max-w-[85%] rounded-lg px-[14px] py-[6px] text-center font-semibold text-white"
            style={{
              fontFamily: "var(--font-subtitle), 'Noto Sans', 'Noto Sans Myanmar', system-ui, -apple-system, sans-serif",
              fontSize: "clamp(13px, 2.2vw, 20px)",
              lineHeight: 1.4,
              background: "rgba(10, 12, 16, 0.78)",
              backdropFilter: "blur(6px)",
              textShadow: "0 1px 2px rgba(0,0,0,0.55)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              whiteSpace: "pre-line",
            }}
          >
            {caption || (running ? "Writing subtitles..." : "Subtitles appear here...")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col bg-[#0b0e16]">
      <div className="relative h-[35%] overflow-hidden border-b border-white/10">
        {newsImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={newsImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-[11px] tracking-[0.18em] text-zinc-500 uppercase">Top News Screen</div>
        )}
      </div>
      <div className="relative h-[45%] bg-gradient-to-b from-[#12161f] to-[#0a0c12]">
        <div className="absolute inset-x-3 top-3 bottom-8 grid grid-cols-2 gap-2">
          <HostStill image={hostA} label="Host A" active={speaker === "A"} />
          <HostStill image={hostB} label="Host B" active={speaker === "B"} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-7 border-t border-white/10 bg-[#16141c]/90" />
      </div>
      <div className="grid h-[20%] place-items-center px-3">
        <p
          className="max-w-[85%] rounded-lg px-[14px] py-[6px] text-center font-semibold text-zinc-100"
          style={{
            fontFamily: "var(--font-subtitle), 'Noto Sans', 'Noto Sans Myanmar', system-ui, sans-serif",
            fontSize: "clamp(13px, 2.2vw, 20px)",
            lineHeight: 1.4,
            background: "rgba(10, 12, 16, 0.78)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {caption || (running ? "Writing subtitles..." : "Subtitles appear here...")}
        </p>
      </div>
    </div>
  );
}

function HostStill({ image, label, active }: { image: string; label: string; active: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border ${active ? "border-indigo-300/70" : "border-white/10"} bg-white/[0.03]`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        <div className="grid h-full place-items-center text-[10px] text-zinc-600">{label}</div>
      )}
    </div>
  );
}

function compressImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1080 / Math.max(image.width, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not compress the image."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image."));
    };
    image.src = url;
  });
}

function NewsHeader() {
  const { account, ready, signOut } = useStudioAccount();
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/10 bg-[#07090e]/80 px-4 py-3 backdrop-blur-2xl">
      <span className="text-sm font-semibold tracking-wide text-white">CUT45</span>
      <div className="flex min-w-0 items-center gap-3 text-sm text-zinc-200">
        {ready && account?.name ? <span className="max-w-[8rem] truncate">{account.name}</span> : null}
        <CreditBar />
        {ready && account ? (
          <button type="button" onClick={() => void signOut()} className="rounded-full border border-white/15 px-3 py-1.5 text-xs">
            Logout
          </button>
        ) : (
          <Link href="/login" className="rounded-full border border-white/15 px-3 py-1.5 text-xs">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V5M12 5l-4 4M12 5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

