"use client";

import { Sora } from "next/font/google";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCredits } from "@/components/credit-provider";
import { useStudioAccount } from "@/components/profile-credit-bar";
import { StudioChromeProvider } from "@/components/studio-chrome";
import {
  deleteAgentSession,
  setAgentSessionPinned,
  startAgentSessions,
  useAgentSessions,
} from "@/lib/agent-session-store";
import { newAgentSessionId } from "@/lib/agent-sessions";

type RailItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string, mode: string | null) => boolean;
  newChat?: boolean;
};

const RAIL: RailItem[][] = [
  [
    {
      href: "/generator",
      label: "Home",
      icon: <HomeIcon />,
      match: (pathname, mode) => (pathname === "/generator" || pathname === "/create") && mode !== "video",
    },
    {
      href: "/generator?mode=video",
      label: "45s Story",
      icon: <VideoIcon />,
      match: (pathname, mode) => pathname === "/generator" && mode === "video",
    },
  ],
  [
    {
      href: "/credits",
      label: "Credits",
      icon: <CoinTabIcon />,
      match: (pathname) => pathname.startsWith("/credits") || pathname.startsWith("/pricing"),
    },
    {
      href: "/settings",
      label: "Settings",
      icon: <KeyIcon />,
      match: (pathname) => pathname.startsWith("/settings"),
    },
  ],
];

const WORKSPACE_PATHS = ["/agent", "/workflows", "/plugins", "/assets", "/brand"];

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-studio",
});

const DESKTOP_QUERY = "(min-width: 1100px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

