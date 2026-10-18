import type { Metadata } from "next";
import { Suspense } from "react";
import { GenerateForm } from "@/components/generate-form";

export const metadata: Metadata = {
  title: "Create Video",
  description: "Enter a topic, choose a voice, and generate character dialogue with lip-sync.",
};

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <GenerateForm />
    </Suspense>
  );
}
