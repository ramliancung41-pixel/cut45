import { NextResponse } from "next/server";
import Stripe from "stripe";
import { creditGrantForPlan } from "@/lib/billing";
import { grantProfileCredits } from "@/lib/profiles";
import { checkoutPlan, checkoutUserId, lineItemPriceId, stripeSecretKey } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function stripeClient() {
  const key = stripeSecretKey() || "sk_test_webhook_only";
  return new Stripe(key);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("stripe webhook missing STRIPE_WEBHOOK_SECRET");
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
  } catch (error) {
    console.error("stripe webhook signature", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  console.log("stripe webhook payload", payload);

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    console.log("stripe webhook ignored", event.type);
    return NextResponse.json({ received: true });
  }

  let session = event.data.object;
  if (stripeSecretKey() && session.id) {
    try {
      session = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price"],
      });
    } catch (error) {
      console.error("stripe session retrieve", error instanceof Error ? error.message : error);
    }
  }

  console.log(
    "stripe checkout session",
    JSON.stringify({
      id: session.id,
      mode: session.mode,
      payment_status: session.payment_status,
      client_reference_id: session.client_reference_id,
      metadata: session.metadata,
      line_items: session.line_items,
      priceId: lineItemPriceId(session),
    }),
  );

  if (session.payment_status !== "paid") {
    console.log("stripe checkout unpaid", session.payment_status);
    return NextResponse.json({ received: true });
  }

  const userId = checkoutUserId(session);
  console.log("stripe checkout user", {
    userId,
    client_reference_id: session.client_reference_id,
    metadata: session.metadata,
  });
  if (!userId) {
    return NextResponse.json({ error: "Checkout session is missing the user id." }, { status: 400 });
  }

  let plan: Awaited<ReturnType<typeof checkoutPlan>>;
  try {
    plan = await checkoutPlan(stripe, session);
  } catch (error) {
    console.error("stripe checkout plan", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not read the Stripe payment link." }, { status: 500 });
  }
  console.log("stripe checkout plan", { plan, priceId: lineItemPriceId(session), metadata: session.metadata });
  if (!plan) {
    return NextResponse.json({ error: "Checkout session is missing the plan." }, { status: 400 });
  }

  const credits = creditGrantForPlan(plan);
  if (credits !== 300 && credits !== 1000 && credits !== 150) {
    console.error("stripe checkout unknown plan", plan, credits);
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  try {
    const result = await grantProfileCredits({
      eventId: event.id,
      userId,
      plan,
      credits,
    });
    console.log("stripe credit grant", JSON.stringify(result));
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("supabase credit grant", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not update the profile." }, { status: 500 });
  }
}