const MOBILE_TABS: Array<{ href: string; label: string; icon: React.ReactNode; match: (pathname: string) => boolean }> = [
  { href: "/generator", label: "Create", icon: <SparkOutlineIcon />, match: (pathname) => pathname === "/generator" || pathname === "/create" },
  { href: "/gallery", label: "Library", icon: <FolderIcon />, match: (pathname) => pathname.startsWith("/gallery") },
  { href: "/pricing", label: "Credits", icon: <CoinTabIcon />, match: (pathname) => pathname.startsWith("/credits") },
  { href: "/settings", label: "API key", icon: <KeyIcon />, match: (pathname) => pathname.startsWith("/settings") },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const desktop = useDesktop();
  const open = expanded || desktop;
  const [copilotOpen, setCopilotOpen] = useState(false);
  const { account, ready, signOut } = useStudioAccount();
  const [railPath, setRailPath] = useState(pathname);
  const agentPage = pathname === "/agent";
  const workspacePage = WORKSPACE_PATHS.includes(pathname);
  const darkPage =
    workspacePage ||
    pathname === "/generator" ||
    pathname === "/create" ||
    pathname.startsWith("/gallery") ||
    pathname.startsWith("/credits") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/settings");
  const groups = RAIL;

  const railRef = useRef<HTMLElement>(null);
  const collapse = () => setExpanded(false);

  if (railPath !== pathname) {
    setRailPath(pathname);
    setExpanded(false);
  }

  useEffect(() => {
    if (!expanded) return;
    function onDown(event: PointerEvent) {
      if (!railRef.current?.contains(event.target as Node)) setExpanded(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  return (
    <StudioChromeProvider value={setCopilotOpen}>
      <div className={cn(sora.variable, "studio-type studio-light min-h-[100dvh] overflow-x-clip", darkPage && "studio-dark")}>
        <div
          aria-hidden
          className={cn(
            "fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 min-[1100px]:hidden",
            expanded ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
          className="fixed top-2 left-2 z-30 grid h-11 w-11 place-items-center rounded-xl border border-line bg-[var(--surface)] text-foreground min-[700px]:hidden"
        >
          <PanelIcon />
        </button>
        <aside
          ref={railRef}
          data-expanded={open}
          className={cn(
            "studio-rail fixed inset-y-0 left-0 z-50 flex-col px-2 py-3",
            expanded
              ? "flex w-[232px]"
              : "hidden w-14 min-[700px]:flex min-[700px]:w-[84px] min-[1100px]:w-[232px]",
          )}
        >
          {desktop ? (
            <Link href="/generator" className="rail-link">
              <PanelIcon />
              <span className="rail-label text-sm font-semibold tracking-tight text-foreground">Cut45</span>
            </Link>
          ) : (
            <button
              type="button"
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={expanded}
              title={expanded ? "Collapse sidebar" : "Expand sidebar"}
              onClick={() => setExpanded((value) => !value)}
              className="rail-link"
            >
              <PanelIcon />
              <span className="rail-label text-sm font-semibold tracking-tight text-foreground">Cut45</span>
            </button>
          )}
          <Suspense fallback={<RailLinks groups={groups} expanded={open} mode={null} pathname={pathname} onNavigate={collapse} />}>
            <RailLinksWithQuery groups={groups} expanded={open} pathname={pathname} onNavigate={collapse} />
          </Suspense>
          {workspacePage ? (
            <Suspense fallback={null}>
              <AgentRecents expanded={open} onExpand={() => setExpanded(true)} onNavigate={collapse} />
            </Suspense>
          ) : null}
          <div className="mt-auto flex shrink-0 flex-col gap-2 pt-2">
            {workspacePage ? null : (
              <Link
                href="/agent"
                aria-label="AI Co-Pilot"
                title="AI Co-Pilot"
                className={cn(
                  "flex h-9 items-center gap-3 rounded-full bg-violet-600 text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)] transition hover:bg-violet-700",
                  open ? "px-2.5" : "w-9 justify-center self-center",
                )}
              >
                <SparkIcon />
                {open ? <span className="text-sm font-medium">AI Co-Pilot</span> : null}
              </Link>
            )}
            <AccountMenu
              expanded={open}
              name={account?.name ?? null}
              ready={ready}
              onSignOut={() => void signOut()}
            />
          </div>
        </aside>

        <div className="min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] min-[700px]:pb-0 min-[700px]:pl-[84px] min-[1100px]:pl-[232px]">
          {copilotOpen || agentPage ? null : (
            <div className="pointer-events-none fixed top-3 right-4 z-30">
              <CreditPill dark={darkPage} />
            </div>
          )}
          {agentPage ? (
            <main className="min-w-0">{children}</main>
          ) : (
            <main className="min-w-0 px-4 pt-14 pb-10 sm:px-8 md:pt-12">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
          )}
        </div>
        <MobileTabBar pathname={pathname} />
      </div>
    </StudioChromeProvider>
  );
}

type RailLinksProps = { groups: RailItem[][]; expanded: boolean; pathname: string; onNavigate: () => void };

function RailLinksWithQuery(props: RailLinksProps) {
  const params = useSearchParams();
  const tool = params.get("tool");
  const mode = tool === "filters" ? "filters" : params.get("mode");
  return <RailLinks {...props} mode={mode} />;
}

function RailLinks({ groups, mode, pathname, onNavigate }: RailLinksProps & { mode: string | null }) {
  const router = useRouter();
  return (
    <nav aria-label="Studio" className="mt-2 flex flex-col">
      {groups.map((group, index) => (
        <div key={index} className={cn("flex flex-col gap-1", index > 0 && "mt-4")}>
          {group.map((item) => {
            const active = item.match(pathname, mode);
            if (item.newChat) {
              return (
                <button
                  key={item.label}
                  type="button"
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => {
                    onNavigate();
                    router.push(`/agent?chat=${newAgentSessionId()}`);
                  }}
                  className="rail-link border border-line bg-[var(--surface)]"
                >
                  {item.icon}
                  <span className="rail-label text-sm font-medium text-foreground">{item.label}</span>
                </button>
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn("rail-link", active && "rail-link-on")}
              >
                {item.icon}
                <span className="rail-label text-sm">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AgentRecents({
  expanded,
  onExpand,
  onNavigate,
}: {
  expanded: boolean;
  onExpand: () => void;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const active = useSearchParams().get("chat");
  const { ready, sessions } = useAgentSessions();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    startAgentSessions();
  }, []);

  useEffect(() => {
    if (!menuFor) return;
    function onDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-chat-menu]")) setMenuFor(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuFor(null);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="Recent chats"
        title="Recent chats"
        onClick={onExpand}
        className="rail-link mt-4"
      >
        <ClockIcon />
      </button>
    );
  }

  function remove(id: string) {
    setMenuFor(null);
    deleteAgentSession(id);
    if (id === active) router.push(`/agent?chat=${newAgentSessionId()}`);
  }

  function togglePin(id: string, pinned: boolean) {
    setMenuFor(null);
    setAgentSessionPinned(id, !pinned);
  }

  const pinned = sessions.filter((session) => session.pinned);
  const recent = sessions.filter((session) => !session.pinned);

  function row(session: (typeof sessions)[number]) {
    const open = menuFor === session.id;
    return (
      <li key={session.id} data-chat-menu={open ? "" : undefined}>
        <div className="group relative">
          <Link
            href={`/agent?chat=${session.id}`}
            aria-current={session.id === active ? "page" : undefined}
            title={session.title}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-1.5 rounded-lg py-1.5 pr-8 pl-2.5 text-[13px] text-foreground/80 transition hover:bg-panel hover:text-foreground",
              (session.id === active || open) && "bg-panel-raised font-medium text-foreground",
            )}
          >
            {session.pinned ? <PinIcon className="h-3 w-3 shrink-0 text-violet-600" /> : null}
            <span className="truncate">{session.title}</span>
          </Link>
          <button
            type="button"
            data-chat-menu=""
            aria-label={`Options for ${session.title}`}
            aria-expanded={open}
            title="Pin or delete"
            onClick={() => setMenuFor(open ? null : session.id)}
            className={cn(
              "absolute top-1/2 right-1 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-[var(--surface)] hover:text-foreground",
              open ? "bg-[var(--surface)] text-foreground" : "opacity-60 group-hover:opacity-100",
            )}
          >
            <DotsIcon />
          </button>
        </div>
        {open ? (
          <div data-chat-menu="" role="menu" aria-label={`${session.title} options`} className="mx-1 mt-1 mb-1.5 rounded-lg border border-line bg-[var(--surface)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              role="menuitem"
              onClick={() => togglePin(session.id, session.pinned)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-panel"
            >
              <PinIcon className="h-3.5 w-3.5" />
              {session.pinned ? "Unpin chat" : "Pin chat"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => remove(session.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-red-500 hover:bg-red-500/10"
            >
              <TrashIcon />
              Delete chat
            </button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section aria-label="Recent chats" className="rail-fade mt-4 flex min-h-0 flex-1 flex-col">
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {pinned.length > 0 ? (
          <>
            <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">Pinned</p>
            <ul className="mb-3">{pinned.map(row)}</ul>
          </>
        ) : null}
        <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">Recents</p>
        <ul>
          {recent.length === 0 ? (
            <li className="px-2.5 py-1.5 text-xs text-muted">
              {!ready ? "Loading…" : pinned.length > 0 ? "No other chats" : "No chats yet"}
            </li>
          ) : (
            recent.map(row)
          )}
        </ul>
      </div>
    </section>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur min-[700px]:hidden"
    >
      <ul className="grid grid-cols-4">
        {MOBILE_TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CreditPill({ dark }: { dark: boolean }) {
  const { credits, balanceReady } = useCredits();
  if (!balanceReady) return null;
  return (
    <Link
      href="/pricing"
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
        dark
          ? "border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
          : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
      )}
      aria-label={`${credits.toLocaleString("en-US")} credits`}
    >
      <CoinIcon />
      {credits.toLocaleString("en-US")}
    </Link>
  );
}

function AccountMenu({
  expanded,
  name,
  ready,
  onSignOut,
}: {
  expanded: boolean;
  name: string | null;
  ready: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const initials = name
    ? name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex items-center gap-3 rounded-full", expanded ? "w-full px-1.5 py-1 hover:bg-panel" : "self-center")}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel-raised text-[11px] font-semibold text-foreground">
          {initials}
        </span>
        {expanded ? <span className="truncate text-sm">{name ?? (ready ? "Sign in" : "Account")}</span> : null}
      </button>
      {open ? (
        <div className="absolute bottom-0 left-full z-50 ml-2 w-48 rounded-xl border border-line bg-[var(--surface)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
          {name ? <p className="truncate px-2.5 py-1.5 text-sm font-medium">{name}</p> : null}
          <Link href="/credits" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-1.5 text-sm hover:bg-panel">
            Credits
          </Link>
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-1.5 text-sm hover:bg-panel">
            Settings
          </Link>
          {name ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-panel"
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-1.5 text-sm hover:bg-panel">
              Sign in
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function PanelIcon() {
  return (
    <Svg>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M8 4v12" />
    </Svg>
  );
}

function HomeIcon() {
  return (
    <Svg>
      <path d="M3.5 9 10 3.5 16.5 9v6.5a1 1 0 0 1-1 1h-3v-4.5h-5V16.5h-3a1 1 0 0 1-1-1Z" />
    </Svg>
  );
}

function VideoIcon() {
  return (
    <Svg>
      <rect x="2.5" y="5" width="11" height="10" rx="2" />
      <path d="m13.5 8.5 4-2.5v8l-4-2.5" />
    </Svg>
  );
}

function FolderIcon() {
  return (
    <Svg>
      <path d="M2.5 6a1.5 1.5 0 0 1 1.5-1.5h3.2l1.6 1.8H16a1.5 1.5 0 0 1 1.5 1.5v6.7A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5Z" />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.5" />
    </Svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
      <circle cx="5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15" cy="10" r="1.4" />
    </svg>
  );
}

function PinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.5 3.5 16.5 7.5M13.8 4.8l-4.3 3.4-3.2-.4-1.3 1.3 6.2 6.2 1.3-1.3-.4-3.2 3.4-4.3M8 12l-4.5 4.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6M8.5 9v4M11.5 9v4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
      <path d="M10 2.5c.4 3.4 2.1 5.1 5.5 5.5-3.4.4-5.1 2.1-5.5 5.5-.4-3.4-2.1-5.1-5.5-5.5 3.4-.4 5.1-2.1 5.5-5.5Z" />
      <path d="M15.5 12.5c.2 1.6 1 2.4 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.1 2.3-.9 2.5-2.5Z" />
    </svg>
  );
}

function SparkOutlineIcon() {
  return (
    <Svg>
      <path d="M10 3c.4 3 1.9 4.6 5 5-3.1.4-4.6 2-5 5-.4-3-1.9-4.6-5-5 3.1-.4 4.6-2 5-5Z" />
    </Svg>
  );
}

function CoinTabIcon() {
  return (
    <Svg>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
    </Svg>
  );
}

function KeyIcon() {
  return (
    <Svg>
      <circle cx="7" cy="12.5" r="3.5" />
      <path d="m9.5 10 6.5-6.5M13.5 6l2 2" />
    </Svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
    </svg>
  );
}
