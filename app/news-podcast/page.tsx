"use client";

import { useEffect, useRef, useState } from "react";
import { StudioModeBar } from "@/components/studio-mode-bar";

const STEPS = ["Writing script", "Recording voices", "3D lip-sync", "Rendering"] as const;

type Line = { speaker: "A" | "B"; text: string; imageIndex: number };
type Clip = Line & { path: string; audioDataUrl?: string; durationSec: number };
type Language = "burmese" | "english";
type Gender = "male" | "female";
type Preset = "father-son" | "hosts";

const glass = "bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45)] rounded-2xl";

export default function NewsPodcastPage() {
  const [news, setNews] = useState("");
  const [images, setImages] = useState<string[]>(["", "", ""]);
  const [language, setLanguage] = useState<Language>("english");
  const [preset, setPreset] = useState<Preset>("hosts");
  const [hostAGender, setHostAGender] = useState<Gender>("male");
  const [hostBGender, setHostBGender] = useState<Gender>("female");
  const [hostAImage, setHostAImage] = useState("");
  const [hostBImage, setHostBImage] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
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
    setCaptionIndex(0);
    try {
      setVideoStep(STEPS[0]);
      const scriptResponse = await fetch("/api/news-podcast/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ news, language, preset, imageCount: newsImages.length }),
      });
      const script = (await scriptResponse.json().catch(() => null)) as { lines?: Line[]; error?: string } | null;
      if (!scriptResponse.ok || !script?.lines) throw new Error(script?.error ?? "The script could not be written.");
      setLines(script.lines);

      setVideoStep(STEPS[1]);
      const audioResponse = await fetch("/api/news-podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, lines: script.lines, ...hosts }),
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

      setVideoStep(STEPS[2]);
      const lipsyncResponse = await fetch("/api/news-podcast/lipsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: audio.jobId,
          preset,
          ...hosts,
          clips: audio.clips.map((clip) => ({
            speaker: clip.speaker,
            audioDataUrl: clip.audioDataUrl,
            durationSec: clip.durationSec,
            imageIndex: clip.imageIndex,
          })),
        }),
      });
      const lipsync = (await lipsyncResponse.json().catch(() => null)) as {
        videos?: Array<{ speaker: "A" | "B"; audioDataUrl: string; durationSec: number; imageIndex: number }>;
        error?: string;
      } | null;
      if (!lipsyncResponse.ok || !lipsync?.videos?.length) throw new Error(lipsync?.error ?? "The hosts could not be lip-synced.");

      setVideoStep("Rendering");
      const renderResponse = await fetch("/api/news-podcast/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: audio.jobId,
          title: news.trim().slice(0, 120),
          lines: script.lines,
          imageUrls: newsImages,
          hostAGender,
          hostBGender,
          hostAImage,
          hostBImage,
          videos: lipsync.videos.map((clip) => ({
            speaker: clip.speaker,
            audioDataUrl: clip.audioDataUrl,
            durationSec: clip.durationSec,
            imageIndex: clip.imageIndex,
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

  function readImage(file: File | undefined, onReady: (value: string) => void) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    void compressImage(file).then(onReady).catch(() => undefined);
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#07090e] text-zinc-100">
      <StudioModeBar />
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-0 h-[24rem] w-[24rem] rounded-full bg-blue-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[22rem] w-[22rem] rounded-full bg-violet-600/15 blur-[120px]" />

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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">News Media</h2>
              <span className="text-xs text-zinc-500">Up to 3 images</span>
            </div>
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
                    className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:border-indigo-300/40 hover:shadow-[0_0_24px_rgba(99,102,241,0.25)]"
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
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <HostCard title="Host A" detail="Questioner · Left" gender={hostAGender} image={hostAImage} onGender={setHostAGender} onImage={setHostAImage} />
            <HostCard title="Host B" detail="Main Speaker · Right" gender={hostBGender} image={hostBImage} onGender={setHostBGender} onImage={setHostBImage} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${glass} flex flex-col gap-2 px-4 py-3 text-sm`}>
              <span className="text-xs tracking-wide text-zinc-500 uppercase">Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="english" className="bg-[#07090e]">English</option>
                <option value="burmese" className="bg-[#07090e]">Burmese</option>
              </select>
            </label>
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
          </div>

          <button
            type="button"
            disabled={running || news.trim().length < 8}
            onClick={() => void generateVideo()}
            className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-500 text-sm font-semibold text-white shadow-[0_0_32px_rgba(99,102,241,0.45)] transition hover:brightness-110 disabled:opacity-40"
          >
            {running ? videoStep : "Generate News Video"}
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
                <video src={videoUrl} controls autoPlay playsInline className="absolute inset-0 h-full w-full rounded-xl object-contain" />
              ) : (
                <LiveStage
                  newsImage={newsImages[lines[captionIndex]?.imageIndex] || newsImages[0] || ""}
                  hostA={hostAImage}
                  hostB={hostBImage}
                  speaker={lines[captionIndex]?.speaker}
                  caption={error || lines[captionIndex]?.text || ""}
                  running={running}
                />
              )}
            </div>
            {error && !(videoUrl && showPlayer) ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            {videoUrl ? (
              <div className="mt-3 flex flex-col gap-2">
                <a
                  href={videoUrl}
                  download="cut45-news.mp4"
                  className="flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-white to-indigo-100 text-sm font-semibold text-black"
                >
                  Download MP4
                </a>
                <button
                  type="button"
                  onClick={() => setShowPlayer((current) => !current)}
                  className="h-11 rounded-2xl border border-white/15 text-sm text-zinc-200"
                >
                  {showPlayer ? "Back to Stage Preview" : "Play video"}
                </button>
              </div>
            ) : null}
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
    <section className={`${glass} flex flex-col gap-4 p-4`}>
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
      <div className="grid grid-cols-2 rounded-full border border-white/[0.08] bg-black/30 p-1 text-xs">
        {(["male", "female"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onGender(option)}
            className={`h-8 rounded-full capitalize ${gender === option ? "bg-white text-black" : "text-zinc-400"}`}
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
          className="aspect-square w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:border-violet-300/40 hover:shadow-[0_0_24px_rgba(139,92,246,0.25)]"
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
  newsImage,
  hostA,
  hostB,
  speaker,
  caption,
  running,
}: {
  newsImage: string;
  hostA: string;
  hostB: string;
  speaker?: "A" | "B";
  caption: string;
  running: boolean;
}) {
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

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V5M12 5l-4 4M12 5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

