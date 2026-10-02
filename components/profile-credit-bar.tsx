"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditBar } from "@/components/credit-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StudioAccount = {
  name: string;
};

export function useStudioAccount() {
  const router = useRouter();
  const [account, setAccount] = useState<StudioAccount | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((payload: { user?: { name?: string; email?: string } | null }) => {
        if (ignore) return;
        const name = payload.user?.name?.trim();
        setAccount(payload.user && name ? { name } : null);
        setReady(true);
      })
      .catch(() => {
        if (ignore) return;
        setAccount(null);
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
    setAccount(null);
    router.push("/login");
    router.refresh();
  }

  return { account, ready, signOut };
}

export function ProfileCreditBar({
  name,
  ready,
}: {
  name: string | null;
  ready: boolean;
}) {
  return (
    <div className="ml-auto flex items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2">
      {ready && name ? (
        <p className="max-w-[9rem] truncate text-sm font-medium tracking-tight">{name}</p>
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

export function SidebarAccount({
  name,
  ready,
  onSignOut,
  onNavigate,
}: {
  name: string | null;
  ready: boolean;
  onSignOut: () => void;
  onNavigate: () => void;
}) {
  if (!ready) return null;

  if (!name) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="block rounded-lg px-2 py-2 text-sm font-medium text-foreground hover:bg-panel-raised"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-background/40 px-2 py-2">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-xs font-semibold text-accent"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">{name}</p>
        <button
          type="button"
          onClick={onSignOut}
          className="text-xs text-muted hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
