"use client";

import { useRef, useState } from "react";
import { StudioPageHeader } from "@/components/studio-page";
import { imageThumbnail } from "@/lib/image-thumbnail";
import { IMAGE_STYLES } from "@/lib/image-styles";
import { prepareReferenceImage } from "@/lib/prepare-reference-image";
import { brandStore, type BrandKit } from "@/lib/studio-prefs";

const HEX = /^#[0-9a-f]{6}$/i;

export function BrandBoard() {
  const brand = brandStore.useValue();
  const [draftColor, setDraftColor] = useState("#f97316");
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  function update(patch: Partial<BrandKit>) {
    brandStore.set((current) => ({ ...current, ...patch }));
  }

  async function setLogo(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareReferenceImage(file);
      const logo = await imageThumbnail(prepared, 512, 0.85);
      if (logo) update({ logo });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not use that logo.");
    }
  }

  function addColor() {
    const color = draftColor.toLowerCase();
    if (!HEX.test(color) || brand.colors.includes(color) || brand.colors.length >= 8) return;
    update({ colors: [...brand.colors, color] });
  }

  const styleName = IMAGE_STYLES.find((style) => style.id === brand.style)?.name;

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Brand"
        title="Brand Kit"
        description="Store your logo, palette, default visual style, and tone. The Agent uses this kit to keep Co-Pilot suggestions and image renders on-brand."
        action={<span className="text-xs text-zinc-500">Saved automatically</span>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <section className="agent-glass rounded-2xl p-5" aria-labelledby="brand-identity">
            <h2 id="brand-identity" className="text-sm font-semibold text-white">
              Identity
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-[11px] text-zinc-400 transition hover:border-white/30 hover:text-white"
                aria-label={brand.logo ? "Replace logo" : "Upload logo"}
              >
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logo} alt="Brand logo" className="h-full w-full object-contain p-2" />
                ) : (
                  "Upload logo"
                )}
              </button>
              <input
                ref={logoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  void setLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="min-w-0 flex-1">
                <label htmlFor="brand-name" className="text-xs font-medium text-zinc-400">
                  Brand name
                </label>
                <input
                  id="brand-name"
                  value={brand.name}
                  maxLength={60}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="Cut45 Studio"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/25"
                />
                {brand.logo ? (
                  <button type="button" onClick={() => update({ logo: "" })} className="mt-2 text-xs text-zinc-400 hover:text-red-300">
                    Remove logo
                  </button>
                ) : null}
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
          </section>

          <section className="agent-glass rounded-2xl p-5" aria-labelledby="brand-colors">
            <h2 id="brand-colors" className="text-sm font-semibold text-white">
              Color palette
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2.5">
              {brand.colors.map((color) => (
                <li key={color} className="group relative">
                  <span
                    className="block h-14 w-14 rounded-xl border border-white/10 shadow-inner"
                    style={{ background: color }}
                    title={color}
                  />
                  <span className="mt-1 block text-center font-mono text-[10px] text-zinc-400 uppercase">{color}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${color}`}
                    onClick={() => update({ colors: brand.colors.filter((item) => item !== color) })}
                    className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-zinc-900 text-[11px] text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-red-300 focus-visible:opacity-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="color"
                value={draftColor}
                onChange={(event) => setDraftColor(event.target.value)}
                aria-label="Pick a color"
                className="h-9 w-11 cursor-pointer rounded-lg border border-white/10 bg-transparent"
              />
              <input
                value={draftColor}
                onChange={(event) => setDraftColor(event.target.value)}
                aria-label="Hex color"
                maxLength={7}
                className="w-28 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs text-white uppercase outline-none focus:border-white/25"
              />
              <button
                type="button"
                onClick={addColor}
                disabled={!HEX.test(draftColor) || brand.colors.length >= 8}
                className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                Add color
              </button>
              <span className="text-[11px] text-zinc-500">{brand.colors.length}/8</span>
            </div>
          </section>

          <section className="agent-glass rounded-2xl p-5" aria-labelledby="brand-style">
            <h2 id="brand-style" className="text-sm font-semibold text-white">
              Default visual style
            </h2>
            <p className="mt-1 text-xs text-zinc-400">Used for Agent image renders when a request has no style of its own.</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={!brand.style}
                onClick={() => update({ style: "" })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  !brand.style ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white"
                }`}
              >
                No default
              </button>
              {IMAGE_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  aria-pressed={brand.style === style.id}
                  onClick={() => update({ style: style.id })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    brand.style === style.id
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </section>

          <section className="agent-glass rounded-2xl p-5" aria-labelledby="brand-tone">
            <h2 id="brand-tone" className="text-sm font-semibold text-white">
              Tone of voice
            </h2>
            <textarea
              aria-labelledby="brand-tone"
              value={brand.voice}
              maxLength={300}
              rows={3}
              onChange={(event) => update({ voice: event.target.value })}
              placeholder="Bold, playful, and optimistic. Short sentences. No jargon."
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/25"
            />
          </section>
        </div>

        <aside className="agent-glass h-fit overflow-hidden rounded-2xl lg:sticky lg:top-6" aria-label="Brand preview">
          <div
            className="flex h-32 items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${brand.colors[0] ?? "#27272a"}, ${brand.colors[1] ?? brand.colors[0] ?? "#18181b"})`,
            }}
          >
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt="" className="h-16 w-16 rounded-xl bg-white/90 object-contain p-1.5 shadow-lg" />
            ) : (
              <span className="text-2xl font-bold tracking-tight text-white drop-shadow">{brand.name || "Your brand"}</span>
            )}
          </div>
          <div className="flex flex-col gap-3 p-5">
            <p className="text-base font-semibold text-white">{brand.name || "Untitled brand"}</p>
            <div className="flex gap-1">
              {brand.colors.map((color) => (
                <span key={color} className="h-2 flex-1 rounded-full" style={{ background: color }} />
              ))}
            </div>
            <dl className="grid gap-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Style</dt>
                <dd className="text-right text-zinc-200">{styleName ?? "No default"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Colors</dt>
                <dd className="text-zinc-200 tabular-nums">{brand.colors.length}</dd>
              </div>
            </dl>
            {brand.voice ? <p className="text-xs leading-5 text-zinc-400 italic">“{brand.voice}”</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
