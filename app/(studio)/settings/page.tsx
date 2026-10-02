import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Default voice and fixed output settings for Cut45.",
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Studio"
        title="Settings"
        description="Duration, frame, and the faceless format stay fixed. The default voice lasts for this visit."
      />
      <SettingsForm />
    </div>
  );
}
