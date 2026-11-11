"use client";

import { useState } from "react";
import Link from "next/link";
import { AGENCY_PACKAGES, type AgencyPackageId } from "@/lib/agency";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const inputClass =
  "mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white";

export function AgencyServices({ active = "pricing" }: { active?: "pricing" | "agency" }) {
  const [packageId, setPackageId] = useState<AgencyPackageId>("business");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [savedEmail, setSavedEmail] = useState("");

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
    setSavedEmail(body.message || "Request received!");
    setName("");
    setEmail("");
    setMessage("");
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <SiteHeader active={active} />
      <main className="mx-auto w-full max-w-6xl px-3 py-12 sm:px-6 sm:py-16">
        <p className="text-xs tracking-[0.18em] text-white/50 uppercase">Agency services</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight text-balance sm:text-5xl">
          Websites for clients, priced as packages.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
          Choose a package, then send a request. It is stored for the studio, and the agency replies by email.
        </p>

        <fieldset className="mt-10 grid gap-4 lg:grid-cols-3">
          <legend className="sr-only">Package</legend>
          {AGENCY_PACKAGES.map((item) => {
            const selected = packageId === item.id;
            return (
              <label
                key={item.id}
                className={`cursor-pointer rounded-3xl border p-5 ${selected ? "border-white bg-white text-black" : "border-white/15 bg-white/[0.03]"}`}
              >
                <input
                  type="radio"
                  name="package"
                  value={item.id}
                  checked={selected}
                  onChange={() => setPackageId(item.id)}
                  className="sr-only"
                />
                <p className="text-sm text-current/70">{item.price}</p>
                <p className="mt-2 text-xl font-medium">{item.name}</p>
                <p className={`mt-2 text-sm leading-6 ${selected ? "text-black/70" : "text-white/60"}`}>{item.detail}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </label>
            );
          })}
        </fieldset>

        <section className="mt-12 max-w-xl rounded-3xl border border-white/15 p-5 sm:p-6">
          <h2 className="text-2xl font-medium">Request Website / Contact Agency</h2>
          {savedEmail ? (
            <p className="mt-4 text-sm leading-6 text-white/70" role="status">
              {savedEmail}
            </p>
          ) : (
            <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)}>
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
          <p className="mt-4 text-sm text-white/50">
            Or email{" "}
            <a href="mailto:support@codeandbuild.tech" className="text-white underline decoration-white/30 underline-offset-4">
              support@codeandbuild.tech
            </a>
            . Studio credit packs stay on{" "}
            <Link href="/login?next=/credits" className="text-white underline decoration-white/30 underline-offset-4">
              Credits
            </Link>{" "}
            after sign-in.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
