"use client";

import { useState } from "react";
import { VOICES, isVoiceId, type VoiceId } from "@/lib/voices";
import { useDefaultVoice } from "@/components/use-default-voice";

const GENERAL = [
  ["Duration", "45 seconds"],
  ["Frame", "9:16 vertical"],
  ["On-camera host", "Off"],
] as const;

export function SettingsForm() {
  const { voice, saveVoice } = useDefaultVoice();
  const [draft, setDraft] = useState<VoiceId | null>(null);
  const [saved, setSaved] = useState(false);
  const selected = draft ?? voice;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveVoice(selected);
    setDraft(null);
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <section className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Studio</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">General</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Duration, frame, and the faceless format stay fixed. The default voice lasts for this visit.
        </p>

        <div className="mt-6">
          <label htmlFor="default-voice" className="block text-sm font-medium tracking-tight">
            Default voice style
          </label>
          <select
            id="default-voice"
            name="default-voice"
            value={selected}
            onChange={(event) => {
              if (!isVoiceId(event.target.value)) return;
              setSaved(false);
              setDraft(event.target.value);
            }}
            className="gen-field gen-select mt-3 w-full appearance-none rounded-2xl px-4 py-3 pr-10 text-sm outline-none"
          >
            {VOICES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.gender === "male" ? "Male" : "Female"}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm leading-6 text-muted">
            AI Generator opens with this voice. You can still change it on a run.
          </p>
        </div>

        <dl className="mt-6 overflow-hidden rounded-2xl border border-line bg-panel">
          {GENERAL.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 first:border-t-0"
            >
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="submit" className="gen-cta">
            Save settings
          </button>
          {saved ? (
            <p className="text-sm text-ok" role="status">
              Saved for this visit.
            </p>
          ) : null}
        </div>
      </section>
    </form>
  );
}
