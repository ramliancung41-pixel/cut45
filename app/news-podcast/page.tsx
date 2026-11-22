"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreditBar } from "@/components/credit-provider";
import { useStudioAccount } from "@/components/profile-credit-bar";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const STEPS = ["Writing script", "Recording voices", "3D lip-sync", "Rendering"] as const;

type Line = {
  speaker?: "A" | "B";
  voiceText?: string;
  text?: string;
  subtitleText?: string;
  subtitle?: string;
  imageIndex?: number;
  startSec?: number;
  endSec?: number;
  speakerType?: "male" | "female" | "child";
};
type Clip = Line & { path: string; audioDataUrl?: string; durationSec: number; actualDurationSec?: number };
type Language = "burmese" | "english";
type SubtitleLanguage = Language | "dual" | "none";
type Gender = "male" | "female";
type Preset = "father-son" | "hosts";

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
  const [videoStep, setVideoStep] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showPlayer, setShowPlayer] = useState(true);
  const newsPicker = useRef<HTMLInputElement>(null);
  const slotRef = useRef(0);

  const newsImages = images.filter((item) => item.startsWith("data:image/"));
  const hosts = { hostAGender, hostBGender, hostAImage, hostBImage };

  async function generateVideo() {
    setRunning(true);
    setError("");
    setVideoUrl("");
    setShowPlayer(true);
    setLines([]);
    setClips([]);
    setCaptionIndex(0);
    try {
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
          videoUrl: mediaMode === "video" ? sourceVideoUrl : "",
        }),
      });
      const script = (await scriptResponse.json().catch(() => null)) as { lines?: Line[]; error?: string } | null;
      if (!scriptResponse.ok || !script?.lines) throw new Error(script?.error ?? "The script could not be written.");
      setLines(script.lines);

      setVideoStep(STEPS[1]);
      const audioResponse = await fetch("/api/news-podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: voiceLanguage, lines: script.lines, mediaMode, ...hosts }),
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

      setVideoStep("Rendering");
      const renderResponse = await fetch("/api/news-podcast/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: audio.jobId,
          title: news.trim().slice(0, 120),
          lines: script.lines,
          imageUrls: mediaMode === "images" ? newsImages : [],
          sourceVideoUrl: mediaMode === "video" ? sourceVideoUrl : "",
          hostAGender,
          hostBGender,
          hostAImage,
          hostBImage,
          videos: audio.clips.map((clip) => ({
            speaker: clip.speaker,
            speakerType: clip.speakerType,
            audioDataUrl: clip.audioDataUrl,
            durationSec: clip.actualDurationSec || clip.durationSec,
            imageIndex: clip.imageIndex ?? 0,
            startSec: clip.startSec,
            endSec: clip.endSec,
            subtitleText: clip.subtitleText ?? "",
          })),
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
    if (!running || lines.length < 2) return;
    const timer = window.setInterval(() => {
      setCaptionIndex((current) => (current + 1) % lines.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [running, lines]);

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
    if (duration <= 0 || duration > 300) {
      URL.revokeObjectURL(localUrl);
      setError(duration > 300 ? "Keep the source video under 5 minutes." : "That video could not be read.");
      return;
    }
    setSourceMeta(`${formatSize(file.size)} · ${formatClock(duration)}`);
    setSourceDuration(duration);
    setUploadingVideo(true);
    setOptimizeProgress(0);
    setError("");
    let uploadFile = file;
    let previewUrl = localUrl;
    try {
      if (file.size > 42 * 1024 * 1024) {
        uploadFile = await compressStudioVideo(file, duration, setOptimizeProgress);
        if (uploadFile.size > 48 * 1024 * 1024) {
          throw new Error("This clip is still over 48 MB after optimizing. Use a shorter clip or a lower-resolution file.");
        }
        previewUrl = URL.createObjectURL(uploadFile);
        URL.revokeObjectURL(localUrl);
        setSourceMeta(`${formatSize(uploadFile.size)} · ${formatClock(duration)}`);
      }
      const ticketResponse = await fetch("/api/news-podcast/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: uploadFile.type || "video/webm" }),
      });
      const ticket = (await ticketResponse.json().catch(() => null)) as { path?: string; token?: string; publicUrl?: string; error?: string } | null;
      if (!ticketResponse.ok || !ticket?.path || !ticket.token || !ticket.publicUrl) {
        throw new Error(ticket?.error ?? "The video upload could not be started.");
      }
      const uploaded = await createSupabaseBrowserClient().storage.from("user_assets").uploadToSignedUrl(ticket.path, ticket.token, uploadFile);
      if (uploaded.error) throw new Error(uploaded.error.message);
      setSourcePreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return previewUrl;
      });
      setSourceVideoUrl(ticket.publicUrl);
      setSourceDuration(duration);
    } catch (caught) {
      if (previewUrl !== localUrl) URL.revokeObjectURL(previewUrl);
      URL.revokeObjectURL(localUrl);
      setError(caught instanceof Error ? caught.message : "The video could not be uploaded.");
    } finally {
      setUploadingVideo(false);
      setOptimizeProgress(0);
    }
  }

  function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function compressStudioVideo(file: File, duration: number, onProgress: (percent: number) => void) {
  return new Promise<File>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
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
      const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((item) => MediaRecorder.isTypeSupported(item)) ?? "";
      if (!mime) {
        URL.revokeObjectURL(url);
        reject(new Error("This browser cannot optimize the video."));
        return;
      }
      const recorder = new MediaRecorder(canvas.captureStream(24), { mimeType: mime, videoBitsPerSecond: 1_200_000 });
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
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#070914] text-zinc-100">
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
                  <video src={sourcePreview} controls className="max-h-64 w-full rounded-xl bg-black" />
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
                    <span className="text-xs text-zinc-500">MP4, WebM, or MOV · 5 minutes maximum</span>
                  </>
                )}
                {sourceMeta ? <span className="text-xs text-zinc-300">{sourceMeta}</span> : null}
                {optimizeProgress > 0 ? <span className="text-xs text-indigo-200">Optimizing video for studio upload... {optimizeProgress}%</span> : null}
                {sourceVideoUrl ? <span className="text-xs text-emerald-300">Uploaded · {formatClock(sourceDuration)}</span> : null}
              </label>
            )}
          </section>

          {mediaMode === "images" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <HostCard title="Host A" detail="Questioner · Left" gender={hostAGender} image={hostAImage} onGender={setHostAGender} onImage={setHostAImage} />
              <HostCard title="Host B" detail="Main Speaker · Right" gender={hostBGender} image={hostBImage} onGender={setHostBGender} onImage={setHostBImage} />
            </div>
          ) : null}

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
                <option value="english" className="bg-[#07090e]">English</option>
                <option value="burmese" className="bg-[#07090e]">Burmese</option>
                <option value="dual" className="bg-[#07090e]">Dual (Burmese + English)</option>
                <option value="none" className="bg-[#07090e]">None (Off)</option>
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

          <button
            type="button"
            disabled={running || (mediaMode === "video" ? !sourceVideoUrl : news.trim().length < 8)}
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
          <div className="mx-auto w-full max-w-[320px]">
            <div className="relative aspect-[9/16] max-h-[700px] overflow-hidden rounded-[1.6rem] border border-white/[0.1] bg-black shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
              {videoUrl && showPlayer ? (
                <video src={videoUrl} controls autoPlay playsInline className="absolute inset-0 h-full w-full rounded-xl bg-black object-contain" />
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
                />
              )}
            </div>
            {error && !(videoUrl && showPlayer) ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            <div className="mt-3 flex flex-col gap-2">
              {clips.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void playVoices()}
                  className="h-11 rounded-2xl bg-white text-sm font-semibold text-black"
                >
                  Play voices
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
                  <a
                    href={videoUrl}
                    download="cut45-news.mp4"
                    className="flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-400 to-violet-400 text-sm font-semibold text-white"
                  >
                    Download MP4
                  </a>
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

function LiveStage({
  mode,
  sourcePreview,
  newsImage,
  hostA,
  hostB,
  speaker,
  caption,
  running,
}: {
  mode: "images" | "video";
  sourcePreview: string;
  newsImage: string;
  hostA: string;
  hostB: string;
  speaker?: "A" | "B";
  caption: string;
  running: boolean;
}) {
  if (mode === "video") {
    return (
      <div className="absolute inset-0 bg-black">
        {sourcePreview ? (
          <>
            <video src={sourcePreview} muted className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl" />
            <video src={sourcePreview} muted playsInline className="absolute inset-0 h-full w-full object-contain" />
          </>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[11px] tracking-[0.16em] text-zinc-500 uppercase">Full-screen video recap</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-6">
          <p className="line-clamp-4 text-center text-[11px] leading-4 text-zinc-100">{caption || (running ? "Writing subtitles..." : "Subtitles appear here...")}</p>
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
        <p className="line-clamp-3 text-center text-[11px] leading-4 text-zinc-200">
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

