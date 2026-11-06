"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { PROMPT_IMPROVE_CREDITS, PROMPT_IMPROVE_FREE_PER_DAY, formatCredits } from "@/lib/pricing.config";
import { improvePrompt } from "@/lib/story-placeholders";

const CHIP_GROUPS = [
  { id: "shot", label: "Shot", options: ["close-up", "wide", "drone", "POV"] },
  { id: "camera", label: "Camera", options: ["static", "slow zoom", "pan", "dolly", "handheld"] },
  { id: "lighting", label: "Lighting", options: ["golden hour", "neon night", "soft studio", "overcast"] },
  { id: "style", label: "Style", options: ["cinematic", "vlog", "anime", "product ad"] },
  { id: "mood", label: "Mood", options: ["uplifting", "calm", "tense", "dreamy", "playful"] },
] as const;

type GroupId = (typeof CHIP_GROUPS)[number]["id"];

const TEMPLATES = [
  {
    name: "Product showcase",
    text: "A sleek product rotates slowly on a pedestal, crisp reflections, the logo comes into focus, clean background",
  },
  {
    name: "Travel vlog",
    text: "A traveler walks through a bustling old-town street at sunrise, local food stalls, warm light, sense of discovery",
  },
  {
    name: "Talking-head B-roll",
    text: "Supporting B-roll for a talking-head video: hands typing, a coffee being poured, notes on a desk, shallow depth of field",
  },
];

const SAVED_KEY = "cut45.prompt.saved";
const IMPROVE_KEY = "cut45.prompt.improve";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_KEY || event.key === IMPROVE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: keep working without persistence.
  }
  listeners.forEach((listener) => listener());
}

function useStored(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
}

