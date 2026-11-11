"use client";

import Link from "next/link";
import { BuilderSlideshow } from "@/components/builder-slideshow";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export function LandingHome() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <SiteHeader />

      <main>
        <section className="mx-auto w-full max-w-7xl px-3 pt-10 pb-16 sm:px-6 sm:pt-16">
          <h1 className="max-w-4xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            Choose a template, edit it live, then publish.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/55">
            Three steps from a blank studio to a page you can export or put on a custom domain.{" "}
            <Link href="/pricing" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              See pricing
            </Link>
          </p>
          <div className="mt-8 sm:mt-12">
            <BuilderSlideshow />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
