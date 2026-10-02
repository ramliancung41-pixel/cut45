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
          Shape a 45-second faceless short. Pick a voice and a visual engine, then watch the
          timeline build the 9:16 preview. Script and voice requests stay on the server. Free
          stock costs 0 credits. Premium AI motion costs 90 credits.
        </p>
      </header>
      <GenerateForm />
    </div>
  );
}
