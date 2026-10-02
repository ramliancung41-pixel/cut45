import type { Metadata } from "next";
import { GenerateForm } from "@/components/generate-form";

export const metadata: Metadata = {
  title: "Short Movie Studio",
  description: "Plan a faceless short with the scene co-pilot, then render it as one continuous film.",
};

export default function GeneratorPage() {
  return (
    <div className="gen-stage">
      <header className="mb-8 max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Studio</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
          All-in-One AI Short Movie Studio
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted">
          Plan the story with the scene co-pilot, then render each scene from the last frame of
          the one before it. A single clip is 45 credits. A three-scene short is 135, or 150
          when the first scene uses a reference image.
        </p>
      </header>
      <GenerateForm />
    </div>
  );
}
