import type { Metadata } from "next";
import { Suspense } from "react";
import { GenerateForm } from "@/components/generate-form";

export const metadata: Metadata = {
  title: "Create",
  description: "Generate videos and images with Cut45: character dialogue, voices, and style presets.",
};

export default function GeneratorPage() {
  return (
    <Suspense fallback={null}>
      <GenerateForm />
    </Suspense>
  );
}
