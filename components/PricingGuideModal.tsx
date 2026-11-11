"use client";

import { useEffect, useState } from "react";
import { PricingMatrix, PricingNotes, type PricingView } from "@/components/pricing-matrix";
import { RESOLUTION_MULTIPLIER, VIDEO_RESOLUTIONS } from "@/lib/pricing.config";

const MODES: Array<{ id: PricingView; label: string }> = [
  { id: "video", label: "Video Only" },
  { id: "voice", label: "Video + Voiceover" },
  { id: "compare", label: "Compare" },
];

export function PricingGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<PricingView>("compare");

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" aria-label="Close pricing guide" className="absolute inset-0 bg-black/75 backdrop-blur" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-guide-title"
        className="relative max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_top,#18181b_0%,#09090b_100%)] p-5 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:p-7"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">Pricing guide</p>
            <h2 id="pricing-guide-title" className="mt-1.5 text-xl font-bold tracking-tight text-white">
              Video credits by model, resolution, and length
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-zinc-400">
              Credits = rate per second × duration × resolution multiplier, rounded up.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Pricing view" className="flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={mode === item.id}
                onClick={() => setMode(item.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  mode === item.id ? "bg-white text-black" : "text-zinc-300 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {VIDEO_RESOLUTIONS.map((resolution) => (
              <span key={resolution.id} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-zinc-300">
                {resolution.label} · {RESOLUTION_MULTIPLIER[resolution.id]}×
              </span>
            ))}
          </div>
        </div>

        {mode === "compare" ? (
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-300" /> Video Only
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-violet-400" /> Video + Voiceover (Rachel / ElevenLabs)
            </span>
          </div>
        ) : null}

        <div className="mt-4">
          <PricingMatrix view={mode} />
        </div>

        <div className="mt-4">
          <PricingNotes />
        </div>
      </section>
    </div>
  );
}
