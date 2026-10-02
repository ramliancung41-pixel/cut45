import type { Metadata } from "next";
import Link from "next/link";
import { AuthGateButton } from "@/components/auth-gate-button";
import { LandingPreview } from "@/components/landing-preview";
import { LandingPricing } from "@/components/landing-pricing";

export const metadata: Metadata = {
  title: {
    absolute: "Cut45 — AI Prompts for Viral Video Content Creation",
  },
  description:
    "AI prompts for viral video content creation, with 9:16 short previews and transparent credit pricing.",
};

const COST_ROWS = [
  ["CutScript (Gemini AI)", "Write script", "—", "Text", "0.00"],
  ["CutVoice (Premium Narration)", "Voice Narration", "—", "Speech", "10.00 / video"],
  ["CutStock B-Roll (Standard)", "Visual frames", "1080 × 1920", "—", "0.00 / sec"],
  ["CutMotion AI (Cinematic)", "Visual frames", "1080 × 1920", "—", "2.00 / sec"],
  ["CutCaptions (Kinetic Subtitles)", "Kinetic Subtitles", "1080 × 1920", "Synced", "0.00"],
];

const COST_SUMMARIES = [
  "🎬 Standard Video (Free Stock Visuals): 0 credits script + 10 credits voice + 0 credits video = 10 Credits total per video output.",
  "🔥 Premium AI Movie Video: 0 credits script + 10 credits voice + 90 credits AI motion (45s × 2.00/s) = 100 Credits total per video output.",
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span aria-hidden className="h-8 w-5 rounded-[4px] border border-white/80 bg-white/10" />
            <span className="text-sm font-medium tracking-tight">Cut45</span>
          </Link>
          <nav aria-label="Landing" className="flex items-center gap-3 sm:gap-6">
            <Link href="/generator" className="text-sm text-white/60 hover:text-white">
              AI Generator
            </Link>
            <a href="#pricing" className="hidden text-sm text-white/60 hover:text-white sm:inline">
              Pricing
            </a>
            <a href="#rates" className="hidden text-sm text-white/60 hover:text-white md:inline">
              Rates
            </a>
            <AuthGateButton
              label="Start Now"
              signedInHref="/dashboard"
              className="flex h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-black enabled:hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
            />
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 pt-14 pb-8 sm:px-6 sm:pt-20">
          <h1 className="max-w-4xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            AI Prompts for Viral Video Content Creation.
          </h1>
          <div className="mt-8 sm:mt-12">
            <LandingPreview />
          </div>
        </section>

        <section
          id="pricing"
          aria-labelledby="pricing-heading"
          className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
        >
          <h2 id="pricing-heading" className="sr-only">
            Pricing
          </h2>
          <LandingPricing />
        </section>

        <section
          id="rates"
          aria-labelledby="rates-heading"
          className="mx-auto w-full max-w-6xl px-4 pt-4 pb-20 sm:px-6"
        >
          <h2 id="rates-heading" className="text-2xl font-medium tracking-tight">
            Cost per video generation
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
            Credits are deducted dynamically from your balance based on the engine options you
            configure for your project workflow.
          </p>
          <div className="mt-6 overflow-x-auto rounded-3xl border border-white/15 bg-[#0c0c0c]">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
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
                    className="border-b border-white/10 transition-colors duration-200 last:border-b-0 hover:bg-white/[0.06]"
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
                className="rounded-3xl border border-white/15 bg-[#111] p-5 text-sm leading-6 text-white/85 transition-colors duration-200 hover:border-white/40 hover:bg-[#161616] sm:p-6"
              >
                {summary}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
