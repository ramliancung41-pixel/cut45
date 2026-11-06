"use client";

import Link from "next/link";
import { LandingPreview } from "@/components/landing-preview";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export function LandingHome() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <SiteHeader />

      <main>
        <section className="mx-auto w-full max-w-7xl px-3 pt-10 pb-16 sm:px-6 sm:pt-16">
          <h1 className="max-w-4xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            AI Prompts for Viral Video Content Creation.
          </h1>
          <p className="mt-4 text-sm text-white/55">
            Transparent per-clip credits.{" "}
            <Link href="/pricing" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              See pricing
            </Link>
          </p>
          <div className="mt-8 sm:mt-12">
            <LandingPreview />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
