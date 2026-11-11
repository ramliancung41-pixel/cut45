"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth-modal";
import { hasAccountSession } from "@/lib/account-session";

export function SiteHeader({ active }: { active?: "pricing" | "agency" }) {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  async function startNow() {
    if (starting) return;
    setStarting(true);
    const signedIn = await hasAccountSession();
    if (signedIn) {
      router.push("/dashboard");
      return;
    }
    setStarting(false);
    setAuthOpen(true);
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-black/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-4 sm:gap-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span aria-hidden className="h-8 w-5 rounded-[4px] border border-white/80 bg-white/10" />
            <span className="text-sm font-medium tracking-tight">Cut45</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/pricing"
              aria-current={active === "pricing" ? "page" : undefined}
              className={`text-sm ${active === "pricing" ? "text-white" : "text-white/60 hover:text-white"}`}
            >
              Pricing
            </Link>
            <Link
              href="/agency"
              aria-current={active === "agency" ? "page" : undefined}
              className={`text-sm ${active === "agency" ? "text-white" : "text-white/60 hover:text-white"}`}
            >
              Agency
            </Link>
            <Link href="/login?next=/dashboard" className="hidden text-sm text-white/60 hover:text-white sm:inline">
              Log in
            </Link>
            <button
              type="button"
              disabled={starting}
              onClick={() => void startNow()}
              className="flex h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-black enabled:hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
            >
              Start Now
            </button>
          </nav>
        </div>
      </header>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-800">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-8 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Cut45 · AI website builder</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-5">
          <Link href="/pricing" className="hover:text-white">
            Pricing
          </Link>
          <Link href="/agency" className="hover:text-white">
            Agency
          </Link>
          <Link href="/login?next=/dashboard" className="hover:text-white">
            Log in
          </Link>
          <a href="mailto:support@codeandbuild.tech" className="hover:text-white">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
