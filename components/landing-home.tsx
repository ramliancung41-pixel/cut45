"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthModal } from "@/components/auth-modal";
import { hasAccountSession } from "@/lib/account-session";
import { LandingPreview } from "@/components/landing-preview";
import { LandingPricing } from "@/components/landing-pricing";

const COST_ROWS = [
  ["CutScript (Gemini AI)", "Write script", "—", "Text", "0.00"],
  ["CutVoice (Premium Narration)", "Voice Narration", "—", "Speech", "10.00 / video"],
  ["CutStock B-Roll (Standard)", "Visual frames", "1080 × 1920", "—", "0.00 / sec"],
  ["CutMotion Budget (Fal.ai)", "Visual frames", "1080 × 1920", "—", "45 / video"],
  ["CutMotion Ultra (Fal.ai)", "Visual frames", "1080 × 1920", "—", "180 / video"],
  ["CutCaptions (Kinetic Subtitles)", "Kinetic Subtitles", "1080 × 1920", "Synced", "0.00"],
];

const COST_SUMMARIES = [
  "Standard Video (Free Stock): 0 credits.",
  "Budget AI Motion (Fal.ai): 45 credits.",
  "Ultra Cinematic AI (Fal.ai): 180 credits.",
  "Image generation (FLUX): 10 credits.",
  "AI Co-Pilot chat: free.",
];

export function LandingHome() {
  const [pricingOpen, setPricingOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  async function startNow() {
    if (starting) return;
    setStarting(true);
    const signedIn = await hasAccountSession();
    if (signedIn) {
      window.location.assign("/generator");
      return;
    }
    setStarting(false);
    setAuthOpen(true);
  }

  function revealPricing(target: "pricing" | "rates") {
    setPricingOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function togglePricing() {
    setPricingOpen((open) => {
      const next = !open;
      if (next) {
        window.requestAnimationFrame(() => {
          document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-black/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-4 sm:gap-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span aria-hidden className="h-8 w-5 rounded-[4px] border border-white/80 bg-white/10" />
            <span className="text-sm font-medium tracking-tight">Cut45</span>
          </Link>
          <nav aria-label="Landing" className="flex items-center gap-3 sm:gap-6">
            <button
              type="button"
              aria-expanded={pricingOpen}
              aria-controls="pricing"
              onClick={togglePricing}
              className="text-sm text-white/60 hover:text-white"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => revealPricing("rates")}
              className="text-sm text-white/60 hover:text-white"
            >
              Rates
            </button>
            <button
              type="button"
              disabled={starting}
              onClick={() => void startNow()}
              className="flex h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-black enabled:hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
            >
              Start Now
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-7xl px-3 pt-10 pb-16 sm:px-6 sm:pt-16">
          <h1 className="max-w-4xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            AI Prompts for Viral Video Content Creation.
          </h1>
          <div className="mt-8 sm:mt-12">
            <LandingPreview />
          </div>
        </section>

        {pricingOpen ? (
          <>
            <section
              id="pricing"
              aria-labelledby="pricing-heading"
              className="mx-auto w-full max-w-7xl scroll-mt-24 px-3 py-16 sm:px-6"
            >
              <h2 id="pricing-heading" className="sr-only">
                Pricing
              </h2>
              <LandingPricing />
            </section>

            <section
              id="rates"
              aria-labelledby="rates-heading"
              className="mx-auto w-full max-w-7xl scroll-mt-24 px-3 pt-4 pb-20 sm:px-6"
            >
              <h2 id="rates-heading" className="text-2xl font-medium tracking-tight">
                Cost per video generation
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
                Credits are deducted dynamically from your balance based on the engine options you
                configure for your project workflow.
              </p>
              <div className="mt-6 overflow-x-auto rounded-3xl border border-gray-800 bg-[#0c0c0c]">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {["Model", "Action", "Resolution", "Audio", "Token cost"].map((heading) => (
                        <th key={heading} className="px-4 py-4 font-medium text-white/70 sm:px-6">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COST_ROWS.map((row) => (
                      <tr
                        key={row[0]}
                        className="border-b border-gray-800 transition-colors duration-200 last:border-b-0 hover:bg-white/[0.06]"
                      >
                        {row.map((cell, index) => (
                          <td
                            key={`${row[0]}-${index}`}
                            className={
                              index === 0
                                ? "px-4 py-4 font-semibold text-white sm:px-6"
                                : index === row.length - 1
                                  ? "px-4 py-4 font-mono text-white sm:px-6"
                                  : "px-4 py-4 font-light text-white/85 sm:px-6"
                            }
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {COST_SUMMARIES.map((summary) => (
                  <article
                    key={summary}
                    className="rounded-3xl border border-gray-800 bg-[#111] p-5 text-sm leading-6 text-white/85 transition-colors duration-200 hover:border-white/40 hover:bg-[#161616] sm:p-6"
                  >
                    {summary}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
