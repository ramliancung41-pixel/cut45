import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Templates",
  description: "Pre-built website designs for the Cut45 studio.",
};

const TEMPLATES = [
  {
    id: "studio",
    name: "Studio",
    description: "A calm landing page with a hero, three features, and a contact section.",
    sections: ["Hero", "Features", "Contact"],
  },
  {
    id: "product",
    name: "Product",
    description: "A product page with a price block, benefits, and a closing call to action.",
    sections: ["Hero", "Pricing", "FAQ"],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "A personal site with an introduction, selected work, and a short bio.",
    sections: ["Intro", "Work", "About"],
  },
  {
    id: "waitlist",
    name: "Waitlist",
    description: "A single-screen launch page with a headline and an email capture.",
    sections: ["Headline", "Signup"],
  },
];

export default function TemplatesPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Library"
        title="Templates"
        description="Start from a finished layout. Each template opens in the builder so you can change the copy and sections."
      />
      <ul className="grid gap-4 md:grid-cols-2">
        {TEMPLATES.map((template) => (
          <li key={template.id} className="gen-glass flex flex-col rounded-3xl p-5">
            <h2 className="text-lg font-semibold tracking-tight">{template.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{template.description}</p>
            <p className="mt-4 text-xs tracking-wide text-muted uppercase">{template.sections.join(" · ")}</p>
            <Link href={`/builder?template=${template.id}`} className="gen-cta mt-5 self-start">
              Use template
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
