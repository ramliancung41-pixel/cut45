"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StudioPageHeader } from "@/components/studio-page";
import { stashAgentDraft } from "@/lib/agent-handoff";
import { newAgentSessionId } from "@/lib/agent-sessions";

type Workflow = {
  id: string;
  title: string;
  tag: string;
  description: string;
  steps: string[];
  placeholder: string;
  accent: string;
  build: (topic: string) => string;
};

const WORKFLOWS: Workflow[] = [
  {
    id: "short-film",
    title: "Short Film Pipeline",
    tag: "Video",
    description: "Turns one idea into a four-scene short with a consistent hero and an opening clip ready to render.",
    steps: ["Story outline", "Character sheet", "Scene prompts", "Opening clip"],
    placeholder: "A lighthouse keeper who finds a message in a bottle",
    accent: "from-violet-500/30 to-fuchsia-500/10",
    build: (topic) =>
      `Run the Short Film Pipeline for: ${topic}.\nStep 1: write a three-act outline split into 4 scenes.\nStep 2: describe the main character's look for a consistent reference sheet.\nStep 3: give each scene a cinematic visual prompt.\nStep 4: suggest the opening 5-second video clip to generate now.`,
  },
  {
    id: "avatar-dialogue",
    title: "AI Avatar Dialogue",
    tag: "Dialogue",
    description: "Designs two talking characters, writes their back-and-forth, and lines up a lip-synced clip.",
    steps: ["Avatar designs", "Dialogue script", "Portrait still", "Talking clip"],
    placeholder: "Two founders debating remote vs. office work",
    accent: "from-sky-500/30 to-cyan-500/10",
    build: (topic) =>
      `Run the AI Avatar Dialogue workflow about: ${topic}.\nStep 1: design two distinct characters with names, looks, and personalities.\nStep 2: write a punchy 6-line dialogue between them.\nStep 3: give a portrait prompt for the first character.\nStep 4: suggest a 9:16 5-second talking video clip of them to generate now.`,
  },
  {
    id: "tiktok-storyboard",
    title: "TikTok Viral Storyboard",
    tag: "Social",
    description: "Builds a scroll-stopping vertical storyboard: hook, three beats, and a call to action.",
    steps: ["Hook", "3 story beats", "Call to action", "9:16 clip"],
    placeholder: "Morning routine of a busy barista",
    accent: "from-pink-500/30 to-orange-500/10",
    build: (topic) =>
      `Run the TikTok Viral Storyboard workflow for: ${topic}.\nStep 1: write a 2-second hook line.\nStep 2: outline three fast story beats.\nStep 3: end with a clear call to action.\nStep 4: suggest the 9:16 5-second hook clip to generate now.`,
  },
  {
    id: "product-ad",
    title: "Product Ad Spot",
    tag: "Brand",
    description: "Creates a polished product hero shot and a short ad clip using your Brand Kit colors and style.",
    steps: ["Selling points", "Hero image", "Ad script", "Product clip"],
    placeholder: "A matte black reusable water bottle",
    accent: "from-emerald-500/30 to-lime-500/10",
    build: (topic) =>
      `Run the Product Ad Spot workflow for: ${topic}.\nStep 1: list three selling points.\nStep 2: suggest a studio hero image prompt for the product.\nStep 3: write a 10-second voiceover ad script.\nStep 4: suggest the 16:9 product video clip to generate now.`,
  },
];

export function WorkflowsBoard() {
  const router = useRouter();
  const [topics, setTopics] = useState<Record<string, string>>({});

  function run(workflow: Workflow) {
    const topic = (topics[workflow.id] ?? "").trim() || workflow.placeholder;
    const sessionId = newAgentSessionId();
    stashAgentDraft({ sessionId, message: workflow.build(topic) });
    router.push(`/agent?chat=${sessionId}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Workflows"
        title="Automated creation templates"
        description="Pick a pipeline, add your topic, and the Co-Pilot runs the whole prompt chain in the Agent workspace, ending with a ready-to-render card."
      />
      <ul className="grid gap-4 md:grid-cols-2">
        {WORKFLOWS.map((workflow) => (
          <li
            key={workflow.id}
            className="agent-glass group relative flex flex-col overflow-hidden rounded-2xl p-5 transition hover:border-white/20 hover:shadow-[0_14px_40px_rgba(124,58,237,0.18)]"
          >
            <span
              aria-hidden
              className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${workflow.accent} blur-2xl`}
            />
            <div className="relative flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight text-white">{workflow.title}</h2>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                {workflow.tag}
              </span>
            </div>
            <p className="relative mt-1.5 text-sm leading-6 text-zinc-400">{workflow.description}</p>
            <ol className="relative mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-300">
              {workflow.steps.map((step, index) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[10px] font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  {step}
                  {index < workflow.steps.length - 1 ? <span className="text-zinc-600">→</span> : null}
                </li>
              ))}
            </ol>
            <form
              className="relative mt-5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                run(workflow);
              }}
            >
              <label htmlFor={`topic-${workflow.id}`} className="sr-only">
                Topic for {workflow.title}
              </label>
              <input
                id={`topic-${workflow.id}`}
                value={topics[workflow.id] ?? ""}
                onChange={(event) => setTopics((current) => ({ ...current, [workflow.id]: event.target.value }))}
                placeholder={workflow.placeholder}
                maxLength={240}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/25"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
              >
                Run in Agent
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
