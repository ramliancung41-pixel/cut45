"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCredits } from "@/components/credit-provider";
import { hasAccountSession } from "@/lib/account-session";

export function AuthGateButton({
  label,
  className,
  plan,
  credits,
  signedInHref = "/generator",
}: {
  label: string;
  className?: string;
  plan?: string;
  credits?: number;
  signedInHref?: string;
}) {
  const router = useRouter();
  const { connecting, startCheckout } = useCredits();
  const [checking, setChecking] = useState(false);

  async function onAction() {
    if (checking || connecting) return;
    setChecking(true);
    const signedIn = await hasAccountSession();
    if (!signedIn) {
      if (plan) {
        router.push(`/login?redirect=credits&plan=${encodeURIComponent(plan)}`);
      } else {
        router.push(`/login?next=${encodeURIComponent(signedInHref)}`);
      }
      return;
    }
    if (plan === "starter" || plan === "pro" || plan === "topup") {
      window.location.assign(`/api/billing/checkout?plan=${plan}`);
      return;
    }
    if (credits && credits > 0) {
      await startCheckout(credits);
      setChecking(false);
      return;
    }
    router.push(signedInHref);
    setChecking(false);
  }

  return (
    <button
      type="button"
      disabled={checking || connecting}
      onClick={() => void onAction()}
      className={className}
    >
      {label}
    </button>
  );
}
