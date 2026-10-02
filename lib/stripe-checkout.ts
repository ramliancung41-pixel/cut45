import type Stripe from "stripe";
import { isBillingPlanId, stripePaymentLinkForPlan, type BillingPlanId } from "@/lib/billing";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkoutUserId(session: Stripe.Checkout.Session) {
  const reference = session.client_reference_id?.trim() ?? "";
  if (USER_ID.test(reference)) return reference;

  const metadata = session.metadata ?? {};
  const fromMetadata = (
    metadata.user_id ||
    metadata.userId ||
    metadata.supabase_user_id ||
    ""
  ).trim();
  if (USER_ID.test(fromMetadata)) return fromMetadata;
  return null;
}

export function planForPaymentLinkId(paymentLinkId: string | null) {
  if (!paymentLinkId) return null;
  const pairs: Array<[BillingPlanId, string | undefined]> = [
    ["starter", process.env.STRIPE_PAYMENT_LINK_ID_STARTER],
    ["pro", process.env.STRIPE_PAYMENT_LINK_ID_PRO],
    ["topup", process.env.STRIPE_PAYMENT_LINK_ID_TOPUP],
  ];
  for (const [plan, configured] of pairs) {
    if (configured && configured.trim() === paymentLinkId) return plan;
  }
  return null;
}

export function planForPaymentLinkUrl(raw: string | null | undefined): BillingPlanId | null {
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  const plans: BillingPlanId[] = ["starter", "pro", "topup"];
  for (const plan of plans) {
    const configured = stripePaymentLinkForPlan(plan);
    if (!configured) continue;
    try {
      const known = new URL(configured);
      if (known.origin === target.origin && known.pathname === target.pathname) return plan;
    } catch {
      continue;
    }
  }
  return null;
}

export async function checkoutPlan(stripe: Stripe, session: Stripe.Checkout.Session) {
  const fromMetadata = session.metadata?.plan?.trim() ?? "";
  if (isBillingPlanId(fromMetadata)) return fromMetadata;

  const paymentLink = session.payment_link;
  const paymentLinkId = typeof paymentLink === "string" ? paymentLink : null;
  const fromId = planForPaymentLinkId(paymentLinkId);
  if (fromId) return fromId;
  if (!paymentLinkId || !process.env.STRIPE_SECRET_KEY) return null;

  const link = await stripe.paymentLinks.retrieve(paymentLinkId);
  return planForPaymentLinkUrl(link.url);
}
