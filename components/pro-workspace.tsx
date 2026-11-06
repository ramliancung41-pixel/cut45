"use client";

import { useState } from "react";
import { FRAME_ASPECTS, type AspectRatio } from "@/lib/frame";
import type { ImageStyleId } from "@/lib/image-styles";
import { MOTION_STYLES, PROMPT_MAX, type MotionStyleId } from "@/lib/motion-styles";
import { VIDEO_DURATIONS, type VideoDurationSec } from "@/lib/scenes";
import type { MovieScene } from "@/lib/scenes";
import { pluginStore } from "@/lib/studio-prefs";
import { VIDEO_MODELS, type VideoModelId } from "@/lib/video-models";
import { VOICES, getVoice, type VoiceId } from "@/lib/voices";

const STYLES: Array<{ id: ImageStyleId; label: string; image: string }> = [
  { id: "portrait", label: "Cinematic", image: "/landing/cut45-cyber-city.jpg" },
  { id: "photoreal", label: "Realistic", image: "/home/model-3.jpg" },
  { id: "anime", label: "Anime", image: "/landing/cut45-anime-magic.jpg" },
  { id: "cyberpunk", label: "Cyberpunk", image: "/home/model-4.jpg" },
  { id: "pixar", label: "Fantasy", image: "/home/model-2.jpg" },
  { id: "3d", label: "Minimal", image: "/home/model-5.jpg" },
];

const MOODS = ["Epic", "Calm", "Mysterious", "Happy", "Dark", "Inspirational"] as const;

const CAMERAS = ["Smooth Push In", "Static", "Tracking", "Slow Drift"] as const;

const STORY_FALLBACK = [
  { title: "1. Establishing Shot", time: "4s", image: "/landing/cut45-cyber-city.jpg" },
  { title: "2. Fly Through", time: "3s", image: "/home/model-4.jpg" },
  { title: "3. City Overview", time: "4s", image: "/home/model-1.jpg" },
];

