"use client";

import { useEffect, useState } from "react";

type DomainSite = {
  id: string;
  title: string;
  slug: string;
  customDomain: string;
};

const BRAND_KEY = "cut45-agency-brand";

export function SettingsForm({
  name,
  email,
  domains,
}: {
  name: string;
  email: string;
  domains: DomainSite[];
}) {
  const [studioName, setStudioName] = useState("");
  const [contactEmail, setContactEmail] = useState(email);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(BRAND_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { studioName?: unknown; contactEmail?: unknown };
      if (typeof parsed.studioName === "string") setStudioName(parsed.studioName);
      if (typeof parsed.contactEmail === "string" && parsed.contactEmail.trim()) setContactEmail(parsed.contactEmail);
    } catch {
      window.localStorage.removeItem(BRAND_KEY);
    }
  }, []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(
      BRAND_KEY,
      JSON.stringify({ studioName: studioName.trim(), contactEmail: contactEmail.trim() }),
    );
    setSaved(true);
  }

  return (
    <div className="max-w-xl space-y-6">
      <section className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.22em] text-accent uppercase">Account</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">User profile</h2>
        <dl className="mt-4 overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted">Name</dt>
            <dd className="text-sm font-medium">{name || "Not signed in"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
            <dt className="text-sm text-muted">Email</dt>
            <dd className="truncate text-sm font-medium">{email || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.22em] text-accent uppercase">Publishing</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Custom domains</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Domains are saved on each website in the builder. Point the domain at this host, then open the public page on that domain.
        </p>
        {domains.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No custom domains yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-line">
            {domains.map((site) => (
              <li key={site.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{site.customDomain}</p>
                  <p className="mt-1 truncate text-xs text-muted">{site.title}</p>
                </div>
                <a href={`/builder?project=${site.id}`} className="shrink-0 text-xs text-muted hover:text-foreground">
                  Edit
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={onSubmit} className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.22em] text-accent uppercase">Agency</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Branding and contact</h2>
        <p className="mt-2 text-sm leading-6 text-muted">These details stay in this browser for the agency dashboard.</p>
        <label className="mt-5 block text-sm text-muted">
          Studio name
          <input
            value={studioName}
            onChange={(event) => {
              setStudioName(event.target.value);
              setSaved(false);
            }}
            className="gen-field mt-1 w-full"
          />
        </label>
        <label className="mt-4 block text-sm text-muted">
          Contact email
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => {
              setContactEmail(event.target.value);
              setSaved(false);
            }}
            className="gen-field mt-1 w-full"
          />
        </label>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="submit" className="gen-cta">
            Save branding
          </button>
          {saved ? (
            <p className="text-sm text-ok" role="status">
              Saved on this browser.
            </p>
          ) : null}
        </div>
      </form>

      <section className="gen-glass rounded-3xl p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.22em] text-accent uppercase">Sign-in</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Supabase auth</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {email
            ? `${email} is signed in through Supabase. Websites and assets stay on this account.`
            : "Sign in with Supabase to save websites, domains, and assets to this account."}
        </p>
      </section>
    </div>
  );
}
