"use client";

import { useState } from "react";
import { AuthGateButton } from "@/components/auth-gate-button";

type Cycle = "monthly" | "yearly";

const PLANS = [
  {
    id: "starter",
    name: "Starter Plan",
    monthly: 15,
    credits: 300,
    creditLabel: "300 Credits",
    points: ["Free stock assets access", "Basic text rendering tools"],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro Plan",
    monthly: 40,
    credits: 1000,
    creditLabel: "1,000 Credits",
    points: ["2x generation priority queues", "Premium AI character modules"],
    featured: true,
  },
  {
    id: "ultra",
    name: "Ultra Plan",
    monthly: 120,
    credits: 3500,
    creditLabel: "3,500 Credits",
    points: ["5x usage speed configurations", "Full access to custom cinematic rendering presets"],
    featured: false,
  },
] as const;

function yearlyPrice(monthly: number) {
  return Math.round(monthly * 0.8);
}

const buttonClass =
  "mt-8 flex h-12 w-full items-center justify-center rounded-full text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:cursor-wait disabled:opacity-60";

export function LandingPricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const yearly = cycle === "yearly";

  return (
    <div>
      <div className="flex justify-center">
        <div
          className="inline-flex rounded-full border border-white/10 bg-[#141414] p-1"
          role="group"
          aria-label="Billing period"
        >
          {(["monthly", "yearly"] as const).map((option) => {
            const active = cycle === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setCycle(option)}
                className={
                  active
                    ? "rounded-full bg-white px-5 py-2 text-sm font-medium text-black"
                    : "rounded-full px-5 py-2 text-sm font-medium text-white/60"
                }
              >
                {option === "monthly" ? "Monthly" : "Yearly"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const amount = yearly ? yearlyPrice(plan.monthly) : plan.monthly;
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
                    Featured
                  </span>
                ) : null}
              </div>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-medium tracking-tight">${amount}</span>
                <span className="text-sm text-white/55">/mo</span>
              </p>
              <p className="mt-2 min-h-5 text-sm text-white/50">
                {yearly
                  ? `20% off · $${yearlyPrice(plan.monthly) * 12} billed yearly`
                  : `$${plan.monthly} billed monthly`}
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-white/80">
                <li>{plan.creditLabel}</li>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <AuthGateButton
                label="Start Now"
                plan={plan.id}
                credits={plan.credits}
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
            <AuthGateButton
              label="Get in Touch"
              signedInHref="/generator"
              className="flex h-12 shrink-0 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-medium text-white enabled:hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
            />
          </article>
        ))}
      </div>
    </div>
  );
}
