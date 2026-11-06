"use client";

import { useEffect, useState } from "react";
import { PricingGuideModal } from "@/components/PricingGuideModal";
import { UpgradeNowButton } from "@/components/upgrade-now-button";

const TIERS = [
  {
    id: "topup" as const,
    name: "Top-up Boost",
    price: "$10",
    cadence: "one-time",
    credits: "150 credits",
    detail: "15 five-second clips, character reference sheets, and the standard queue.",
    label: "Buy Credits",
  },
  {
    id: "starter" as const,
    name: "Starter Plan",
    price: "$15",
    cadence: "/mo",
    credits: "300 credits",
    detail: "3 full short movies, 30 five-second clips, character sheets, and priority rendering.",
    featured: true,
    label: "Start Now",
  },
  {
    id: "pro" as const,
    name: "Pro Plan",
    price: "$40",
    cadence: "/mo",
    credits: "1,000 credits",
    detail: "10 full short movies, 100 five-second clips, 2x priority, and unlimited character sheets.",
    label: "Start Now",
  },
];

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pricingOpen, setPricingOpen] = useState(false);

  useEffect(() => {
    if (!open || pricingOpen) return;
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
  }, [open, onClose, pricingOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close upgrade plans"
        className="absolute inset-0 bg-black/70 backdrop-blur"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="relative max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-line bg-[var(--surface,#ffffff)] p-5 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="upgrade-modal-title" className="text-xl font-semibold tracking-tight">
              Upgrade your plan
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              This render needs more credits. Video cost is the model rate per second × duration × resolution (360p 1×, 720p
              1.5×, 1080p 2.2×), plus 20 credits for an ElevenLabs voiceover.
            </p>
            <button
              type="button"
              onClick={() => setPricingOpen(true)}
              className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-panel"
            >
              View pricing guide
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <article
              key={tier.id}
              className={
                "featured" in tier && tier.featured
                  ? "flex flex-col rounded-3xl border border-accent/70 bg-accent/10 p-5"
                  : "flex flex-col rounded-3xl border border-line bg-panel p-5"
              }
            >
              <h3 className="text-base font-semibold tracking-tight">{tier.name}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
                <span className="text-sm text-muted">{tier.cadence}</span>
              </p>
              <p className="mt-3 text-sm font-medium">{tier.credits}</p>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted">{tier.detail}</p>
              <UpgradeNowButton
                plan={tier.id}
                label={tier.label}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
              />
            </article>
          ))}
        </div>
      </section>
      <PricingGuideModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
}
