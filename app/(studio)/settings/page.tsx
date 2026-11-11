import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Account and studio preferences.",
};

export default function SettingsPage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Studio"
        title="Settings"
        description="Sign-in and saved files stay with your account. New websites start from the dashboard."
      />
      <SettingsForm />
    </div>
  );
}
