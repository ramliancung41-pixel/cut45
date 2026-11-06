"use client";

import { UpgradeNowButton } from "@/components/upgrade-now-button";
import { lumenFonts } from "@/lib/lumen-fonts";
import {
  CREDIT_EXPIRY_MONTHS,
  CREDIT_PACKS,
  DEFAULT_SCENE_SECONDS,
  MUSIC_TRACK_AVAILABLE,
  MUSIC_TRACK_CREDITS,
  NEW_USER_TRIAL_CREDITS,
  PROMPT_IMPROVE_CREDITS,
  PROMPT_IMPROVE_FREE_PER_DAY,
  STITCHED_EXPORT_1080P_CREDITS,
  STORY_SECONDS,
  TIERS,
  approxPrice,
  formatCredits,
  formatUsd,
  pricePerCredit,
  sceneCost,
  storyCost,
  tierCreditsPerSecond,
} from "@/lib/pricing.config";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const FAQ = [
  {
    q: "Do credits expire?",
    a: `Yes. Credits expire ${CREDIT_EXPIRY_MONTHS} months after purchase.`,
  },
  {
    q: "What happens if a generation fails?",
    a: "You aren't charged. Credits are only deducted after a clip finishes rendering successfully.",
  },
  {
    q: "Is there an unlimited plan?",
    a: "No. Every plan and top-up adds a fixed number of credits, and you only spend them on the seconds you render.",
  },
];

function cadenceLabel(cadence: string) {
  return cadence.startsWith("/") ? `per ${cadence.slice(1) === "mo" ? "month" : cadence.slice(1)}` : cadence;
}

export function CreditPacks({ afterPlans }: { afterPlans?: React.ReactNode }) {
  return (
    <div className={cn(lumenFonts, "lumen flex flex-col gap-10")}>
      <section aria-labelledby="packs-heading">
        <h2 id="packs-heading" className="text-2xl font-bold">
          Credit plans
        </h2>
        <p className="mt-2 text-sm text-(--l-muted)">
          Secure Stripe checkout. Credits expire after {CREDIT_EXPIRY_MONTHS} months. New accounts start with{" "}
          {formatCredits(NEW_USER_TRIAL_CREDITS)} to try it out.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <article
              key={pack.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-(--l-panel) p-5 sm:p-6",
                pack.popular ? "border-2 border-(--l-accent)" : "border-(--l-border)",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{pack.name}</h3>
                {pack.popular ? (
                  <span className="rounded-full bg-(--l-accent) px-2.5 py-1 text-[11px] font-semibold text-(--l-on-accent)">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="lumen-display text-4xl font-bold">{formatUsd(pack.priceUsd).replace(/\.00$/, "")}</span>
                <span className="text-sm text-(--l-muted)">{cadenceLabel(pack.cadence)}</span>
              </p>
              <p className="mt-2 text-sm font-medium">{formatCredits(pack.credits)}</p>
              <p className="mt-1 text-xs text-(--l-muted)">{formatUsd(pricePerCredit(pack.id))} per credit</p>
              <ul className="mt-4 flex flex-col gap-1.5 text-sm text-(--l-muted)">
                {TIERS.map((tier) => {
                  const scenes = Math.floor(pack.credits / sceneCost(tier.id, DEFAULT_SCENE_SECONDS));
                  return (
                    <li key={tier.id}>
                      Up to {(scenes * DEFAULT_SCENE_SECONDS).toLocaleString("en-US")}s of {tier.label} video
                    </li>
                  );
                })}
              </ul>
              <UpgradeNowButton
                plan={pack.id}
                label={`Buy ${pack.name}`}
                className={cn("mt-6", pack.popular ? "lumen-btn-primary" : "lumen-btn min-h-12")}
              />
            </article>
          ))}
        </div>
      </section>

      {afterPlans}

      <section aria-labelledby="story-costs-heading">
        <h2 id="story-costs-heading" className="text-2xl font-bold">
          What a {STORY_SECONDS}s video costs
        </h2>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-(--l-border) bg-(--l-panel)">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-(--l-border) text-(--l-muted)">
                <th scope="col" className="px-4 py-3 font-medium">
                  Tier
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {STORY_SECONDS}s video
                </th>
                {CREDIT_PACKS.map((pack) => (
                  <th key={pack.id} scope="col" className="px-4 py-3 text-right font-medium">
                    ≈ with {pack.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => {
                const cost = storyCost(tier.id, false);
                return (
                  <tr key={tier.id} className="border-b border-(--l-border) last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-medium">
                      <span className="lumen-display">{tier.label}</span>
                      <span className="block text-xs font-normal text-(--l-muted)">
                        {tierCreditsPerSecond(tier.id)} credits/sec · {tier.modelLabel} · {tier.resolution}
                      </span>
                    </th>
                    <td className="px-4 py-3 tabular-nums">{STORY_SECONDS}s video costs {formatCredits(cost)}</td>
                    {CREDIT_PACKS.map((pack) => (
                      <td key={pack.id} className="px-4 py-3 text-right tabular-nums">
                        {approxPrice(cost, pack.id)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-(--l-muted) sm:grid-cols-3">
          <li className="rounded-xl border border-(--l-border) bg-(--l-panel) px-4 py-3">
            Music track: {MUSIC_TRACK_AVAILABLE ? `+${formatCredits(MUSIC_TRACK_CREDITS)}` : "coming soon"}
          </li>
          <li className="rounded-xl border border-(--l-border) bg-(--l-panel) px-4 py-3">
            Prompt improve: {PROMPT_IMPROVE_FREE_PER_DAY} free per day, then {formatCredits(PROMPT_IMPROVE_CREDITS)}
          </li>
          <li className="rounded-xl border border-(--l-border) bg-(--l-panel) px-4 py-3">
            Joining scenes into one MP4:{" "}
            {STITCHED_EXPORT_1080P_CREDITS === 0 ? "free" : formatCredits(STITCHED_EXPORT_1080P_CREDITS)}
          </li>
        </ul>
      </section>

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-bold">
          FAQ
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-(--l-border) bg-(--l-panel)">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                {item.q}
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 shrink-0 text-(--l-muted) transition group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="m5 8 5 5 5-5" />
                </svg>
              </summary>
              <p className="px-4 pb-4 text-sm leading-6 text-(--l-muted)">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
