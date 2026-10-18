import type { Metadata } from "next";
import Link from "next/link";
import { CreditFigure } from "@/components/credit-provider";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Studio board for 45-second faceless shorts.",
};

const JOBS = [
  {
    title: "Why night markets stay cheap",
    voice: "Calm Documentary",
    status: "Preview ready",
  },
  {
    title: "How to read a train map",
    voice: "Friendly Explainer",
    status: "Preview ready",
  },
  {
    title: "The two-minute coffee rule",
    voice: "Warm Narrator",
    status: "Draft",
  },
];

export default function DashboardPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Studio"
        title="Dashboard"
        description="45-second vertical shorts with no on-camera host. Start a new run or check what the last previews used."
      />

      <dl className="gen-glass grid overflow-hidden rounded-3xl sm:grid-cols-3 sm:divide-x sm:divide-white/10">
        <div className="px-5 py-4">
          <dt className="text-sm text-muted">Credits ready</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">
            <CreditFigure />
          </dd>
        </div>
        <div className="border-t border-line px-5 py-4 sm:border-t-0">
          <dt className="text-sm text-muted">Length</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">45s</dd>
        </div>
        <div className="border-t border-line px-5 py-4 sm:border-t-0">
          <dt className="text-sm text-muted">Picture</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">9:16</dd>
        </div>
      </dl>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent previews</h2>
        <Link
          href="/generator"
          className="gen-cta"
        >
          AI Generator
        </Link>
      </div>

      <ul className="gen-glass mt-4 divide-y divide-white/10 overflow-hidden rounded-3xl">
        {JOBS.map((job) => (
          <li
            key={job.title}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <div>
              <p className="font-medium">{job.title}</p>
              <p className="mt-1 text-sm text-muted">{job.voice} · 45s · faceless</p>
            </div>
            <span className="shrink-0 font-mono text-xs text-ok">{job.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
