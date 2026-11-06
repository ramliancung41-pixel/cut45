"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditPacks } from "@/components/credit-packs";
import { PricingMatrix, PricingNotes, VoiceSwitch } from "@/components/pricing-matrix";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { lumenFonts } from "@/lib/lumen-fonts";
import { RESOLUTION_MULTIPLIER, STORY_SECONDS, TIERS, VOICE_PREMIUM_CREDITS, formatCredits, storyCost } from "@/lib/pricing.config";
import { VIDEO_RESOLUTIONS } from "@/lib/video-models";

const LOGIN_HREF = "/login?next=/generator";

function VoicePricing() {
  const [withVoice, setWithVoice] = useState(false);
  return (
    <section aria-labelledby="clip-credits-heading" className="scroll-mt-24" id="clip-credits">
      <div className="rounded-2xl border border-(--l-border) bg-(--l-panel) p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="clip-credits-heading" className="text-2xl font-bold">
              Single clips: with or without voice
            </h2>
            <p className="mt-1.5 text-sm text-(--l-muted)">
              {withVoice
                ? `Showing Video + Voiceover. Every price includes the +${VOICE_PREMIUM_CREDITS} credit voice fee.`
                : "Showing Video Only, no voiceover."}
            </p>
          </div>
          <VoiceSwitch withVoice={withVoice} onChange={setWithVoice} />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
          {VIDEO_RESOLUTIONS.map((resolution) => (
            <span key={resolution.id} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-zinc-300">
              {resolution.label} · {resolution.note} · {RESOLUTION_MULTIPLIER[resolution.id]}×
            </span>
          ))}
        </div>
        <div className="mt-4">
          <PricingMatrix view={withVoice ? "voice" : "video"} />
        </div>
        <div className="mt-4">
          <PricingNotes />
        </div>
      </div>
    </section>
  );
}

export function PublicPricing() {
  const cheapest = storyCost(TIERS[0].id, false);

  return (
    <div className="min-h-dvh bg-[#0d0e12] text-white">
      <SiteHeader active="pricing" />

      <main className={`${lumenFonts} lumen`}>
        <section className="mx-auto w-full max-w-6xl px-3 pt-12 pb-10 sm:px-6 sm:pt-16">
          <p className="text-xs font-medium tracking-[0.14em] text-(--l-muted) uppercase">Pricing</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-bold text-balance sm:text-5xl">
            Simple credits. A {STORY_SECONDS}-second story from {formatCredits(cheapest)}.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-(--l-muted) sm:text-base">
            Pick a plan, choose a model, and only pay for the seconds you render. Credits are deducted after a clip
            finishes, and joining scenes into one video is free.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={LOGIN_HREF} className="lumen-btn-primary px-6">
              Get Started / Login to Generate
            </Link>
            <a href="#clip-credits" className="lumen-btn min-h-12 px-6">
              See what a video costs
            </a>
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl px-3 pb-12 sm:px-6">
          <CreditPacks afterPlans={<VoicePricing />} />
        </div>

        <section className="mx-auto w-full max-w-6xl px-3 pb-20 sm:px-6">
          <div className="lumen-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div>
              <p className="lumen-display text-lg font-semibold">Ready to make your first story?</p>
              <p className="mt-1 text-sm text-(--l-muted)">Create a free account or log in to start generating.</p>
            </div>
            <Link href={LOGIN_HREF} className="lumen-btn-primary shrink-0 px-6">
              Get Started / Login to Generate
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
