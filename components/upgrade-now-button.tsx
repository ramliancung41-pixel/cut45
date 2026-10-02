"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasAccountSession } from "@/lib/account-session";
import type { BillingPlanId } from "@/lib/billing";

export function UpgradeNowButton({
  plan,
  paymentLink,
  className,
}: {
  plan: BillingPlanId;
  paymentLink: string;
  className?: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function onUpgrade() {
    if (checking || !paymentLink) return;
    setChecking(true);
    const signedIn = await hasAccountSession();
    if (!signedIn) {
      const params = new URLSearchParams({ redirect: "credits", plan });
      router.push(`/login?${params.toString()}`);
      return;
    }
    window.location.assign(`/api/billing/checkout?plan=${plan}`);
  }

  return (
    <button
      type="button"
      disabled={checking || !paymentLink}
      onClick={() => void onUpgrade()}
      className={className}
    >
      Upgrade Now
    </button>
  );
}
