import type { Metadata } from "next";
import { GenerateForm } from "@/components/generate-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "AI Generator",
  description: "Generate a 45-second faceless short from a topic, voice, and visual engine.",
};

export default function GeneratorPage() {
  return (
    <div>
      <PageHeader
        eyebrow="AI Tools"
        title="AI Generator"
        description="Enter a topic, a voice style, and a visual engine. Script and voice requests stay on the server. Free stock costs 0 credits. Premium AI motion costs 90 credits."
      />
      <GenerateForm />
    </div>
  );
}
