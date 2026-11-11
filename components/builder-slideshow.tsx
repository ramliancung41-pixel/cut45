"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    id: "template",
    title: "Choose Dynamic Template",
    body: "Start from Studio, Product, Portfolio, or Waitlist. Each one already has a hero, features, proof, and a close.",
  },
  {
    id: "customize",
    title: "Live Editor & Preview",
    body: "Change colors and fonts, rewrite each block, and reorder sections. Desktop and mobile update as you edit.",
  },
  {
    id: "publish",
    title: "One-Click Code Export & Custom Domain Publishing",
    body: "Download the HTML and React files, or publish the page on its public address and a client domain.",
  },
] as const;

export function BuilderSlideshow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const step = STEPS[index] ?? STEPS[0];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) setPaused(true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STEPS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [paused, epoch]);

  function go(next: number) {
    setIndex((next + STEPS.length) % STEPS.length);
    setEpoch((value) => value + 1);
  }

  return (
    <section aria-roledescription="carousel" aria-label="How the builder works" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <p className="text-xs tracking-[0.18em] text-white/50 uppercase">Step {index + 1} of {STEPS.length}</p>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => go(index - 1)} className="h-9 rounded-full border border-white/15 px-4 text-xs text-white/80 hover:text-white">
            Previous
          </button>
          <button type="button" onClick={() => go(index + 1)} className="h-9 rounded-full border border-white/15 px-4 text-xs text-white/80 hover:text-white">
            Next
          </button>
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          <TemplateSlide active={index === 0} />
          <CustomizeSlide active={index === 1} />
          <PublishSlide active={index === 2} />
        </div>
      </div>

      <div className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">{step.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{step.body}</p>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Slideshow steps">
          {STEPS.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={itemIndex === index}
              aria-label={item.title}
              onClick={() => go(itemIndex)}
              className={`h-2.5 rounded-full transition-all ${itemIndex === index ? "w-8 bg-white" : "w-2.5 bg-white/30"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplateSlide({ active }: { active: boolean }) {
  const cards = [
    { name: "Studio", tone: "from-cyan-400/40 to-teal-900/50" },
    { name: "Product", tone: "from-fuchsia-400/40 to-violet-950/50" },
    { name: "Portfolio", tone: "from-sky-400/40 to-blue-950/50" },
    { name: "Waitlist", tone: "from-amber-300/40 to-emerald-950/50" },
  ];
  return (
    <div className="w-full shrink-0 p-4 sm:p-6" aria-hidden={!active}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.name} className={`rounded-2xl bg-gradient-to-b ${card.tone} p-4`}>
            <p className="text-xs tracking-[0.16em] text-white/70 uppercase">{card.name}</p>
            <div className="mt-4 h-3 w-2/3 rounded-full bg-white/80" />
            <div className="mt-2 h-2 w-full rounded-full bg-white/30" />
            <div className="mt-2 h-2 w-5/6 rounded-full bg-white/30" />
            <div className="mt-6 grid grid-cols-3 gap-2">
              <span className="h-10 rounded-lg bg-white/15" />
              <span className="h-10 rounded-lg bg-white/15" />
              <span className="h-10 rounded-lg bg-white/15" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomizeSlide({ active }: { active: boolean }) {
  return (
    <div className="w-full shrink-0 p-4 sm:p-6" aria-hidden={!active}>
      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs tracking-[0.16em] text-white/50 uppercase">Theme</p>
          <div className="mt-3 flex gap-2">
            <span className="h-6 w-6 rounded-full bg-white" />
            <span className="h-6 w-6 rounded-full bg-amber-200" />
            <span className="h-6 w-6 rounded-full bg-zinc-700" />
          </div>
          <p className="mt-3 text-xs text-white/50">Sans · Serif · Display</p>
          <ol className="mt-4 space-y-2 text-sm">
            <li className="rounded-lg bg-white/10 px-2 py-1.5">1. Hero</li>
            <li className="rounded-lg bg-white/10 px-2 py-1.5">2. Features</li>
            <li className="rounded-lg bg-white/10 px-2 py-1.5">3. Contact</li>
          </ol>
        </div>
        <div className="rounded-2xl bg-[#f6f3ee] p-5 text-stone-900">
          <p className="text-xs tracking-[0.16em] text-stone-500 uppercase">Live preview</p>
          <p className="mt-3 max-w-md text-3xl font-semibold tracking-tight">A clear offer, above the fold.</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-stone-500">Desktop and mobile update as the copy and colors change.</p>
          <span className="mt-5 inline-flex rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Get started</span>
        </div>
      </div>
    </div>
  );
}

function PublishSlide({ active }: { active: boolean }) {
  return (
    <div className="w-full shrink-0 p-4 sm:p-6" aria-hidden={!active}>
      <div className="grid gap-3 lg:grid-cols-2">
        <pre className="overflow-hidden rounded-2xl bg-zinc-950 p-4 text-xs leading-6 text-emerald-200">
          <code>{`index.html\nLandingPage.tsx\n\nexport default function LandingPage() {\n  return <main>Your page</main>\n}`}</code>
        </pre>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs tracking-[0.16em] text-white/50 uppercase">Publish</p>
          <p className="mt-3 text-lg font-medium">client.com</p>
          <p className="mt-2 text-sm text-white/60">Public page at /p/northwind-studio</p>
          <span className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black">Export HTML/React Code</span>
        </div>
      </div>
    </div>
  );
}
