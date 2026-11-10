"use client";

import { useEffect, useRef, useState } from "react";
import { primeSpeechVoices, speakNarration, stopNarration } from "@/lib/browser-speech";
import { type AspectRatio } from "@/lib/frame";
import { VIDEO_DURATION_SEC, formatTimecode, isMotionSrc, sceneBlocks, type StoryFrame } from "@/lib/generate";
import { isVoiceId } from "@/lib/voices";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function frameClass(aspect: AspectRatio) {
  if (aspect === "16:9") return "aspect-video w-full";
  if (aspect === "1:1") return "aspect-square w-full";
  return "aspect-[9/16] w-full";
}

export function Storyboard({
  frames,
  script,
  voiceId,
  audioSrc,
  audioLabel,
  narrationEmbedded = false,
  durationSec = VIDEO_DURATION_SEC,
  videoUrl,
  aspect = "9:16",
  onSaveCharacter,
}: {
  frames: StoryFrame[];
  script: string;
  voiceId: string;
  audioSrc?: string;
  audioLabel?: string;
  narrationEmbedded?: boolean;
  durationSec?: number;
  videoUrl?: string;
  aspect?: AspectRatio;
  onSaveCharacter?: () => void;
}) {
  const scenes = sceneBlocks(frames);
  const movieSrc = videoUrl?.startsWith("https://") ? videoUrl : scenes.length === 1 ? scenes[0]?.src ?? "" : "";
  const [playhead, setPlayhead] = useState(0);
  const [narrating, setNarrating] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
  const activeIndex = movieSrc
    ? Math.min(Math.max(scenes.length - 1, 0), Math.floor(Math.min(playhead, 0.999) * Math.max(scenes.length, 1)))
    : sceneIndex;
  const active = scenes[activeIndex];
  const mainSrc = movieSrc || active?.src || "";
  const sceneLength = Math.max(1, Math.round(durationSec / Math.max(scenes.length, 1)));
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const playerRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const sceneIndexRef = useRef(0);
  const startedAtRef = useRef(0);
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
    sceneIndexRef.current = sceneIndex;
    if (!playingRef.current || movieSrc) return;
    const player = playerRef.current;
    if (!player) return;
    try {
      player.currentTime = 0;
    } catch {
      // The next scene may still be loading.
    }
    void player.play().catch(() => undefined);
  }, [sceneIndex, movieSrc]);

  function stopPlayback(atEnd = false) {
    playingRef.current = false;
    window.cancelAnimationFrame(rafRef.current);
    stopNarration();
    audioRef.current?.pause();
    playerRef.current?.pause();
    setNarrating(false);
    if (atEnd) setPlayhead(1);
  }

  function tick(now: number) {
    if (!playingRef.current) return;
    const player = playerRef.current;
    const duration = player && Number.isFinite(player.duration) ? player.duration : 0;
    let progress = 0;
    if (movieSrc && duration > 0) {
      progress = Math.min(1, player!.currentTime / duration);
    } else if (duration > 0 && scenes.length > 0) {
      progress = Math.min(1, (sceneIndexRef.current + player!.currentTime / duration) / scenes.length);
    } else {
      progress = Math.min(1, (now - startedAtRef.current) / Math.max(1000, durationSec * 1000));
    }
    if (now - lastUiRef.current > 80 || progress >= 1) {
      lastUiRef.current = now;
      setPlayhead(progress);
    }
    if ((movieSrc || duration === 0) && (player?.ended || progress >= 0.995)) {
      stopPlayback(true);
      return;
    }
    rafRef.current = window.requestAnimationFrame(tick);
  }

  function onClipEnded() {
    if (!playingRef.current || movieSrc) {
      stopPlayback(true);
      return;
    }
    if (sceneIndexRef.current < scenes.length - 1) {
      setSceneIndex((index) => index + 1);
      return;
    }
    stopPlayback(true);
  }

  function play() {
    playingRef.current = false;
    window.cancelAnimationFrame(rafRef.current);
    stopNarration();
    audioRef.current?.pause();
    playerRef.current?.pause();
    sceneIndexRef.current = 0;
    setSceneIndex(0);
    setPlayhead(0);
    setNarrating(true);
    playingRef.current = true;
    startedAtRef.current = performance.now();
    lastUiRef.current = 0;

    const player = playerRef.current;
    if (player) {
      player.muted = false;
      try {
        player.currentTime = 0;
      } catch {
        // The clip may not be seekable until metadata loads.
      }
      void player.play().catch(() => undefined);
    }

    rafRef.current = window.requestAnimationFrame(tick);
  }

  return (
    <div className="mt-5">

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={play} className="gen-cta">
          Play
        </button>
        <button type="button" onClick={() => stopPlayback()} className="gen-ghost">
          Stop
        </button>
        {onSaveCharacter ? (
          <button type="button" onClick={onSaveCharacter} className="gen-ghost">
            Save to Character
          </button>
        ) : null}
      </div>

      {mainSrc ? (
        <div className={cn("gen-player relative mx-auto mt-4", aspect === "16:9" ? "w-full max-w-xl" : "w-52 sm:w-64")}>
          {isMotionSrc(mainSrc) ? (
            <video
              ref={playerRef}
              key={mainSrc}
              src={mainSrc}
              playsInline
              preload="auto"
              onEnded={onClipEnded}
              className={cn(frameClass(aspect), "rounded-[1.15rem] object-cover")}
            />
          ) : (
            <img src={mainSrc} alt="" className={cn(frameClass(aspect), "rounded-[1.15rem] object-cover")} />
          )}
          <p className="mt-2 text-center font-mono text-[11px] text-muted">
            {formatTimecode(Math.min(durationSec, playhead * durationSec))} / {formatTimecode(durationSec)}
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
        {scenes.map((frame, index) => (
          <span
            key={`${frame.src}-${frame.time}`}
            className="absolute top-3 -translate-x-1/2"
            style={{ left: `${((index + 0.5) / Math.max(scenes.length, 1)) * 100}%` }}
          >
            <span className="mx-auto block h-2 w-px bg-muted" />
            <span className="mt-1 block font-mono text-[10px] text-muted">{frame.time}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {scenes.map((frame, index) => {
          const activeCard = index === activeIndex;
          const motion = isMotionSrc(frame.src);
          return (
            <figure
              key={`${frame.src}-${frame.time}`}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              className={cn(
                "w-28 shrink-0 rounded-xl border p-1 transition-colors",
                activeCard ? "border-accent bg-accent/10" : "border-line",
              )}
              aria-current={activeCard ? "true" : undefined}
            >
              {motion ? (
                <video
                  src={frame.src}
                  muted
                  playsInline
                  preload="metadata"
                  className={cn(frameClass(aspect), "rounded-lg object-cover")}
                />
              ) : (
                <img src={frame.src} alt="" className={cn(frameClass(aspect), "rounded-lg object-cover")} />
              )}
              <figcaption className="mt-2 px-1 pb-1">
                <span className="block font-mono text-[11px] text-foreground">{frame.time}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  {frame.caption}
                  <span className="text-muted/80"> · {sceneLength}s</span>
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
