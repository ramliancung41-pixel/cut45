"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { hasAccountSession } from "@/lib/account-session";
import {
  CHECKOUT_CONNECTING_MS,
  INITIAL_CREDITS,
  STRIPE_CONNECTING_MESSAGE,
  deductGenerationCredits,
  formatCreditTotal,
  paymentApprovedMessage,
} from "@/lib/credits";
import type { VisualEngineId } from "@/lib/visual-engines";

export type ArchiveProject = {
  id: string;
  prompt: string;
  durationSec: number;
  engine: VisualEngineId;
  engineLabel: string;
  voiceName: string;
  voiceId: string;
  script: string;
  audioSrc?: string;
  createdAt: string;
};

type CreditContextValue = {
  credits: number;
  projects: ArchiveProject[];
  connecting: boolean;
  startCheckout: (credits: number) => Promise<void>;
  deductForEngine: (engine: VisualEngineId) => void;
  archiveProject: (project: ArchiveProject) => void;
  setAccountBalance: (tokens: number) => void;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [projects, setProjects] = useState<ArchiveProject[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [approval, setApproval] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const value = useMemo<CreditContextValue>(
    () => ({
      credits,
      projects,
      connecting,
      async startCheckout(amount) {
        const grant = Math.round(amount);
        if (!Number.isFinite(grant) || grant <= 0 || timerRef.current !== null) return;
        const signedIn = await hasAccountSession();
        if (!signedIn || timerRef.current !== null) return;
        setApproval(null);
        setConnecting(true);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          setCredits((current) => current + grant);
          setConnecting(false);
          setApproval(paymentApprovedMessage(grant));
        }, CHECKOUT_CONNECTING_MS);
      },
      deductForEngine(engine) {
        setCredits((current) => deductGenerationCredits(current, engine));
      },
      archiveProject(project) {
        setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      },
      setAccountBalance(amount) {
        const next = Math.round(amount);
        if (!Number.isFinite(next) || next < 0) return;
        setCredits(next);
      },
    }),
    [connecting, credits, projects],
  );

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((payload: { user?: { tokens?: number } | null }) => {
        if (ignore) return;
        const tokens = payload.user?.tokens;
        if (typeof tokens !== "number") return;
        setCredits((current) => (current === 0 ? tokens : current));
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <CreditContext.Provider value={value}>
      {children}
      {connecting ? <CheckoutOverlay /> : null}
      {approval ? (
        <p
          role="status"
          className="fixed right-4 bottom-4 z-50 max-w-sm rounded-2xl border border-ok/50 bg-[#1c2414] px-4 py-3 text-sm font-medium text-ok shadow-lg"
        >
          {approval}
        </p>
      ) : null}
    </CreditContext.Provider>
  );
}

function CheckoutOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stripe-checkout-title"
        className="w-full max-w-md rounded-2xl border border-line bg-panel px-6 py-8 text-center shadow-2xl"
      >
        <span
          aria-hidden
          className="mx-auto block h-11 w-11 animate-spin rounded-full border-2 border-line border-t-accent"
        />
        <p id="stripe-checkout-title" className="mt-5 text-base font-medium text-foreground">
          {STRIPE_CONNECTING_MESSAGE}
        </p>
      </div>
    </div>
  );
}

export function useCredits() {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error("useCredits must be used inside CreditProvider.");
  }
  return context;
}

export function CreditTag({
  prominent = false,
  onNavigate,
}: {
  prominent?: boolean;
  onNavigate?: () => void;
}) {
  const { credits } = useCredits();
  const label = formatCreditTotal(credits);

  if (!prominent) {
    return (
      <Link
        href="/credits"
        onClick={onNavigate}
        className="text-sm font-medium text-foreground hover:text-accent"
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href="/credits"
      onClick={onNavigate}
      className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/15 px-3 py-2.5"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Balance
      </span>
      <span className="text-sm font-semibold tracking-tight">{label}</span>
    </Link>
  );
}

export function CreditFigure({ className }: { className?: string }) {
  const { credits } = useCredits();
  return <span className={className}>{credits.toLocaleString("en-US")}</span>;
}

export function CreditBar() {
  const { credits } = useCredits();
  const fill = Math.min(100, (credits / 1000) * 100);

  return (
    <div className="w-36 sm:w-44" aria-label={formatCreditTotal(credits)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Credits
        </span>
        <span className="text-sm font-semibold tracking-tight">
          {credits.toLocaleString("en-US")}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-raised">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}
