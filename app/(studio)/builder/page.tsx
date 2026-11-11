import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Builder",
  description: "Edit a landing page in the Cut45 website builder.",
};

const SECTIONS = [
  { name: "Hero", detail: "Headline, short offer, and primary button." },
  { name: "Features", detail: "Three reasons to continue." },
  { name: "Proof", detail: "A quote or a short result." },
  { name: "Close", detail: "Final call to action." },
];

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const params = await searchParams;
  const template = params.template?.trim() || "studio";

  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Builder"
        title="Website builder"
        description="Arrange the landing page, then publish it from the dashboard when the copy is ready."
      />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="gen-glass rounded-3xl p-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Template</p>
          <p className="mt-2 text-lg font-semibold capitalize">{template}</p>
          <ol className="mt-4 space-y-3">
            {SECTIONS.map((section, index) => (
              <li key={section.name} className="rounded-2xl border border-line px-3 py-3">
                <p className="text-sm font-medium">
                  {index + 1}. {section.name}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">{section.detail}</p>
              </li>
            ))}
          </ol>
          <Link href="/templates" className="mt-4 inline-block text-sm text-muted hover:text-foreground">
            Change template
          </Link>
        </aside>
        <section className="gen-glass overflow-hidden rounded-3xl">
          <div className="border-b border-line px-5 py-3 text-xs tracking-[0.18em] text-muted uppercase">Preview</div>
          <div className="space-y-8 px-6 py-10 sm:px-10">
            <div>
              <p className="text-sm text-muted capitalize">{template} landing page</p>
              <h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight">A clear offer, above the fold.</h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-muted">
                This canvas is the page your visitors will read. Swap the template, then fill each section with your own words.
              </p>
              <Link href="/dashboard" className="gen-cta mt-6 inline-flex">
                Save to dashboard
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {SECTIONS.slice(1).map((section) => (
                <div key={section.name} className="rounded-2xl border border-line px-4 py-4">
                  <p className="text-sm font-medium">{section.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{section.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
