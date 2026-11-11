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
    id: "studio",
    title: "Studio landing page",
    tag: "Page",
    description: "Turns one offer into a hero, three features, and a contact close.",
    steps: ["Offer", "Hero", "Features", "Contact"],
    placeholder: "A design studio that ships brand sites",
    accent: "from-violet-500/30 to-fuchsia-500/10",
    build: (topic) =>
      `Build a studio landing page about: ${topic}.\nSection 1: a short hero headline and subhead.\nSection 2: three features.\nSection 3: a contact close.`,
  },
  {
    id: "product",
    title: "Product page",
    tag: "Product",
    description: "Lays out a product story with benefits, a price block, and a call to action.",
    steps: ["Audience", "Benefits", "Price", "Call to action"],
    placeholder: "A matte black reusable water bottle",
    accent: "from-sky-500/30 to-cyan-500/10",
    build: (topic) =>
      `Build a product page for: ${topic}.\nSection 1: who it is for.\nSection 2: three benefits.\nSection 3: a simple price block.\nSection 4: a closing call to action.`,
  },
  {
    id: "portfolio",
    title: "Portfolio",
    tag: "Personal",
    description: "Builds an introduction, selected work, and a short bio.",
    steps: ["Intro", "Selected work", "Bio"],
    placeholder: "A photographer who shoots coastal towns",
    accent: "from-pink-500/30 to-orange-500/10",
    build: (topic) =>
      `Build a portfolio page for: ${topic}.\nSection 1: a one-sentence introduction.\nSection 2: three pieces of selected work.\nSection 3: a short bio.`,
  },
  {
    id: "waitlist",
    title: "Waitlist",
    tag: "Launch",
    description: "Creates a single-screen launch page with a headline and an email capture.",
    steps: ["Headline", "Proof", "Email capture"],
    placeholder: "A weekly letter about small restaurants",
    accent: "from-emerald-500/30 to-lime-500/10",
    build: (topic) =>
      `Build a waitlist page for: ${topic}.\nSection 1: a launch headline.\nSection 2: one line of proof.\nSection 3: an email capture.`,
  },
];

export function WorkflowsBoard() {
  const router = useRouter();
  const [topics, setTopics] = useState<Record<string, string>>({});

  function run(workflow: Workflow) {
    const topic = (topics[workflow.id] ?? "").trim() || workflow.placeholder;
    const sessionId = newAgentSessionId();
    stashAgentDraft({ sessionId, message: workflow.build(topic) });
    router.push(`/builder?template=${workflow.id}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Workflows"
        title="Automated creation templates"
        description="Pick a page type, add your topic, and open it in the builder."
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
                Open in builder
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
