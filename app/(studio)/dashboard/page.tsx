import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CreditFigure } from "@/components/credit-provider";
import { PageHeader } from "@/components/page-header";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { listProjects, type WebsiteProject } from "@/lib/projects";
import { userFromAccessToken } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage the websites and landing pages in your studio.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const jar = await cookies();
  const accessToken = jar.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken).catch(() => null) : null;
  const listed = user?.id ? await listProjects(user.id) : { projects: [] as WebsiteProject[], unavailable: false };

  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Studio"
        title="Dashboard"
        description="Your websites live here. Open a saved page, start from a template, or jump into the builder."
      />

      <dl className="gen-glass grid overflow-hidden rounded-3xl sm:grid-cols-3 sm:divide-x sm:divide-white/10">
        <div className="px-5 py-4">
          <dt className="text-sm text-muted">Credits ready</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">
            <CreditFigure />
          </dd>
        </div>
        <div className="border-t border-line px-5 py-4 sm:border-t-0">
          <dt className="text-sm text-muted">Websites</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">{listed.projects.length}</dd>
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

      {listed.unavailable ? (
        <p className="gen-glass mt-4 rounded-3xl px-5 py-4 text-sm leading-6 text-muted">
          Saved websites need the projects table. Run supabase/projects.sql in the Supabase SQL editor, then reload this page.
        </p>
      ) : listed.projects.length === 0 ? (
        <p className="gen-glass mt-4 rounded-3xl px-5 py-8 text-sm leading-6 text-muted">
          No websites yet. Start from a template and save it from the builder.
        </p>
      ) : (
        <ul className="gen-glass mt-4 divide-y divide-white/10 overflow-hidden rounded-3xl">
          {listed.projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <Link href={`/builder?project=${project.id}`} className="min-w-0 flex-1 hover:opacity-80">
                <p className="font-medium">{project.title}</p>
                <p className="mt-1 text-sm text-muted">/{project.slug}</p>
              </Link>
              {project.published ? (
                <Link href={`/p/${project.slug}`} className="shrink-0 font-mono text-xs text-ok">
                  Published
                </Link>
              ) : (
                <span className="shrink-0 font-mono text-xs text-ok">Draft</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
