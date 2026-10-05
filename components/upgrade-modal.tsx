"use client";

import { useEffect } from "react";
import { UpgradeNowButton } from "@/components/upgrade-now-button";

const TIERS = [
  {
    id: "starter" as const,
    name: "Starter",
    price: "$15",
    cadence: "/mo",
    credits: "300 credits",
    detail: "A monthly pack for draft shorts.",
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$40",
    cadence: "/mo",
    credits: "1,000 credits",
    detail: "The monthly plan for regular Studio Fast Motion.",
    featured: true,
  },
  {
    id: "ultra" as const,
    name: "Ultra",
    price: "$120",
    cadence: "/mo",
    credits: "3,500 credits",
    detail: "The largest monthly pack on the pricing page.",
  },
];

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        className="relative max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#12100e] p-5 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="upgrade-modal-title" className="text-xl font-semibold tracking-tight">
              Upgrade your plan
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              This render needs more credits. A 5s clip is 45, 15s is 135, 30s is 270, and 60s is 540.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <article
              key={tier.id}
              className={
                tier.featured
                  ? "flex flex-col rounded-3xl border border-accent/70 bg-accent/10 p-5"
                  : "flex flex-col rounded-3xl border border-white/10 bg-black/30 p-5"
              }
            >
              <h3 className="text-base font-semibold tracking-tight">{tier.name}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
                <span className="text-sm text-muted">{tier.cadence}</span>
              </p>
              <p className="mt-3 text-sm font-medium">{tier.credits}</p>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted">{tier.detail}</p>
              {tier.id === "ultra" ? (
                <a
                  href="/credits"
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-white/20 text-sm font-medium hover:bg-white/5"
                >
                  View plans
                </a>
              ) : (
                <UpgradeNowButton
                  plan={tier.id}
                  className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
                />
              )}
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 px-4 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted">Need a smaller pack? Buy 150 credits once.</p>
          <UpgradeNowButton
            plan="topup"
            label="Buy 150 credits"
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/20 px-5 text-sm font-medium hover:bg-white/5 disabled:opacity-60"
          />
        </div>
      </section>
    </div>
  );
}
