"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isBillingPlanId } from "@/lib/billing";

export function ResumeCheckout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const plan = searchParams.get("plan");

  useEffect(() => {
    if (started.current) return;
    if (!isBillingPlanId(plan)) {
      if (plan) router.replace("/credits");
      return;
    }
    started.current = true;
    window.location.assign(`/api/billing/checkout?plan=${plan}`);
  }, [plan, router]);

  return null;
}
