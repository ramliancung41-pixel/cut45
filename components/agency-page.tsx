"use client";

import { useState } from "react";
import { AGENCY_PACKAGES, type AgencyPackageId } from "@/lib/agency";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const CAPABILITIES = [
  { title: "Custom Next.js Web Apps", body: "A dynamic Next.js site shaped around the product, not a fixed template." },
  { title: "Tailored Designs", body: "Layouts, type, and color chosen for the client instead of a generic theme." },
  { title: "Fast Turnaround", body: "A landing page can move from brief to preview without a long production cycle." },
  { title: "SEO Optimization", body: "Page titles, descriptions, and structure set up so the site can be found." },
] as const;

const inputClass =
  "mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white";

export function AgencyPage() {
  const [packageId, setPackageId] = useState<AgencyPackageId>("business");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const response = await fetch("/api/agency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, packageId, message, company }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; success?: boolean; message?: string } | null;
    setPending(false);
    if (!response.ok || !body?.success) {
      setError(body?.error ?? "The request could not be saved.");
      return;
    }
    setSavedMessage(body.message || "Request received!");
    setName("");
    setEmail("");
    setMessage("");
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <SiteHeader active="agency" />
      <main className="mx-auto w-full max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
        <p className="text-xs tracking-[0.18em] text-white/50 uppercase">Agency</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight text-balance sm:text-5xl">
          The studio builds the site with you.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
          Send a request and the agency follows up by email. Custom domains and publishing stay in your dashboard after the page is ready.
        </p>

        <section className="mt-10" aria-labelledby="capabilities-heading">
          <h2 id="capabilities-heading" className="text-2xl font-medium">
            Agency capabilities
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {CAPABILITIES.map((item) => (
              <li key={item.title} className="rounded-3xl border border-white/15 bg-white/[0.03] p-5">
                <h3 className="text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14 grid gap-8 lg:grid-cols-[1fr_minmax(0,28rem)]" aria-labelledby="request-heading">
          <div>
            <h2 id="request-heading" className="text-2xl font-medium">
              Request Website / Contact Agency
            </h2>
            <h3 className="mt-6 text-lg font-medium">What to include</h3>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Your name, a reply email, the package you want, and a short note about the site.
            </p>
            <h3 className="mt-6 text-lg font-medium">How requests are handled</h3>
            <p className="mt-2 text-sm leading-6 text-white/60">
              The request is saved for the studio. If email delivery is configured, the agency is notified. Otherwise the team replies from the saved address.
            </p>
            <p className="mt-6 text-sm text-white/50">
              Or email{" "}
              <a href="mailto:support@codeandbuild.tech" className="text-white underline decoration-white/30 underline-offset-4">
                support@codeandbuild.tech
              </a>
              . Custom domain setups and website publishing are handled through your agency dashboard.
            </p>
          </div>

          <div className="rounded-3xl border border-white/15 p-5 sm:p-6">
            <h3 className="text-lg font-medium">Client request</h3>
            {savedMessage ? (
              <p className="mt-4 text-sm leading-6 text-white/70" role="status">
                {savedMessage}
              </p>
            ) : (
              <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)}>
                <label className="text-sm text-white/70">
                  Package
                  <select
                    value={packageId}
                    onChange={(event) => setPackageId(event.target.value as AgencyPackageId)}
                    className={inputClass}
                  >
                    {AGENCY_PACKAGES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.price})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-white/70">
                  Name
                  <input value={name} onChange={(event) => setName(event.target.value)} required className={inputClass} />
                </label>
                <label className="text-sm text-white/70">
                  Email
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={inputClass} />
                </label>
                <label className="text-sm text-white/70">
                  What should the site do?
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} required rows={4} className={inputClass} />
                </label>
                <label className="hidden" aria-hidden="true">
                  Company
                  <input value={company} onChange={(event) => setCompany(event.target.value)} tabIndex={-1} autoComplete="off" />
                </label>
                {error ? (
                  <p className="text-sm text-red-300" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-1 h-11 rounded-full bg-white px-4 text-sm font-medium text-black enabled:hover:bg-white/90 disabled:opacity-60"
                >
                  {pending ? "Sending" : "Request Website / Contact Agency"}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
