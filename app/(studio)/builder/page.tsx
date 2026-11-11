import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WebsiteBuilder } from "@/components/website-builder";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { getProject } from "@/lib/projects";
import { userFromAccessToken } from "@/lib/supabase/server";
import { slugify, templateContent, templateTitle } from "@/lib/website-content";

export const metadata: Metadata = {
  title: "Builder",
  description: "Edit a landing page with live desktop and mobile preview.",
};

export const dynamic = "force-dynamic";

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; project?: string | string[] }>;
}) {
  const params = await searchParams;
  const templateId = first(params.template)?.trim() || "studio";
  const projectId = first(params.project)?.trim() ?? "";
  const fallback = templateContent(templateId);
  let project = null;
  if (PROJECT_ID.test(projectId)) {
    const jar = await cookies();
    const accessToken = jar.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
    const user = accessToken ? await userFromAccessToken(accessToken).catch(() => null) : null;
    if (user?.id) {
      const found = await getProject(user.id, projectId).catch(() => null);
      if (found?.ok && found.project) project = found.project;
    }
  }

  return (
    <WebsiteBuilder
      templateId={templateId}
      project={project}
      initialTitle={project?.title ?? templateTitle(templateId)}
      initialSlug={project?.slug ?? slugify(templateTitle(templateId))}
      initialContent={project?.content ?? fallback}
    />
  );
}
