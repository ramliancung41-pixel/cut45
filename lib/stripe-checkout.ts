import Stripe from "stripe";
import { isBillingPlanId, stripePaymentLinkForPlan, type BillingPlanId } from "@/lib/billing";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_ID = /^price_[A-Za-z0-9]+$/;

const PRICE_ENV: Record<BillingPlanId, string> = {
  starter: "STRIPE_PRICE_ID_STARTER",
  pro: "STRIPE_PRICE_ID_PRO",
  topup: "STRIPE_PRICE_ID_TOPUP",
};

export function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}

export function priceIdForPlan(plan: BillingPlanId) {
  const value = process.env[PRICE_ENV[plan]]?.trim() ?? "";
  return PRICE_ID.test(value) ? value : "";
}

export function planForPriceId(priceId: string | null | undefined): BillingPlanId | null {
  if (!priceId) return null;
  const plans: BillingPlanId[] = ["starter", "pro", "topup"];
  for (const plan of plans) {
    if (priceIdForPlan(plan) === priceId) return plan;
  }
  return null;
}

export function checkoutModeForPrice(price: { type?: string | null }) {
  if (price.type === "recurring") return "subscription" as const;
  if (price.type === "one_time") return "payment" as const;
  throw new Error("Stripe price type is not supported.");
}

function hostedCheckoutUrl(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function createPlanCheckoutSession(input: {
  plan: BillingPlanId;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const key = stripeSecretKey();
  const price = priceIdForPlan(input.plan);
  if (!key || !price || !USER_ID.test(input.userId)) return null;

  const stripe = new Stripe(key);
  const priceObject = await stripe.prices.retrieve(price);
  const mode = checkoutModeForPrice(priceObject);
  const metadata = { plan: input.plan, user_id: input.userId };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: input.userId,
    metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    adaptive_pricing: { enabled: true },
    locale: "auto",
    ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      ...params,
      automatic_payment_methods: { enabled: true },
    } as Stripe.Checkout.SessionCreateParams);
    return hostedCheckoutUrl(session.url);
  } catch (error) {
    if (!isUnknownCheckoutParameter(error, "automatic_payment_methods")) throw error;
    const session = await stripe.checkout.sessions.create(params);
    return hostedCheckoutUrl(session.url);
  }
}

function isUnknownCheckoutParameter(error: unknown, parameter: string) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; param?: string; message?: string };
  return (
    record.code === "parameter_unknown" &&
    (record.param === parameter || (record.message ?? "").includes(parameter))
  );
}

export function checkoutCustomerEmail(session: Stripe.Checkout.Session) {
  const direct = session.customer_email?.trim() ?? "";
  if (direct) return direct;
  const details = session.customer_details?.email?.trim() ?? "";
  return details || null;
}

export function paidCreditGrant(session: Stripe.Checkout.Session, plan: BillingPlanId) {
  for (const item of session.line_items?.data ?? []) {
    const price = item.price;
    if (!price || typeof price === "string") continue;
    const matched = planForCatalogAmount(price.unit_amount, price.currency);
    if (matched === "starter") return 500;
    if (matched === "pro") return 1600;
    if (matched === "topup") return 3400;
  }
  if (plan === "starter") return 500;
  if (plan === "pro") return 1600;
  return 3400;
}

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

function priceFromLineItem(item: Stripe.LineItem) {
  const price = item.price;
  if (!price || typeof price === "string") return null;
  return price;
}

export function lineItemPriceId(session: Stripe.Checkout.Session) {
  for (const item of session.line_items?.data ?? []) {
    const price = item.price;
    if (typeof price === "string") return price;
    if (price && typeof price.id === "string") return price.id;
  }
  return null;
}

function planForCatalogAmount(unitAmount: number | null | undefined, currency: string | null | undefined) {
  if (currency && currency.toLowerCase() !== "usd") return null;
  if (unitAmount === 500) return "starter" as const;
  if (unitAmount === 1500) return "pro" as const;
  if (unitAmount === 3000) return "topup" as const;
  return null;
}

export async function checkoutPlan(stripe: Stripe, session: Stripe.Checkout.Session) {
  const fromMetadata = session.metadata?.plan?.trim() ?? "";
  if (isBillingPlanId(fromMetadata)) return fromMetadata;

  const fromPrice = planForPriceId(lineItemPriceId(session));
  if (fromPrice) return fromPrice;

  for (const item of session.line_items?.data ?? []) {
    const price = priceFromLineItem(item);
    const fromAmount = planForCatalogAmount(price?.unit_amount, price?.currency);
    if (fromAmount) return fromAmount;
  }

  if (session.id && stripeSecretKey()) {
    const expanded = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price"],
    });
    const fromExpanded = planForPriceId(lineItemPriceId(expanded));
    if (fromExpanded) return fromExpanded;
    for (const item of expanded.line_items?.data ?? []) {
      const price = priceFromLineItem(item);
      const fromAmount = planForCatalogAmount(price?.unit_amount, price?.currency);
      if (fromAmount) return fromAmount;
    }
  }

  const paymentLink = session.payment_link;
  const paymentLinkId = typeof paymentLink === "string" ? paymentLink : null;
  const fromId = planForPaymentLinkId(paymentLinkId);
  if (fromId) return fromId;
  if (!paymentLinkId || !stripeSecretKey()) return null;

  const link = await stripe.paymentLinks.retrieve(paymentLinkId);
  return planForPaymentLinkUrl(link.url);
}
