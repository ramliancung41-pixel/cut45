import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WebsitePreview } from "@/components/website-preview";
import { getPublishedProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

function heroSubhead(sections: Array<{ type: string; subhead?: string }>) {
  const hero = sections.find((section) => section.type === "hero");
  return hero?.subhead;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublishedProject(slug).catch(() => null);
  if (!found?.ok || !found.project) return { title: "Not published" };
  return {
    title: found.project.title,
    description: heroSubhead(found.project.content.sections) || found.project.title,
  };
}

export default async function PublishedSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublishedProject(slug).catch(() => null);
  if (!found?.ok || !found.project) notFound();

  return (
    <main>
      <WebsitePreview content={found.project.content} />
    </main>
  );
}
