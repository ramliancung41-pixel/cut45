import type { Metadata } from "next";
import { GenerateForm } from "@/components/generate-form";

export const metadata: Metadata = {
  title: "Short Movie Studio",
  description: "Plan a faceless short with the scene co-pilot, then render it as one continuous film.",
};

const DESCRIPTION =
  "Plan the story with the scene co-pilot, then render each scene from the last frame of the one before it. A 5-second clip is 45 credits. 15 seconds is 3 clips and 135 credits, 30 seconds is 6 clips and 270, and 60 seconds is 12 clips and 540.";

export default function GeneratorPage() {
  return (
    <div className="gen-stage">
      <header className="mb-5 max-w-2xl sm:mb-8">
        <div className="hidden md:block">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Studio</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
            All-in-One AI Short Movie Studio
          </h1>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:hidden">
          All-in-One AI Short Movie Studio
        </h1>
        <details className="mt-3 sm:hidden">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Info / Help</summary>
          <p className="mt-2 text-sm leading-6 text-muted">{DESCRIPTION}</p>
        </details>
        <p className="mt-4 hidden max-w-xl text-base leading-7 text-muted sm:block">{DESCRIPTION}</p>
      </header>
      <GenerateForm />
    </div>
  );
}
