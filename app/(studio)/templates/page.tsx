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
    description: "Clean Agency Light. A full client site with a glass navbar, hero, feature cards, quotes, and pricing.",
    sections: ["Navbar", "Hero", "Features", "Testimonials", "Pricing", "Footer"],
  },
  {
    id: "product",
    name: "Product",
    description: "Modern Dark SaaS. A product page with a live hero image, three feature cards, and a pricing table.",
    sections: ["Navbar", "Hero", "Features", "Testimonials", "Pricing", "Footer"],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "Minimalist Tech. Selected work, client quotes, and a clear way to start a project.",
    sections: ["Navbar", "Hero", "Work", "Testimonials", "Pricing", "Footer"],
  },
  {
    id: "waitlist",
    name: "Waitlist",
    description: "Vibrant Creative. A launch page with a hero, three reasons, and an email capture.",
    sections: ["Navbar", "Hero", "Features", "Testimonials", "Pricing", "Footer"],
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
