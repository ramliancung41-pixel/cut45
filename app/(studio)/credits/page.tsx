import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingPlans } from "@/components/billing-plans";
import { CreditFigure } from "@/components/credit-provider";
import { PageHeader } from "@/components/page-header";
import { ResumeCheckout } from "@/components/resume-checkout";

export const metadata: Metadata = {
  title: "Credits & Billing",
  description: "Credit balance and plans for 45-second faceless shorts.",
};

const LEDGER = [
  { when: "Today", item: "Why night markets stay cheap", change: "−8", balance: "48" },
  { when: "Yesterday", item: "How to read a train map", change: "−8", balance: "56" },
  { when: "Monday", item: "Monthly grant", change: "+40", balance: "64" },
];

export default function CreditsPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Account"
        title="Credits & Billing"
        description="Free stock costs 0 credits. Premium AI motion costs 90 credits per short. Starter adds 300 credits, Pro adds 1,000, and the top-up adds 150."
      />

      <div className="gen-glass rounded-3xl px-5 py-6">
        <p className="text-sm text-muted">Available</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">
          <CreditFigure />
        </p>
        <p className="mt-2 text-sm text-muted">
          This is the live balance. Stock footage stays at 0 credits. Premium generation spends 90.
        </p>
      </div>

      <Suspense fallback={null}>
        <ResumeCheckout />
      </Suspense>
      <BillingPlans />

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Ledger</h2>
      <div className="gen-glass mt-4 overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="sr-only">Recent credit changes</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                When
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Item
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Change
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Balance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {LEDGER.map((row) => (
              <tr key={row.item}>
                <td className="px-4 py-3">{row.when}</td>
                <td className="px-4 py-3">{row.item}</td>
                <td className="px-4 py-3 font-mono">{row.change}</td>
                <td className="px-4 py-3 font-mono">{row.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
