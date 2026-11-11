import type { Metadata } from "next";
import Link from "next/link";
import { CreditFigure } from "@/components/credit-provider";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage the websites and landing pages in your studio.",
};

const PROJECTS = [
  { title: "Northwind Studio", template: "Studio", status: "Draft", href: "/builder?template=studio" },
  { title: "Harbor Goods", template: "Product", status: "Published", href: "/builder?template=product" },
  { title: "Lumen Notes", template: "Portfolio", status: "Draft", href: "/builder?template=portfolio" },
];

export default function DashboardPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Studio"
        title="Dashboard"
        description="Your websites live here. Open a project, start from a template, or jump into the builder."
      />

      <dl className="gen-glass grid overflow-hidden rounded-3xl sm:grid-cols-3 sm:divide-x sm:divide-white/10">
        <div className="px-5 py-4">
          <dt className="text-sm text-muted">Credits ready</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">
            <CreditFigure />
          </dd>
        </div>
        <div className="border-t border-line px-5 py-4 sm:border-t-0">
          <dt className="text-sm text-muted">Projects</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">{PROJECTS.length}</dd>
        </div>
        <div className="border-t border-line px-5 py-4 sm:border-t-0">
          <dt className="text-sm text-muted">Library</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">
            <Link href="/characters" className="hover:underline">
              Assets
            </Link>
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Websites</h2>
        <div className="flex gap-2">
          <Link href="/templates" className="gen-ghost">
            Templates
          </Link>
          <Link href="/builder" className="gen-cta">
            New website
          </Link>
        </div>
      </div>

      <ul className="gen-glass mt-4 divide-y divide-white/10 overflow-hidden rounded-3xl">
        {PROJECTS.map((project) => (
          <li key={project.title}>
            <Link href={project.href} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.03]">
              <div>
                <p className="font-medium">{project.title}</p>
                <p className="mt-1 text-sm text-muted">{project.template} template</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-ok">{project.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
