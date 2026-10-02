"use client";

import { useEffect, useRef } from "react";
import { ViralSubtitles } from "@/components/viral-subtitles";
import { FRAME_LENGTH_SEC, VIDEO_DURATION_SEC, type StoryFrame } from "@/lib/generate";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function activeFrameIndex(playhead: number, count: number) {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.floor(Math.min(playhead, 0.999) * count));
}

export function Storyboard({
  frames,
  script,
  playhead,
  narrating,
}: {
  frames: StoryFrame[];
  script: string;
  playhead: number;
  narrating: boolean;
}) {
  const activeIndex = activeFrameIndex(playhead, frames.length);
  const active = frames[activeIndex];
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const playerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    cardRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (narrating) {
      void player.play().catch(() => undefined);
      return;
    }
    player.pause();
  }, [narrating, activeIndex, active?.src]);

  return (
    <div className="mt-5">
      {active ? (
        <div className="relative mx-auto w-52 sm:w-64">
          <video
            ref={playerRef}
            key={active.src}
            src={active.src}
            muted
            loop
            playsInline
            autoPlay={narrating}
            preload="auto"
            className="aspect-[9/16] w-full rounded-xl border border-line object-cover"
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
