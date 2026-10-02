"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreditTag } from "@/components/credit-provider";
import { ProfileCreditBar, SidebarAccount, useStudioAccount } from "@/components/profile-credit-bar";

const NAV = [
  { href: "/generator", label: "AI Generator" },
  { href: "/credits", label: "Credits" },
  { href: "/gallery", label: "Gallery" },
  { href: "/settings", label: "Settings" },
] as const;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const { account, ready, signOut } = useStudioAccount();
  const displayName = account?.name ?? null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex min-h-dvh">
        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-black/60 md:hidden"
            aria-label="Close menu"
            onClick={() => setMenuPath(null)}
          />
        ) : null}

        <aside
          className={cn(
            "studio-side fixed inset-y-0 left-0 z-30 w-64 flex-col px-3 py-5 md:sticky md:top-0 md:flex md:h-dvh",
            open ? "flex" : "hidden",
          )}
        >
          <Link
            href="/generator"
            onClick={() => setMenuPath(null)}
            className="flex items-center gap-3 rounded-lg px-2 py-1"
          >
            <span
              aria-hidden
              className="h-8 w-5 rounded-[3px] border border-accent/80 bg-accent/15"
            />
            <span>
              <span className="block text-sm font-semibold tracking-tight">Cut45</span>
              <span className="block text-xs text-muted">Faceless shorts</span>
            </span>
          </Link>
          <CreditTag prominent onNavigate={() => setMenuPath(null)} />

          <nav id="studio-nav" className="mt-8 flex flex-1 flex-col gap-1" aria-label="Studio">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuPath(null)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "studio-nav-on font-medium text-foreground"
                      : "text-muted hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 space-y-3 border-t border-line px-2 pt-4">
            <SidebarAccount
              name={displayName}
              ready={ready}
              onNavigate={() => setMenuPath(null)}
              onSignOut={() => {
                setMenuPath(null);
                void signOut();
              }}
            />
            <CreditTag onNavigate={() => setMenuPath(null)} />
            <p className="text-xs leading-5 text-muted">
              Mock studio. Each run previews a 45-second timeline and does not
              render a video file.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-background/90 px-4 py-3 backdrop-blur">
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm md:hidden"
              aria-expanded={open}
              aria-controls="studio-nav"
              onClick={() => setMenuPath(open ? null : pathname)}
            >
              {open ? "Close" : "Menu"}
            </button>
            <span className="text-sm font-semibold tracking-tight md:hidden">Cut45</span>
            <ProfileCreditBar name={displayName} ready={ready} />
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
