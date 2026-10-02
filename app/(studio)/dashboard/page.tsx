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
    <div>
      <PageHeader
        eyebrow="Studio"
        title="Dashboard"
        description="45-second vertical shorts with no on-camera host. Start a new run or check what the last previews used."
      />

      <dl className="grid overflow-hidden rounded-2xl border border-line bg-panel sm:grid-cols-3 sm:divide-x sm:divide-line">
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
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
        >
          AI Generator
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
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
