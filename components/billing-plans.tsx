"use client";

import { UpgradeNowButton } from "@/components/upgrade-now-button";
import { BILLING_PLANS } from "@/lib/billing";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function BillingPlans() {
  return (
    <section aria-labelledby="plans-heading" className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <h2 id="plans-heading" className="text-lg font-semibold tracking-tight">
          Plans
        </h2>
        <p className="text-sm text-muted">Upgrade Now opens a secure checkout.</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {BILLING_PLANS.map((plan) => {
          return (
            <article
              key={plan.id}
              className={cn(
                "gen-glass flex flex-col rounded-3xl p-5",
                plan.featured && "gen-pick-on",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold tracking-tight">{plan.name}</h3>
                {plan.featured ? (
                  <span className="rounded-full bg-gradient-to-r from-cyan-300 to-orange-400 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#071018]">
                    Pro
                  </span>
                ) : null}
              </div>

              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                <span className="text-sm text-muted">{plan.cadence}</span>
              </p>

              <p className="mt-4 text-sm font-medium">{plan.credits}</p>
              <p className="mt-1 text-sm text-muted">{plan.volume}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{plan.summary}</p>

              <UpgradeNowButton
                plan={plan.id}
                paymentLink={plan.stripePaymentLink}
                className="gen-cta relative z-10 mt-6 inline-flex w-full cursor-pointer items-center justify-center disabled:cursor-not-allowed"
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
