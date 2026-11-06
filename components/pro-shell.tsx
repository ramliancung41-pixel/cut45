"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCredits } from "@/components/credit-provider";
import { useStudioAccount } from "@/components/profile-credit-bar";

const NAV = [
  { href: "/generator", label: "Home", icon: "home" },
  { href: "/generator", label: "AI Video", icon: "video" },
  { href: "/gallery", label: "Projects", icon: "projects" },
  { href: "/gallery", label: "Assets", icon: "assets" },
  { href: "/settings", label: "Voice Clone", icon: "voice" },
  { href: "/generator", label: "AI Tools", icon: "tools" },
  { href: "/gallery", label: "Inspiration", icon: "spark" },
] as const;

const LIBRARY = [
  { href: "/gallery", label: "My Videos", icon: "videos" },
  { href: "/gallery", label: "Favorites", icon: "heart" },
  { href: "/gallery", label: "Trash", icon: "trash" },
] as const;

export function ProShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { credits } = useCredits();
  const { account, signOut } = useStudioAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = account?.name || "Alex Smith";

  return (
    <div className="flex min-h-dvh bg-[#0b0d16] text-white">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-white/10 bg-[#10131d] px-3 py-4 md:flex">
        <Link href="/generator" className="flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#b14bff] shadow-[0_8px_20px_rgba(124,92,255,0.35)]">
            <PlayIcon />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight">cut45</span>
            <span className="block text-[11px] text-white/45">Video Generator</span>
          </span>
        </Link>

        <nav className="mt-6 flex flex-col gap-1" aria-label="Studio">
          {NAV.map((item) => (
            <ShellLink key={item.label} href={item.href} label={item.label} icon={item.icon} active={item.label === "Home" && pathname === "/generator"} />
          ))}
        </nav>

        <p className="mt-6 px-3 text-[10px] font-semibold tracking-[0.16em] text-white/35">LIBRARY</p>
        <nav className="mt-2 flex flex-col gap-1" aria-label="Library">
          {LIBRARY.map((item) => (
            <ShellLink key={item.label} href={item.href} label={item.label} icon={item.icon} active={false} />
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-[#171a27] p-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#2a2418] text-amber-300">
            <CrownIcon />
          </span>
          <p className="mt-3 text-sm font-semibold">Upgrade to Pro</p>
          <p className="mt-1 text-[11px] leading-4 text-white/50">Unlock unlimited videos, premium models, and more.</p>
          <Link
            href="/credits"
            className="mt-3 block rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#8b5cff] px-3 py-2 text-center text-sm font-semibold"
          >
            Upgrade Now
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">AI Video Generator</h1>
              <span className="rounded-md bg-[#6d4aff] px-1.5 py-0.5 text-[10px] font-bold tracking-wide">PRO</span>
            </div>
            <p className="mt-0.5 hidden text-xs text-white/45 sm:block">Transform your ideas into stunning videos with AI</p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 text-sm font-medium sm:flex">
              <BoltIcon />
              {credits.toLocaleString("en-US")}
              <span className="text-white/45">Credits</span>
            </span>
            <Link
              href="/credits"
              className="rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#9b5cff] px-3 py-1.5 text-sm font-semibold"
            >
              Upgrade
            </Link>
            <span className="hidden h-8 w-px bg-white/10 sm:block" />
            <button type="button" aria-label="Notifications" className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/5">
              <BellIcon />
            </button>
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 hover:bg-white/5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] text-xs font-semibold">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-semibold leading-tight">{name}</span>
                  <span className="block text-[10px] text-white/45">Pro Plan</span>
                </span>
                <ChevronIcon />
              </button>
              {menuOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                  className="absolute right-0 z-20 mt-1 rounded-xl border border-white/10 bg-[#171a27] px-3 py-2 text-xs"
                >
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto px-3 py-4 sm:px-5">{children}</main>
      </div>
    </div>
  );
}

function ShellLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#7a52ff] px-3 py-2 text-sm font-medium"
          : "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
      }
    >
      <NavIcon name={icon} />
      {label}
    </Link>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = "h-4 w-4";
  if (name === "home") {
    return (
      <svg viewBox="0 0 20 20" className={common} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 9.5 10 3l7 6.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === "video") {
    return (
      <svg viewBox="0 0 20 20" className={common} fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="5" width="11" height="10" rx="2" />
        <path d="m13.5 8.5 4-2.5v8l-4-2.5" />
      </svg>
    );
  }
  if (name === "templates" || name === "projects") {
    return (
      <svg viewBox="0 0 20 20" className={common} fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="3" width="6" height="6" rx="1.2" />
        <rect x="11" y="3" width="6" height="6" rx="1.2" />
        <rect x="3" y="11" width="6" height="6" rx="1.2" />
        <rect x="11" y="11" width="6" height="6" rx="1.2" />
      </svg>
    );
  }
  if (name === "heart") {
    return (
      <svg viewBox="0 0 20 20" className={common} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 16s-6-3.6-6-7.2A3.2 3.2 0 0 1 10 6a3.2 3.2 0 0 1 6 2.8C16 12.4 10 16 10 16z" />
      </svg>
    );
  }
  if (name === "trash") {
    return (
      <svg viewBox="0 0 20 20" className={common} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 6h12M7 6V4h6v2M6 6l1 10h6l1-10" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className={common} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 7v3l2 2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="white">
      <path d="M7 5.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <path d="M3 14.5 4.5 7l3.2 3.2L10 5l2.3 5.2L15.5 7 17 14.5H3z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-amber-300" fill="currentColor">
      <path d="M11 2 4 11h5l-1 7 7-10h-5l1-6z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5H3.5S5 12 5 8zM8.5 16a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="hidden h-3.5 w-3.5 text-white/50 sm:block" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}
