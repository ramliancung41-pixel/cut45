import { studioDestination } from "@/lib/studio-paths";

export type BillingPlanId = "starter" | "pro" | "topup";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  price: string;
  cadence: string;
  credits: string;
  volume: string;
  summary: string;
  creditGrant: number;
  featured: boolean;
  /** Stripe Payment Link from the Dashboard. Leave empty until the link exists. */
  stripePaymentLink: string;
  /** Env name to set when the payment link above is still empty. */
  stripePaymentLinkEnv: string;
  checkoutHref: string;
};

const STRIPE_PAYMENT_LINK_STARTER =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_STARTER?.trim() ?? "";
const STRIPE_PAYMENT_LINK_PRO = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO?.trim() ?? "";
const STRIPE_PAYMENT_LINK_TOPUP =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_TOPUP?.trim() ?? "";

const EXTRA_PLAN_GRANTS = { ultra: 3500 } as const;

export function isBillingPlanId(plan: string | null): plan is BillingPlanId {
  return plan === "starter" || plan === "pro" || plan === "topup";
}

export function stripePaymentLinkForPlan(plan: BillingPlanId) {
  const match = BILLING_PLANS.find((item) => item.id === plan);
  return match?.stripePaymentLink ?? "";
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function stripeCheckoutDestination(plan: BillingPlanId, userId: string) {
  if (!USER_ID.test(userId)) return null;
  const raw = stripePaymentLinkForPlan(plan);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (url.protocol !== "https:" || (host !== "stripe.com" && !host.endsWith(".stripe.com"))) {
    return null;
  }
  url.searchParams.set("client_reference_id", userId);
  return url.toString();
}

export function creditGrantForPlan(plan: string | null) {
  if (!plan) return null;
  if (plan in EXTRA_PLAN_GRANTS) {
    return EXTRA_PLAN_GRANTS[plan as keyof typeof EXTRA_PLAN_GRANTS];
  }
  const match = BILLING_PLANS.find((item) => item.id === plan);
  return match?.creditGrant ?? null;
}

export function loginDestination(params: {
  next?: string | null;
  redirect?: string | null;
  plan?: string | null;
}) {
  if (params.redirect === "credits") {
    if (params.plan && creditGrantForPlan(params.plan)) {
      return `/credits?plan=${params.plan}`;
    }
    return "/credits";
  }
  return studioDestination(params.next ?? null);
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "starter",
    name: "Starter Plan",
    price: "$15",
    cadence: "/mo",
    credits: "300 Credits",
    volume: "~20-30 Draft Shorts",
    summary: "A monthly pack for draft shorts on the free stock engine.",
    creditGrant: 300,
    featured: false,
    stripePaymentLink: STRIPE_PAYMENT_LINK_STARTER,
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_STARTER",
    checkoutHref: "/api/billing/checkout?plan=starter",
  },
  {
    id: "pro",
    name: "Pro Plan",
    price: "$40",
    cadence: "/mo",
    credits: "1,000 Credits",
    volume: "~80-100 Premium Shorts",
    summary: "The monthly plan sized for premium shorts once paid video is live.",
    creditGrant: 1000,
    featured: true,
    stripePaymentLink: STRIPE_PAYMENT_LINK_PRO,
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    checkoutHref: "/api/billing/checkout?plan=pro",
  },
  {
    id: "topup",
    name: "Top-up Pack",
    price: "$10",
    cadence: "one-time",
    credits: "150 Credits",
    volume: "Pay-as-you-go",
    summary: "A one-time pack you can buy whenever a run needs more credits.",
    creditGrant: 150,
    featured: false,
    stripePaymentLink: STRIPE_PAYMENT_LINK_TOPUP,
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_TOPUP",
    checkoutHref: "/api/billing/checkout?plan=topup",
  },
];
