"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IMAGE_MODELS, type ImageModelId } from "@/lib/image-models";

export function ImageModelMenu({
  open,
  value,
  trigger,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: ImageModelId;
  trigger: React.ReactNode;
  onSelect: (value: ImageModelId) => void;
  onClose: () => void;
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
      role="dialog"
      aria-label="Image model"
      inert={!open}
      data-open={open}
      className="style-menu image-model-menu"
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="style-menu-panel">
        <div className="style-menu-body">
          <p className="style-menu-label">Models</p>
          <div className="style-menu-list image-model-list">
            {IMAGE_MODELS.map((model) => {
              const selected = value === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(model.id)}
                  className="style-menu-option image-model-option"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{model.name}</span>
                      {model.id === "nano" ? <span className="image-model-default">Default</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-white/45">{model.credits} credits</span>
                  </span>
                  <span className={`image-model-badge image-model-badge-${model.badge.toLowerCase().replace(" ", "-")}`}>
                    {model.badge}
                  </span>
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
                </button>
              );
            })}
          </div>
        </div>
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
