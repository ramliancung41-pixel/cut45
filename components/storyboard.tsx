"use client";

import { useEffect, useRef, useState } from "react";
import { ViralSubtitles } from "@/components/viral-subtitles";
import { primeSpeechVoices, speakNarration, stopNarration } from "@/lib/browser-speech";
import { FRAME_LENGTH_SEC, VIDEO_DURATION_SEC, type StoryFrame } from "@/lib/generate";
import { isVoiceId } from "@/lib/voices";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function activeFrameIndex(playhead: number, count: number) {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.floor(Math.min(playhead, 0.999) * count));
}

function narrationDurationMs(script: string) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(12_000, Math.round((words / 155) * 60_000));
}

export function Storyboard({
  frames,
  script,
  voiceId,
  audioSrc,
  audioLabel,
}: {
  frames: StoryFrame[];
  script: string;
  voiceId: string;
  audioSrc?: string;
  audioLabel?: string;
}) {
  const [playhead, setPlayhead] = useState(0);
  const [narrating, setNarrating] = useState(false);
  const activeIndex = activeFrameIndex(playhead, frames.length);
  const active = frames[activeIndex];
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const playerRef = useRef<HTMLVideoElement>(null);
  const thumbRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef(0);
  const startedAtRef = useRef(0);
  const playingRef = useRef(false);
  const durationRef = useRef(narrationDurationMs(script));
  const lastUiRef = useRef(0);

  useEffect(() => {
    primeSpeechVoices();
    return () => {
      playingRef.current = false;
      window.cancelAnimationFrame(rafRef.current);
      stopNarration();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    cardRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  useEffect(() => {
    if (!narrating) return;
    const player = playerRef.current;
    const thumb = thumbRef.current;
    if (player) void player.play().catch(() => undefined);
    if (thumb) void thumb.play().catch(() => undefined);
  }, [narrating, activeIndex, active?.src]);

  function stopPlayback(atEnd = false) {
    playingRef.current = false;
    window.cancelAnimationFrame(rafRef.current);
    stopNarration();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (!atEnd) audio.currentTime = 0;
    }
    playerRef.current?.pause();
    thumbRef.current?.pause();
    setNarrating(false);
    if (atEnd) setPlayhead(1);
  }

  function tick(now: number) {
    if (!playingRef.current) return;
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      durationRef.current = audio.duration * 1000;
    }
    const elapsed = now - startedAtRef.current;
    const spoken =
      audio && !audio.paused && Number.isFinite(audio.currentTime)
        ? audio.currentTime * 1000
        : elapsed;
    const progress = Math.min(1, spoken / durationRef.current);
    if (now - lastUiRef.current > 80 || progress >= 1) {
      lastUiRef.current = now;
      setPlayhead(progress);
    }
    if (progress >= 1) {
      stopPlayback(true);
      return;
    }
    rafRef.current = window.requestAnimationFrame(tick);
  }

  function playNarration() {
    playingRef.current = false;
    window.cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    playerRef.current?.pause();
    thumbRef.current?.pause();

    durationRef.current = narrationDurationMs(script);
    startedAtRef.current = performance.now();
    lastUiRef.current = 0;
    playingRef.current = true;
    setPlayhead(0);
    setNarrating(true);

    const player = playerRef.current;
    if (player) {
      try {
        player.currentTime = 0;
      } catch {
        // The clip may not be seekable until metadata loads.
      }
      void player.play().catch(() => undefined);
    }

    if (audioSrc && audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        if (!playingRef.current || !isVoiceId(voiceId)) return;
        speakNarration(script, voiceId);
      });
    } else if (isVoiceId(voiceId)) {
      speakNarration(script, voiceId);
    }

    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(tick);
  }

  return (
    <div className="mt-5">
      {audioSrc ? <audio ref={audioRef} src={audioSrc} preload="auto" /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={playNarration} className="gen-cta">
          Play narration
        </button>
        <button type="button" onClick={() => stopPlayback()} className="gen-ghost">
          Stop
        </button>
        {audioLabel ? <p className="text-sm text-muted">{audioLabel}</p> : null}
      </div>

      {active ? (
        <div className="gen-player relative mx-auto mt-4 w-52 sm:w-64">
          <video
            ref={playerRef}
            key={`${activeIndex}-${active.src}`}
            src={active.src}
            muted
            loop
            playsInline
            autoPlay={narrating}
            preload="auto"
            className="aspect-[9/16] w-full rounded-[1.15rem] object-cover"
          />
          <ViralSubtitles script={script} playhead={playhead} visible={narrating} />
          <p className="mt-2 text-center font-mono text-[11px] text-muted">
            {active.time} · {active.caption}
            {active.term ? ` · ${active.term}` : ""}
          </p>
        </div>
      ) : null}

      <div className="relative mt-5 h-10">
        <div className="absolute inset-x-0 top-3 h-px bg-line" />
        <span
          aria-hidden
          className="absolute top-1 h-4 w-0.5 bg-accent"
          style={{ left: `${Math.min(playhead, 1) * 100}%` }}
        />
        {frames.map((frame, index) => (
          <span
            key={frame.time}
            className="absolute top-3 -translate-x-1/2"
            style={{ left: `${(index / frames.length) * 100}%` }}
          >
            <span className="mx-auto block h-2 w-px bg-muted" />
            <span className="mt-1 block font-mono text-[10px] text-muted">{frame.time}</span>
          </span>
        ))}
        <span className="absolute top-3 right-0 translate-x-0">
          <span className="ml-auto block h-2 w-px bg-muted" />
          <span className="mt-1 block text-right font-mono text-[10px] text-muted">
            0:{String(VIDEO_DURATION_SEC).padStart(2, "0")}
          </span>
        </span>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {frames.map((frame, index) => {
          const activeCard = index === activeIndex;
          return (
            <figure
              key={frame.time}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              className={cn(
                "w-28 shrink-0 rounded-xl border p-1 transition-colors",
                activeCard ? "border-accent bg-accent/10" : "border-line",
              )}
              aria-current={activeCard ? "true" : undefined}
            >
              <video
                ref={activeCard ? thumbRef : undefined}
                key={activeCard ? `thumb-${index}-${frame.src}` : frame.src}
                src={frame.src}
                muted
                playsInline
                loop={activeCard}
                autoPlay={activeCard && narrating}
                preload={activeCard ? "auto" : "metadata"}
                className="aspect-[9/16] w-full rounded-lg object-cover"
              />
              <figcaption className="mt-2 px-1 pb-1">
                <span className="block font-mono text-[11px] text-foreground">{frame.time}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  {frame.caption}
                  <span className="text-muted/80"> · {FRAME_LENGTH_SEC}s</span>
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
