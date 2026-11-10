"use client";

import { useRef, useState } from "react";
import type { AgentStep } from "@/lib/agent-sessions";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Icon({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function GenerationTimeline({ steps }: { steps: AgentStep[] }) {
  return (
    <ol className="flex flex-col" aria-label="Generation progress">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {last ? null : (
              <span
                aria-hidden
                className={cn(
                  "absolute top-7 bottom-0 left-[13px] w-px",
                  step.status === "completed" ? "bg-emerald-400/40" : "bg-white/10",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border",
                step.status === "completed" && "border-emerald-400/50 bg-emerald-400/15 text-emerald-300",
                step.status === "started" && "border-violet-400/50 bg-violet-400/10 text-violet-200",
                step.status === "failed" && "border-red-400/50 bg-red-400/10 text-red-300",
                step.status === "pending" && "border-white/10 bg-white/[0.03] text-zinc-500",
              )}
            >
              {step.status === "completed" ? (
                <Icon className="h-3.5 w-3.5">
                  <path d="m5 10.5 3.2 3.2L15 7" />
                </Icon>
              ) : step.status === "failed" ? (
                <Icon className="h-3.5 w-3.5">
                  <path d="m6 6 8 8M14 6l-8 8" />
                </Icon>
              ) : step.status === "started" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-200/30 border-t-violet-200" />
              ) : (
                <span className="text-[11px] font-semibold tabular-nums">{index + 1}</span>
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-medium", step.status === "pending" ? "text-zinc-500" : "text-zinc-100")}>
                {step.label}
              </p>
              {step.detail ? <p className="mt-0.5 text-xs leading-5 text-zinc-400">{step.detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function clock(seconds: number) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const whole = Math.floor(safe);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function aspectRatio(aspect: string) {
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? `${w} / ${h}` : "9 / 16";
}

export function AgentPlayer({
  src,
  aspect,
  script,
  audioSrc,
  voiceEmbedded,
  voiceLabel,
  captions = true,
}: {
  src: string;
  aspect: string;
  script?: string;
  audioSrc?: string;
  voiceEmbedded?: boolean;
  voiceLabel?: string;
  captions?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const hasVoice = Boolean(voiceEmbedded || audioSrc);
  const fill = duration > 0 ? `${(current / duration) * 100}%` : "0%";

  function syncAudio(play: boolean) {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video || voiceEmbedded) return;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.3) {
      audio.currentTime = Math.min(video.currentTime, Number.isFinite(audio.duration) ? audio.duration : video.currentTime);
    }
    if (play && voiceOn) void audio.play().catch(() => undefined);
    else audio.pause();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function stop() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setCurrent(0);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  function seek(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrent(value);
    syncAudio(!video.paused);
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    const audio = audioRef.current;
    if (audio && !voiceEmbedded) {
      if (next && videoRef.current && !videoRef.current.paused) void audio.play().catch(() => undefined);
      else audio.pause();
    }
  }

  return (
    <div className="flex w-full flex-col">
      <div
        className="relative mx-auto w-full max-h-[64dvh] overflow-hidden rounded-2xl border border-white/[0.08] bg-black"
        style={{ aspectRatio: aspectRatio(aspect), maxWidth: `calc(64dvh * ${aspectRatio(aspect)})` }}
      >
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
          preload="metadata"
          muted={!(voiceEmbedded && voiceOn)}
          onClick={togglePlay}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onPlay={() => {
            setPlaying(true);
            syncAudio(true);
          }}
          onPause={() => {
            setPlaying(false);
            syncAudio(false);
          }}
          onEnded={() => {
            setPlaying(false);
            audioRef.current?.pause();
          }}
        />
        {playing ? null : (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play preview"
            className="absolute inset-0 m-auto grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25"
          >
            <svg viewBox="0 0 20 20" className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M6 4.5v11l9-5.5Z" />
            </svg>
          </button>
        )}
      </div>

      <div className="agent-glass mx-auto mt-3 flex w-full max-w-xl flex-col gap-2.5 rounded-2xl px-3.5 py-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(current, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Playback position"
          className="agent-scrub"
          style={{ "--fill": fill } as React.CSSProperties}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-8 w-8 place-items-center rounded-full bg-white text-black transition hover:bg-white/90"
          >
            {playing ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <rect x="5.5" y="4.5" width="3" height="11" rx="1" />
                <rect x="11.5" y="4.5" width="3" height="11" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M6 4.5v11l9-5.5Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop"
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <rect x="5" y="5" width="10" height="10" rx="1.5" />
            </svg>
          </button>
          <span className="ml-1 text-xs text-zinc-300 tabular-nums">
            {clock(current)} / {clock(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
