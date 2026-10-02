import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Default voice and fixed output settings for Cut45.",
};

export default function SettingsPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Studio"
        title="Settings"
        description="Choose the voice AI Generator opens with. Length, frame, and the faceless format stay fixed."
      />
      <SettingsForm />
    </div>
  );
}
