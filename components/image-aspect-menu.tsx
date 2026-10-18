"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_IMAGE_ASPECT, IMAGE_ASPECTS, type ImageAspectId } from "@/lib/image-aspects";

function RatioGlyph({ id }: { id: ImageAspectId }) {
  const box =
    id === "21:9"
      ? "h-2 w-6"
      : id === "16:9"
        ? "h-2.5 w-5"
        : id === "4:3"
          ? "h-3 w-[1.15rem]"
          : id === "1:1"
            ? "h-3.5 w-3.5"
            : id === "3:4"
              ? "h-[1.15rem] w-3"
              : "h-5 w-2.5";
  return <span aria-hidden className={`rounded-[2px] border-[1.5px] border-current ${box}`} />;
}

export function ImageAspectMenu({
  open,
  value,
  trigger,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: ImageAspectId;
  trigger: React.ReactNode;
  onSelect: (value: ImageAspectId) => void;
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
      const width = Math.min(280, window.innerWidth - 24);
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
      aria-label="Aspect ratio"
      inert={!open}
      data-open={open}
      className="style-menu image-aspect-menu"
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="style-menu-panel">
        <div className="style-menu-body">
          <p className="style-menu-label">Aspect ratio</p>
          <div className="style-menu-list image-model-list">
            {IMAGE_ASPECTS.map((option) => {
              const selected = value === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(option.id)}
                  className="style-menu-option"
                >
                  <RatioGlyph id={option.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{option.label}</span>
                      {option.id === DEFAULT_IMAGE_ASPECT ? <span className="image-model-default">Default</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-white/45">{option.note}</span>
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