function parseSaved(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseImproveUses(raw: string | null) {
  try {
    const value = JSON.parse(raw ?? "null") as { day?: string; used?: number } | null;
    return value?.day === today() && typeof value.used === "number" ? value.used : 0;
  } catch {
    return 0;
  }
}

export function PromptEditor({
  targetLabel,
  text,
  onApply,
  onClose,
}: {
  targetLabel: string;
  text: string;
  onApply: (prompt: string) => void;
  onClose?: () => void;
}) {
  const [picked, setPicked] = useState<Partial<Record<GroupId, string>>>({});
  const [edited, setEdited] = useState<string | null>(null);
  const [seenTarget, setSeenTarget] = useState(targetLabel);
  const [improving, setImproving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const savedRaw = useStored(SAVED_KEY);
  const saved = useMemo(() => parseSaved(savedRaw), [savedRaw]);
  const improveUses = parseImproveUses(useStored(IMPROVE_KEY));
  const freeLeft = Math.max(0, PROMPT_IMPROVE_FREE_PER_DAY - improveUses);

  if (seenTarget !== targetLabel) {
    setSeenTarget(targetLabel);
    setEdited(null);
    setNotice(null);
  }

  const composed = [text.trim(), ...CHIP_GROUPS.map((group) => picked[group.id])].filter(Boolean).join(", ");
  const finalPrompt = edited ?? composed;

  function toggle(group: GroupId, option: string) {
    setPicked((current) => ({ ...current, [group]: current[group] === option ? undefined : option }));
  }

  async function improve() {
    if (!finalPrompt.trim() || improving) return;
    setImproving(true);
    setNotice(null);
    try {
      const better = await improvePrompt(finalPrompt);
      if (better) setEdited(better);
      writeJson(IMPROVE_KEY, { day: today(), used: improveUses + 1 });
      setNotice(freeLeft > 0 ? "Improved. Review it, then use it." : `Improved for ${formatCredits(PROMPT_IMPROVE_CREDITS)}.`);
    } finally {
      setImproving(false);
    }
  }

  function save() {
    const value = finalPrompt.trim();
    if (!value) return;
    writeJson(SAVED_KEY, [value, ...saved.filter((item) => item !== value)].slice(0, 20));
    setNotice("Prompt saved.");
  }

  function remove(value: string) {
    writeJson(
      SAVED_KEY,
      saved.filter((item) => item !== value),
    );
  }

  function apply(value: string) {
    onApply(value);
    setEdited(null);
    setPicked({});
    setNotice(`Applied to ${targetLabel}.`);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Prompt editor</h2>
          <p className="mt-0.5 text-xs text-(--l-muted)">
            Editing: <span className="text-(--l-text)">{targetLabel}</span>
          </p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="lumen-btn min-[700px]:hidden" aria-label="Close prompt editor">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        ) : null}
      </header>

      {CHIP_GROUPS.map((group) => (
        <fieldset key={group.id}>
          <legend className="mb-2 text-xs font-medium tracking-wide text-(--l-muted) uppercase">{group.label}</legend>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={picked[group.id] === option}
                onClick={() => toggle(group.id, option)}
                className="lumen-chip"
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor="final-prompt" className="text-xs font-medium tracking-wide text-(--l-muted) uppercase">
            Final prompt
          </label>
          {edited !== null ? (
            <button
              type="button"
              onClick={() => setEdited(null)}
              className="min-h-11 rounded-lg px-2 text-xs text-(--l-muted) underline-offset-4 hover:text-(--l-text) hover:underline"
            >
              Reset to chips
            </button>
          ) : null}
        </div>
        <textarea
          id="final-prompt"
          rows={4}
          value={finalPrompt}
          onChange={(event) => setEdited(event.target.value)}
          placeholder="Type an idea or pick chips to build a prompt."
          className="lumen-input resize-y"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => apply(finalPrompt.trim())}
            disabled={!finalPrompt.trim()}
            className="lumen-btn-primary sm:col-span-2"
          >
            Use for {targetLabel}
          </button>
          <button type="button" onClick={() => void improve()} disabled={!finalPrompt.trim() || improving} className="lumen-btn">
            <SparkGlyph />
            {improving ? "Improving…" : "Improve my prompt"}
          </button>
          <button type="button" onClick={save} disabled={!finalPrompt.trim()} className="lumen-btn">
            <BookmarkGlyph />
            Save prompt
          </button>
        </div>
        <p className="mt-2 text-xs text-(--l-muted)">
          {freeLeft > 0
            ? `${freeLeft} of ${PROMPT_IMPROVE_FREE_PER_DAY} free improvements left today`
            : `Free improvements used today · ${formatCredits(PROMPT_IMPROVE_CREDITS)} each`}
        </p>
        {notice ? (
          <p role="status" className="mt-1 text-xs text-(--l-accent)">
            {notice}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="saved-prompts">
        <h3 id="saved-prompts" className="mb-2 text-sm font-semibold">
          Saved prompts
        </h3>
        {saved.length === 0 ? (
          <p className="text-xs text-(--l-muted)">Nothing saved yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saved.map((item) => (
              <li key={item} className="flex items-start gap-2 rounded-xl border border-(--l-border) bg-(--l-bg) p-2">
                <button
                  type="button"
                  onClick={() => apply(item)}
                  className="min-h-11 min-w-0 flex-1 rounded-lg px-1.5 text-left text-xs leading-5 text-(--l-text) hover:text-(--l-accent)"
                  title={`Use for ${targetLabel}`}
                >
                  <span className="line-clamp-2">{item}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  aria-label="Delete saved prompt"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-(--l-muted) hover:bg-(--l-raised) hover:text-(--l-text)"
                >
                  <TrashGlyph />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="prompt-templates">
        <h3 id="prompt-templates" className="mb-2 text-sm font-semibold">
          Starter templates
        </h3>
        <ul className="flex flex-col gap-2">
          {TEMPLATES.map((template) => (
            <li key={template.name}>
              <button
                type="button"
                onClick={() => apply(template.text)}
                className="w-full rounded-xl border border-(--l-border) bg-(--l-bg) p-3 text-left transition hover:border-(--l-input) hover:bg-(--l-raised)"
              >
                <span className="block text-sm font-medium text-(--l-text)">{template.name}</span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-(--l-muted)">{template.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M10 3c.4 3 1.9 4.6 5 5-3.1.4-4.6 2-5 5-.4-3-1.9-4.6-5-5 3.1-.4 4.6-2 5-5Z" />
    </svg>
  );
}

function BookmarkGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M5.5 3.5h9v13l-4.5-3-4.5 3Z" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />
    </svg>
  );
}