export function ProWorkspace({
  topic,
  setTopic,
  running,
  enhancing,
  onEnhance,
  onSubmit,
  videoModel,
  onVideoModel,
  aspect,
  onAspect,
  durationSec,
  onDuration,
  motionStyle,
  onMotion,
  imageStyle,
  onImageStyle,
  voice,
  onVoice,
  creditsLabel,
  disabled,
  error,
  videoUrl,
  poster,
  scenes,
  onAddScene,
  onDownload,
  onExtend,
}: {
  topic: string;
  setTopic: (value: string) => void;
  running: boolean;
  enhancing: boolean;
  onEnhance: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  videoModel: VideoModelId;
  onVideoModel: (id: VideoModelId) => void;
  aspect: AspectRatio;
  onAspect: (id: AspectRatio) => void;
  durationSec: VideoDurationSec;
  onDuration: (id: VideoDurationSec) => void;
  motionStyle: MotionStyleId | "";
  onMotion: (id: MotionStyleId) => void;
  imageStyle: ImageStyleId | "";
  onImageStyle: (id: ImageStyleId) => void;
  voice: VoiceId;
  onVoice: (id: VoiceId) => void;
  creditsLabel: string;
  disabled: boolean;
  error: string | null;
  videoUrl: string | null;
  poster: string | null;
  scenes: MovieScene[];
  onAddScene: () => void;
  onDownload: () => void;
  onExtend: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [camera, setCamera] = useState<(typeof CAMERAS)[number]>("Smooth Push In");
  const [mood, setMood] = useState<(typeof MOODS)[number]>("Epic");
  const plugins = pluginStore.useValue();
  const selectedVoice = getVoice(voice);
  const modelName = VIDEO_MODELS.find((model) => model.id === videoModel)?.name ?? "CineMaster Pro";
  const aspectLabel = aspect === "16:9" ? "16:9 (Widescreen)" : aspect === "1:1" ? "1:1 (Square)" : "9:16 (Vertical)";
  const motionName = MOTION_STYLES.find((style) => style.id === motionStyle)?.name ?? "Cinematic";
  const cards = scenes.length
    ? scenes.slice(0, 3).map((scene, index) => ({
        title: `${index + 1}. ${scene.title}`,
        time: "4s",
        image: STORY_FALLBACK[index]?.image ?? "/landing/cut45-cyber-city.jpg",
      }))
    : STORY_FALLBACK;

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
      <div className="space-y-3">
        <Panel>
          <Step n={1} title="Describe Your Video" />
          <label className="mt-3 block text-xs text-white/55" htmlFor="studio-prompt">
            Prompt
          </label>
          <textarea
            id="studio-prompt"
            value={topic}
            maxLength={PROMPT_MAX}
            disabled={running}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="A futuristic city at sunset, flying cars moving through the neon lights, cinematic, ultra realistic, 4k"
            className="mt-1.5 h-28 w-full resize-none rounded-xl border border-white/10 bg-[#12141f] px-3 py-2 text-sm leading-6 outline-none placeholder:text-white/35"
          />
          <div className="mt-1 text-right text-[11px] text-white/35">
            {topic.trim().length}/{PROMPT_MAX}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={running || enhancing || topic.trim().length < 3}
              onClick={onEnhance}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#12141f] py-2 text-sm text-white/80 disabled:opacity-50"
            >
              <SparkIcon />
              {enhancing ? "Enhancing…" : "Enhance Prompt"}
            </button>
            <button type="button" aria-label="Prompt settings" onClick={() => setAdvanced(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#12141f]">
              <GearIcon />
            </button>
          </div>
        </Panel>

        <Panel>
          <Step n={2} title="Choose Settings" />
          <Field label="Model">
            <select
              value={videoModel}
              disabled={running}
              onChange={(event) => onVideoModel(event.target.value as VideoModelId)}
              className="w-full rounded-xl border border-white/10 bg-[#12141f] px-2.5 py-2 text-[13px] text-white outline-none"
            >
              {VIDEO_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aspect Ratio">
            <select value={aspect} disabled={running} onChange={(event) => onAspect(event.target.value as AspectRatio)} className="w-full rounded-xl border border-white/10 bg-[#12141f] px-2.5 py-2 text-[13px] text-white outline-none">
              {FRAME_ASPECTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === aspect ? aspectLabel : item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duration">
            <select
              value={durationSec}
              disabled={running}
              onChange={(event) => onDuration(Number(event.target.value) as VideoDurationSec)}
              className="w-full rounded-xl border border-white/10 bg-[#12141f] px-2.5 py-2 text-[13px] text-white outline-none"
            >
              {VIDEO_DURATIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} Seconds
                </option>
              ))}
            </select>
          </Field>
          <Field label="Motion">
            <select
              value={motionStyle || MOTION_STYLES[2].id}
              disabled={running}
              onChange={(event) => onMotion(event.target.value as MotionStyleId)}
              className="w-full rounded-xl border border-white/10 bg-[#12141f] px-2.5 py-2 text-[13px] text-white outline-none"
            >
              {MOTION_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.id === (motionStyle || MOTION_STYLES[2].id) ? motionName : style.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Camera Movement">
            <select value={camera} disabled={running} onChange={(event) => setCamera(event.target.value as (typeof CAMERAS)[number])} className="w-full rounded-xl border border-white/10 bg-[#12141f] px-2.5 py-2 text-[13px] text-white outline-none">
              {CAMERAS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </Panel>

        <Panel>
          <button type="button" onClick={() => setAdvanced((open) => !open)} className="flex w-full items-center gap-2 text-left">
            <Step n={3} title="Advanced Options" />
            <span className="ml-auto text-white/40">{advanced ? "▴" : "▾"}</span>
          </button>
          {advanced ? (
            <Field label="Voice">
              <select value={voice} disabled={running} onChange={(event) => onVoice(event.target.value as VoiceId)} className="w-full rounded-xl border border-white/10 bg-[#12141f] px-2.5 py-2 text-[13px] text-white outline-none">
                {VOICES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </Panel>

        <button
          type="submit"
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#b14bff] py-3 text-sm font-semibold shadow-[0_10px_30px_rgba(124,92,255,0.35)] disabled:opacity-50"
        >
          <SparkIcon />
          {running ? "Generating…" : "Generate Video"}
        </button>
        <p className="flex items-center justify-center gap-1 text-xs text-amber-200/90">
          <Bolt />
          {creditsLabel}
        </p>
        {error ? <p className="text-center text-xs text-red-300">{error}</p> : null}
      </div>

      <div className="space-y-3">
        <Panel>
          <p className="text-sm font-semibold">AI Preview</p>
          <div className="relative mt-3 overflow-hidden rounded-2xl bg-black">
            <video
              key={videoUrl || "sample"}
              src={videoUrl || "/landing/cut45-cyber-city.mp4"}
              poster={poster || "/landing/cut45-cyber-city.jpg"}
              autoPlay
              muted
              loop
              playsInline
              controls
              className="aspect-video w-full bg-black object-cover"
            />
            <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium">Preview</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <MiniButton label="Download" onClick={onDownload} disabled={!videoUrl || running} />
            <MiniButton label="Edit" onClick={() => document.getElementById("studio-prompt")?.focus()} />
            <MiniButton label="Extend" onClick={onExtend} disabled={!videoUrl || running} />
            <MiniButton label="More" onClick={() => setAdvanced(true)} />
          </div>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold">
            Storyboard <span className="font-normal text-white/40">(Optional)</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cards.map((card) => (
              <figure key={card.title} className="overflow-hidden rounded-xl border border-white/10 bg-[#12141f]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.image} alt="" className="aspect-video w-full object-cover" />
                <figcaption className="px-2 py-1.5 text-[10px] text-white/70">
                  {card.title}
                  <span className="float-right text-white/35">{card.time}</span>
                </figcaption>
              </figure>
            ))}
            <button type="button" onClick={onAddScene} disabled={running} className="grid aspect-video place-items-center rounded-xl border border-dashed border-white/15 text-xs text-white/60">
              + Add Scene
            </button>
          </div>
        </Panel>
        <p className="text-center text-[11px] text-amber-100/70">✦ Pro Tip: Be more descriptive with your prompts for better results!</p>
      </div>

      <div className="space-y-3">
        <Panel>
          <p className="text-sm font-semibold">Choose Style</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {STYLES.map((style) => {
              const selected = imageStyle === style.id || (!imageStyle && style.id === "portrait");
              return (
                <button
                  key={style.id}
                  type="button"
                  disabled={running}
                  onClick={() => onImageStyle(style.id)}
                  className={selected ? "overflow-hidden rounded-xl ring-2 ring-[#7c5cff]" : "overflow-hidden rounded-xl ring-1 ring-white/10"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={style.image} alt="" className="aspect-square w-full object-cover" />
                  <span className="block bg-[#12141f] px-1 py-1 text-[10px]">{style.label}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold">Select Mood</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MOODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMood(item)}
                className={
                  mood === item
                    ? "rounded-full bg-[#6d4aff] px-3 py-1 text-xs font-medium"
                    : "rounded-full border border-white/10 px-3 py-1 text-xs text-white/70"
                }
              >
                {item}
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold">Add Audio</p>
          <button
            type="button"
            onClick={() => pluginStore.set((current) => ({ ...current, music: !current.music }))}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#12141f] p-2 text-left"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#2a2148] text-[#c4b5fd]">♪</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Future World</span>
              <span className="block text-[11px] text-white/40">{plugins.music ? "On" : "AI Generated"}</span>
            </span>
            <span className="text-lg text-white/50">≡</span>
          </button>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold">
            Voiceover <span className="font-normal text-white/40">(Optional)</span>
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#12141f] p-2">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#243044] text-xs">{(selectedVoice?.name ?? "A").slice(0, 1)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {selectedVoice?.name ?? "Alex"} ({selectedVoice?.gender === "female" ? "Female" : "Male"})
              </span>
              <span className="block text-[11px] text-white/40">English (US)</span>
            </span>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Auto Subtitle</p>
            <button
              type="button"
              role="switch"
              aria-checked={plugins.subtitles}
              onClick={() => pluginStore.set((current) => ({ ...current, subtitles: !current.subtitles }))}
              className={plugins.subtitles ? "h-6 w-11 rounded-full bg-[#7c5cff] p-0.5" : "h-6 w-11 rounded-full bg-white/15 p-0.5"}
            >
              <span className={plugins.subtitles ? "block h-5 w-5 translate-x-5 rounded-full bg-white" : "block h-5 w-5 rounded-full bg-white"} />
            </button>
          </div>
        </Panel>
      </div>
    </form>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-[#141722] p-3.5">{children}</section>;
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#6d4aff] text-[11px]">{n}</span>
      {title}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-[11px] text-white/45">{label}</span>
      {children}
    </label>
  );
}

function MiniButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl border border-white/10 bg-[#12141f] py-2 text-xs text-white/80 disabled:opacity-40">
      {label}
    </button>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <path d="M10 1.5 11.6 7 17 8.4 11.6 10 10 15.5 8.4 10 3 8.4 8.4 7 10 1.5z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="2.2" />
      <path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M14.8 5.2l-1.4 1.4M6.6 13.4 5.2 14.8" />
    </svg>
  );
}

function Bolt() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M11 2 4 11h5l-1 7 7-10h-5l1-6z" />
    </svg>
  );
}
