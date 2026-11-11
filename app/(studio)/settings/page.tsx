import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SUPABASE_ACCESS_COOKIE } from "@/lib/auth-cookie";
import { accountDisplayName } from "@/lib/display-name";
import { listProjects } from "@/lib/projects";
import { userFromAccessToken } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile, custom domains, agency branding, and Supabase sign-in.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const jar = await cookies();
  const accessToken = jar.get(SUPABASE_ACCESS_COOKIE)?.value ?? "";
  const user = accessToken ? await userFromAccessToken(accessToken).catch(() => null) : null;
  const listed = user?.id ? await listProjects(user.id) : { projects: [], unavailable: false };
  const domains = listed.projects
    .filter((project) => project.customDomain)
    .map((project) => ({
      id: project.id,
      title: project.title,
      slug: project.slug,
      customDomain: project.customDomain,
    }));

  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Studio"
        title="Settings"
        description="Profile, domains, and agency contact details for this website studio."
      />
      <SettingsForm
        name={user ? accountDisplayName(user) : ""}
        email={user?.email ?? ""}
        domains={domains}
      />
    </div>
  );
}
