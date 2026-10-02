import { NextResponse } from "next/server";
import Stripe from "stripe";
import { creditGrantForPlan } from "@/lib/billing";
import { grantCheckoutCredits } from "@/lib/profiles";
import { checkoutPlan, checkoutUserId } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY ?? "sk_test_webhook_only";
  return new Stripe(key);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook secret is missing." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const userId = checkoutUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Checkout session is missing the user id." }, { status: 400 });
  }

  let plan: Awaited<ReturnType<typeof checkoutPlan>>;
  try {
    plan = await checkoutPlan(stripe, session);
  } catch {
    return NextResponse.json({ error: "Could not read the Stripe payment link." }, { status: 500 });
  }
  if (!plan) {
    return NextResponse.json({ error: "Checkout session is missing the plan." }, { status: 400 });
  }

  const credits = creditGrantForPlan(plan);
  if (credits !== 300 && credits !== 1000 && credits !== 150) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  try {
    const result = await grantCheckoutCredits({
      eventId: event.id,
      userId,
      plan,
      credits,
    });
    return NextResponse.json({ received: true, ...result });
  } catch {
    return NextResponse.json({ error: "Could not update the profile." }, { status: 500 });
  }
}
