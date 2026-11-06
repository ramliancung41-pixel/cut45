"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_CLIP_DURATIONS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  videoClipCreditCost,
  videoRenderPlan,
  type VideoClipDuration,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-models";

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="style-menu-tick"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

function FloatMenu({
  open,
  label,
  className,
  trigger,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  className: string;
  trigger: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      const top = Math.min(rect.bottom + 10, window.innerHeight - 24);
      setCoords({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeRef.current();
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const menu = (
    <div
      ref={menuRef}
      role="listbox"
      aria-label={label}
      inert={!open}
      data-open={open}
      className={`style-menu ${className}`}
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="style-menu-panel">
        <div className="style-menu-body">{children}</div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {ready ? createPortal(menu, document.body) : null}
    </div>
  );
}

export function VideoModelMenu({
  open,
  value,
  resolution,
  durationSec,
  trigger,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: VideoModelId;
  resolution: VideoResolution;
  durationSec: number;
  trigger: React.ReactNode;
  onSelect: (value: VideoModelId) => void;
  onClose: () => void;
}) {
  return (
    <FloatMenu open={open} label="Video model" className="video-model-menu" trigger={trigger} onClose={onClose}>
      <p className="style-menu-label">Models</p>
      <div className="style-menu-list image-model-list">
        {VIDEO_MODELS.map((model) => {
          const selected = value === model.id;
          return (
            <button
              key={model.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-pressed={selected}
              onClick={() => onSelect(model.id)}
              className="style-menu-option image-model-option"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{model.name}</span>
                  {model.id === DEFAULT_VIDEO_MODEL ? <span className="image-model-default">Default</span> : null}
                </span>
                <span className="mt-0.5 block text-[11px] text-white/45">
                  {model.note} · {videoClipCreditCost(model.id, resolution, durationSec)} credits
                </span>
              </span>
              <span className={`image-model-badge image-model-badge-${model.badge.toLowerCase().replace(" ", "-")}`}>
                {model.badge}
              </span>
              <Tick />
            </button>
          );
        })}
      </div>
    </FloatMenu>
  );
}

export function VideoDurationMenu({
  open,
  value,
  model,
  resolution,
  trigger,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: number;
  model: VideoModelId;
  resolution: VideoResolution;
  trigger: React.ReactNode;
  onSelect: (value: VideoClipDuration) => void;
  onClose: () => void;
}) {
  return (
    <FloatMenu open={open} label="Video duration" className="video-clip-menu" trigger={trigger} onClose={onClose}>
      <p className="style-menu-label">Duration</p>
      <div className="style-menu-list image-model-list">
        {VIDEO_CLIP_DURATIONS.map((seconds) => {
          const selected = value === seconds;
          return (
            <button
              key={seconds}
              type="button"
              role="option"
              aria-selected={selected}
              aria-pressed={selected}
              onClick={() => onSelect(seconds)}
              className="style-menu-option"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{seconds}s</span>
                <span className="mt-0.5 block text-[11px] text-white/45">
                  {videoClipCreditCost(model, resolution, seconds)} credits
                </span>
              </span>
              <Tick />
            </button>
          );
        })}
      </div>
    </FloatMenu>
  );
}

export function VideoResolutionMenu({
  open,
  value,
  model,
  durationSec,
  trigger,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: VideoResolution;
  model: VideoModelId;
  durationSec: number;
  trigger: React.ReactNode;
  onSelect: (value: VideoResolution) => void;
  onClose: () => void;
}) {
  return (
    <FloatMenu open={open} label="Video resolution" className="video-clip-menu" trigger={trigger} onClose={onClose}>
      <p className="style-menu-label">Resolution</p>
      <div className="style-menu-list image-model-list">
        {VIDEO_RESOLUTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-pressed={selected}
              onClick={() => onSelect(option.id)}
              className="style-menu-option"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">{option.label}</span>
                  {option.id === DEFAULT_VIDEO_RESOLUTION ? <span className="image-model-default">Default</span> : null}
                </span>
                <span className="mt-0.5 block text-[11px] text-white/45">
                  {option.note} · {videoClipCreditCost(model, option.id, durationSec)} credits
                </span>
                {videoRenderPlan(model, option.id).billed !== option.id ? (
                  <span className="mt-0.5 block text-[10px] text-amber-200/70">
                    Renders at {videoRenderPlan(model, option.id).billed} on this model
                  </span>
                ) : null}
              </span>
              <Tick />
            </button>
          );
        })}
      </div>
    </FloatMenu>
  );
}
