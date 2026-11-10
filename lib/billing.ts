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
    id: "topup",
    name: "Creator",
    price: "$30",
    cadence: "one-time",
    credits: "3,400 Credits",
    volume: "226 x 5s clips, including 400 bonus credits",
    summary: "3,400 credits, including 400 bonus credits. Enough for 226 five-second clips.",
    creditGrant: 3400,
    featured: false,
    stripePaymentLink: STRIPE_PAYMENT_LINK_TOPUP,
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_TOPUP",
    checkoutHref: "/api/billing/checkout?plan=topup",
  },
  {
    id: "starter",
    name: "Starter",
    price: "$5",
    cadence: "one-time",
    credits: "500 Credits",
    volume: "33 x 5s clips",
    summary: "500 credits. Enough for 33 five-second clips.",
    creditGrant: 500,
    featured: true,
    stripePaymentLink: STRIPE_PAYMENT_LINK_STARTER,
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_STARTER",
    checkoutHref: "/api/billing/checkout?plan=starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$15",
    cadence: "one-time",
    credits: "1,600 Credits",
    volume: "106 x 5s clips, including 100 bonus credits",
    summary: "1,600 credits, including 100 bonus credits. Enough for 106 five-second clips.",
    creditGrant: 1600,
    featured: false,
    stripePaymentLink: STRIPE_PAYMENT_LINK_PRO,
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    checkoutHref: "/api/billing/checkout?plan=pro",
  },
];
