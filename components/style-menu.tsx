"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IMAGE_STYLES, IMAGE_STYLE_CATEGORIES, type ImageStyleId } from "@/lib/image-styles";

type StyleValue = ImageStyleId | "";

const SWATCH: Record<StyleValue, string> = {
  "": "radial-gradient(circle at 30% 28%, #f4f4f5, #71717a 62%, #3f3f46)",
  photoreal: "radial-gradient(circle at 30% 28%, #f5e6d3, #a8a29e 58%, #57534e)",
  pixar: "radial-gradient(circle at 30% 28%, #fde68a, #fb923c 55%, #c2410c)",
  portrait: "radial-gradient(circle at 30% 28%, #f5d0b0, #d6a16a 52%, #1e293b)",
  "3d": "radial-gradient(circle at 30% 28%, #e0f2fe, #818cf8 55%, #4338ca)",
  watercolour: "radial-gradient(circle at 30% 28%, #fce7f3, #93c5fd 50%, #7dd3fc)",
  surreal: "radial-gradient(circle at 30% 28%, #f5d0fe, #a78bfa 48%, #6d28d9)",
  vangogh: "radial-gradient(circle at 30% 28%, #fde047, #2563eb 52%, #1e3a8a)",
  graffiti: "radial-gradient(circle at 30% 28%, #22d3ee, #ec4899 50%, #6b21a8)",
  oil: "radial-gradient(circle at 30% 28%, #fbbf24, #b45309 52%, #78350f)",
  cyberpunk: "radial-gradient(circle at 30% 28%, #67e8f9, #db2777 50%, #0f172a)",
  cartoon: "radial-gradient(circle at 30% 28%, #fde047, #fb7185 52%, #ef4444)",
  pixel: "radial-gradient(circle at 30% 28%, #bef264, #22c55e 52%, #166534)",
  funko: "radial-gradient(circle at 30% 28%, #f9a8d4, #38bdf8 52%, #0369a1)",
  anime: "radial-gradient(circle at 30% 28%, #ddd6fe, #fb7185 52%, #be123c)",
};

const OPTIONS: Array<{ id: StyleValue; name: string; category: string }> = [
  { id: "", name: "Default", category: "popular" },
  ...IMAGE_STYLES.map((style) => ({ id: style.id, name: style.name, category: style.category })),
];

export function StyleMenu({
  open,
  value,
  trigger,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: StyleValue;
  trigger: React.ReactNode;
  onSelect: (value: StyleValue) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setQuery("");
  }

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
    const frame = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeRef.current();
    }
    document.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const matches = OPTIONS.filter((option) => !needle || option.name.toLowerCase().includes(needle));
  const groups = IMAGE_STYLE_CATEGORIES.map((category) => ({
    ...category,
    options: matches.filter((option) => option.category === category.id),
  })).filter((group) => group.options.length > 0);

  function optionButtons() {
    return Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-style-option]") ?? []);
  }

  function moveFocus(from: HTMLElement | null, step: number) {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    const index = from ? buttons.indexOf(from as HTMLButtonElement) : -1;
    if (index < 0 && step < 0) {
      searchRef.current?.focus();
      return;
    }
    const next = index + step;
    if (next < 0) {
      searchRef.current?.focus();
      return;
    }
    buttons[Math.min(next, buttons.length - 1)]?.focus();
  }

  const menu = (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Style preset"
      inert={!open}
      data-open={open}
      className="style-menu"
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="style-menu-panel">
      <div className="style-menu-body">
      <label className="style-menu-search">
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-white/55"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.2 13.2 3.3 3.3" />
        </svg>
        <span className="sr-only">Search styles</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search styles..."
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(null, 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (matches[0]) onSelect(matches[0].id);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
        />
      </label>
      <div
        ref={listRef}
        className="style-menu-list"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveFocus(document.activeElement as HTMLElement, event.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-white/50">No styles match &ldquo;{query.trim()}&rdquo;</p>
        ) : (
          groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label} className="pb-1.5">
              <p className="style-menu-label">{group.label}</p>
              {group.options.map((option) => {
                const selected = value === option.id;
                return (
                  <button
                    key={option.id || "default"}
                    type="button"
                    data-style-option
                    aria-pressed={selected}
                    onClick={() => onSelect(option.id)}
                    className="style-menu-option"
                  >
                    <span aria-hidden className="style-menu-swatch" style={{ background: SWATCH[option.id] }} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
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
          ))
        )}
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
