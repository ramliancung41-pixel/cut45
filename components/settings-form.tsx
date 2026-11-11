"use client";

import { useState } from "react";

const GENERAL = [
  ["Studio", "Website builder"],
  ["Home", "Dashboard"],
  ["Storage", "Characters and user assets"],
] as const;

export function SettingsForm() {
  const [saved, setSaved] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <section className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.22em] text-accent uppercase">Studio</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">General</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sign-in, credits, and saved files stay on your Supabase account. New pages start from the dashboard.
        </p>
        <dl className="mt-6 overflow-hidden rounded-2xl border border-line bg-panel">
          {GENERAL.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 first:border-t-0">
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
