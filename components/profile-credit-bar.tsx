"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditBar } from "@/components/credit-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ProfileCreditBar() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((payload: { user?: { email?: string } | null }) => {
        if (ignore) return;
        setEmail(payload.user?.email ?? null);
        setReady(true);
      })
      .catch(() => {
        if (ignore) return;
        setEmail(null);
        setReady(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      // The server cookie is cleared next, even if the browser client is unavailable.
    }
    await fetch("/api/auth/logout", { method: "POST" });
    setEmail(null);
    router.refresh();
  }

  return (
    <div className="ml-auto flex items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2">
      {ready && email ? (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-[11px] text-muted hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link href="/login" className="text-sm font-medium text-foreground hover:text-accent">
          {ready ? "Sign in" : "Account"}
        </Link>
      )}
      <span aria-hidden className="h-8 w-px bg-line" />
      <CreditBar />
    </div>
  );
}
