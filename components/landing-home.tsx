"use client";

import Link from "next/link";

export function LandingHome() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#07090e] text-zinc-100">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-violet-600/15 blur-[120px]" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col justify-center px-5 py-16">
        <p className="text-xs tracking-[0.22em] text-zinc-500 uppercase">Cut45</p>
        <h1 className="mt-4 bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-6xl">
          AI News Studio
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
          Turn a news story into a vertical host conversation, with Burmese or English voices and a finished video.
        </p>
        <div className="mt-8">
          <Link
            href="/login?next=/news-podcast"
            className="inline-flex h-12 items-center rounded-2xl bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-500 px-6 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
