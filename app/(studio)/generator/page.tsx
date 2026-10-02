import type { Metadata } from "next";
import { GenerateForm } from "@/components/generate-form";

export const metadata: Metadata = {
  title: "AI Generator",
  description: "Generate a 45-second faceless short from a topic, voice, and visual engine.",
};

export default function GeneratorPage() {
  return (
    <div className="gen-stage">
      <header className="mb-8 max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">AI Tools</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
          AI Generator
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted">
          Shape a 45-second faceless short, or restyle a still in Avatar Studio. Video stays
          on the server. Free stock costs 0 credits. Budget AI motion costs 45. Ultra cinematic
          costs 180. Image-to-image costs 10 credits.
        </p>
      </header>
      <GenerateForm />
    </div>
  );
}
