"use client";

import { AuthGateButton } from "@/components/auth-gate-button";

const PLANS = [
  {
    id: "topup",
    name: "Top-up Boost",
    price: "$10",
    cadence: "One-time payment",
    creditLabel: "150 Credits",
    points: [
      "15 x 5s video clips (or 150s total video)",
      "Character reference sheets",
      "Standard queue",
    ],
    featured: false,
    label: "Buy Credits",
  },
  {
    id: "starter",
    name: "Starter Plan",
    price: "$15",
    cadence: "/ month",
    creditLabel: "300 Credits",
    points: [
      "3 x Full Short Movies (45s each)",
      "30 x 5s video clips",
      "Character reference sheets",
      "Priority rendering",
    ],
    featured: true,
    label: "Start Now",
  },
  {
    id: "pro",
    name: "Pro Plan",
    price: "$40",
    cadence: "/ month",
    creditLabel: "1,000 Credits",
    points: [
      "10 x Full Short Movies",
      "100 x 5s video clips",
      "2x priority rendering queue",
      "Unlimited character reference sheets",
    ],
    featured: false,
    label: "Start Now",
  },
] as const;

const buttonClass =
  "mt-8 flex h-12 w-full items-center justify-center rounded-full text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:cursor-wait disabled:opacity-60";

export function LandingPricing() {
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => {
          return (
            <article
              key={plan.id}
              className={
                plan.featured
                  ? "flex flex-col rounded-3xl border border-white bg-black p-6 text-white sm:p-8"
                  : "flex flex-col rounded-3xl border border-white/10 bg-[#161616] p-6 text-white sm:p-8"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-medium tracking-tight">{plan.name}</h3>
                {plan.featured ? (
                  <span className="rounded-full border border-white/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">
                    Popular
                  </span>
                ) : null}
              </div>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-medium tracking-tight">{plan.price}</span>
                <span className="text-sm text-white/55">{plan.cadence}</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-white/80">
                <li>{plan.creditLabel}</li>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <AuthGateButton
                label={plan.label}
                plan={plan.id}
                className={
                  plan.featured
                    ? `${buttonClass} bg-white text-black`
                    : `${buttonClass} border border-white/20 bg-transparent text-white`
                }
              />
            </article>
          );
        })}
      </div>

      <h3 className="mt-16 text-2xl font-medium tracking-tight">Business Plans</h3>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[
          {
            title: "Contact Us",
            body: "Shared seats for a small team shipping a weekly slate of faceless shorts.",
          },
          {
            title: "Contact Us",
            body: "Volume rendering, custom presets, and a direct line for studio production.",
          },
        ].map((panel, index) => (
          <article
            key={index}
            className="flex flex-col justify-between gap-8 rounded-3xl border border-white/10 bg-[#161616] p-6 sm:flex-row sm:items-end sm:p-8"
          >
            <div>
              <h4 className="text-xl font-medium tracking-tight">{panel.title}</h4>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/60">{panel.body}</p>
            </div>
            <a
              href="mailto:support@codeandbuild.tech"
              className="flex h-12 shrink-0 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-medium text-white hover:bg-white/5"
            >
              Get in Touch
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
