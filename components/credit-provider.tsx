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
  EXTEND_VIDEO_COST,
  IMAGE_GENERATION_COST,
  INITIAL_CREDITS,
  STRIPE_CONNECTING_MESSAGE,
  deductGenerationCredits,
  formatCreditTotal,
  generationCreditCost,
  paymentApprovedMessage,
} from "@/lib/credits";
import type { VisualEngineId } from "@/lib/visual-engines";

export type ArchiveProject = {
  id: string;
  prompt: string;
  durationSec: number;
  engine: VisualEngineId | "image";
  engineLabel: string;
  voiceName: string;
  voiceId: string;
  script: string;
  audioSrc?: string;
  videoSrc?: string;
  imageSrc?: string;
  kind?: "video" | "image";
  creditsCharged?: number;
  createdAt: string;
};

export type CreditLedgerEntry = {
  id: string;
  when: string;
  item: string;
  change: string;
  balance: number;
};

type CreditContextValue = {
  credits: number;
  ledger: CreditLedgerEntry[];
  projects: ArchiveProject[];
  connecting: boolean;
  startCheckout: (credits: number) => Promise<void>;
  deductForEngine: (engine: VisualEngineId, imageToVideo?: boolean) => void;
  deductImageCredits: () => void;
  deductExtendCredits: () => void;
  archiveProject: (project: ArchiveProject) => void;
  setAccountBalance: (tokens: number) => void;
  balanceReady: boolean;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [projects, setProjects] = useState<ArchiveProject[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [balanceReady, setBalanceReady] = useState(false);
  const [approval, setApproval] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);
  const creditsRef = useRef(INITIAL_CREDITS);

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
      ledger,
      projects,
      connecting,
      balanceReady,
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
      deductForEngine(engine, imageToVideo = false) {
        hydratedRef.current = true;
        const cost = generationCreditCost(engine, imageToVideo);
        const next = deductGenerationCredits(creditsRef.current, engine, imageToVideo);
        creditsRef.current = next;
        setCredits(next);
        setLedger((rows) => [
          {
            id: `spend_${Date.now().toString(36)}`,
            when: "Now",
            item: imageToVideo
              ? engine === "ultra"
                ? "Ultra image-to-video"
                : "Budget image-to-video"
              : engine === "ultra"
                ? "Ultra cinematic AI"
                : engine === "budget"
                  ? "Budget AI motion"
                  : "Free stock assets",
            change: cost === 0 ? "0" : `−${cost}`,
            balance: next,
          },
          ...rows,
        ]);
        if (cost === 0) return;
        void fetch("/api/credits/spend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engine, imageToVideo }),
        })
          .then((response) => response.json())
          .then((payload: { credits?: number }) => {
            if (typeof payload.credits !== "number") return;
            creditsRef.current = payload.credits;
            hydratedRef.current = true;
            setCredits(payload.credits);
            setLedger((rows) =>
              rows.map((row, index) => (index === 0 ? { ...row, balance: payload.credits as number } : row)),
            );
          })
          .catch(() => undefined);
      },
      deductExtendCredits() {
        hydratedRef.current = true;
        const next = Math.max(0, creditsRef.current - EXTEND_VIDEO_COST);
        creditsRef.current = next;
        setCredits(next);
        setLedger((rows) => [
          {
            id: `spend_${Date.now().toString(36)}`,
            when: "Now",
            item: "Extend video",
            change: `−${EXTEND_VIDEO_COST}`,
            balance: next,
          },
          ...rows,
        ]);
        void fetch("/api/credits/spend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "extend" }),
        })
          .then((response) => response.json())
          .then((payload: { credits?: number }) => {
            if (typeof payload.credits !== "number") return;
            creditsRef.current = payload.credits;
            hydratedRef.current = true;
            setCredits(payload.credits);
            setLedger((rows) =>
              rows.map((row, index) => (index === 0 ? { ...row, balance: payload.credits as number } : row)),
            );
          })
          .catch(() => undefined);
      },
      deductImageCredits() {
        hydratedRef.current = true;
        const next = Math.max(0, creditsRef.current - IMAGE_GENERATION_COST);
        creditsRef.current = next;
        setCredits(next);
        setLedger((rows) => [
          {
            id: `spend_${Date.now().toString(36)}`,
            when: "Now",
            item: "Image-to-image",
            change: `−${IMAGE_GENERATION_COST}`,
            balance: next,
          },
          ...rows,
        ]);
        void fetch("/api/credits/spend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "image" }),
        })
          .then((response) => response.json())
          .then((payload: { credits?: number }) => {
            if (typeof payload.credits !== "number") return;
            creditsRef.current = payload.credits;
            hydratedRef.current = true;
            setCredits(payload.credits);
            setLedger((rows) =>
              rows.map((row, index) => (index === 0 ? { ...row, balance: payload.credits as number } : row)),
            );
          })
          .catch(() => undefined);
      },
      archiveProject(project) {
        setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      },
      setAccountBalance(amount) {
        const next = Math.round(amount);
        if (!Number.isFinite(next) || next < 0) return;
        creditsRef.current = next;
        hydratedRef.current = true;
        setCredits(next);
        setBalanceReady(true);
        setLedger([
          {
            id: "available",
            when: "Now",
            item: "Available balance",
            change: "—",
            balance: next,
          },
        ]);
      },
    }),
    [balanceReady, connecting, credits, ledger, projects],
  );

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((payload: { user?: { credits?: number; tokens?: number } | null }) => {
        if (ignore || hydratedRef.current) return;
        const amount = payload.user?.credits ?? payload.user?.tokens;
        if (typeof amount !== "number") {
          setBalanceReady(true);
          return;
        }
        hydratedRef.current = true;
        creditsRef.current = amount;
        setBalanceReady(true);
        setCredits(amount);
        setLedger([
          {
            id: "available",
            when: "Now",
            item: "Available balance",
            change: "—",
            balance: amount,
          },
        ]);
      })
      .catch(() => {
        if (!ignore) setBalanceReady(true);
      });
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

export function CreditLedger() {
  const { credits, ledger } = useCredits();
  const rows =
    ledger.length > 0
      ? ledger
      : [
          {
            id: "available",
            when: "Now",
            item: "Available balance",
            change: "—",
            balance: credits,
          },
        ];

  return (
    <>
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="px-4 py-3">{row.when}</td>
          <td className="px-4 py-3">{row.item}</td>
          <td className="px-4 py-3 font-mono">{row.change}</td>
          <td className="px-4 py-3 font-mono">{row.balance.toLocaleString("en-US")}</td>
        </tr>
      ))}
    </>
  );
}

export function CreditBar() {
  const { credits } = useCredits();
  const fill = Math.min(100, (credits / 1000) * 100);

  return (
    <div className="shrink-0 sm:w-44" aria-label={formatCreditTotal(credits)}>
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          Credits
        </span>
        <span className="text-sm font-semibold tabular-nums tracking-tight">
          {credits.toLocaleString("en-US")}
        </span>
      </div>
      <div className="mt-1.5 hidden h-1.5 overflow-hidden rounded-full bg-panel-raised sm:block">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}
