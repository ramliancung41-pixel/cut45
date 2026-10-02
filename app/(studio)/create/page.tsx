import type { Metadata } from "next";
import { GenerateForm } from "@/components/generate-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Create Video",
  description: "Enter a topic, choose a voice, and generate a 45-second faceless short.",
};

export default function CreatePage() {
  return (
    <div className="gen-stage">
      <PageHeader
        eyebrow="Workspace"
        title="Create Video"
        description="Enter a topic, a voice style, and a visual engine. Free stock costs 0 credits. Budget AI motion costs 45 credits. Ultra cinematic costs 180 credits."
      />
      <GenerateForm />
    </div>
  );
}
