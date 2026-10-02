"use client";

import { useState } from "react";
import { VOICES, isVoiceId, type VoiceId } from "@/lib/voices";
import { useDefaultVoice } from "@/components/use-default-voice";

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
    <form onSubmit={onSubmit} className="max-w-xl space-y-8">
      <div>
        <label htmlFor="default-voice" className="block text-sm font-medium">
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
          className="mt-2 w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none focus-visible:border-accent"
        >
          {VOICES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm leading-6 text-muted">
          Create Video opens with this voice. You can still change it per run.
        </p>
      </div>

      <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted">Duration</dt>
          <dd className="text-sm">45 seconds</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted">Frame</dt>
          <dd className="text-sm">9:16 vertical</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted">On-camera host</dt>
          <dd className="text-sm">Off</dd>
        </div>
      </dl>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90"
        >
          Save settings
        </button>
        {saved ? (
          <p className="text-sm text-ok" role="status">
            Saved for this visit.
          </p>
        ) : null}
      </div>
    </form>
  );
}
