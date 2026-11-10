import { NextResponse } from "next/server";
import Stripe from "stripe";
import { findProfileIdByEmail, grantProfileCredits, ProfileGrantError } from "@/lib/profiles";
import {
  checkoutCustomerEmail,
  checkoutPlan,
  checkoutUserId,
  lineItemPriceId,
  paidCreditGrant,
  stripeSecretKey,
} from "@/lib/stripe-checkout";

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

  const customerEmail = checkoutCustomerEmail(session);
  let userId = checkoutUserId(session);
  if (!userId && customerEmail) {
    try {
      userId = await findProfileIdByEmail(customerEmail);
    } catch (error) {
      console.error("supabase profile email", error instanceof Error ? error.message : error);
      return NextResponse.json(profileErrorBody(error), { status: 500 });
    }
  }
  console.log("stripe checkout user", {
    userId,
    client_reference_id: session.client_reference_id,
    metadata: session.metadata,
    customer_email: customerEmail,
  });
  if (!userId) {
    return NextResponse.json(
      {
        error: "Checkout session is missing the user id.",
        client_reference_id: session.client_reference_id,
        metadata: session.metadata,
        customer_email: customerEmail,
      },
      { status: 400 },
    );
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

  const credits = paidCreditGrant(session, plan);
  if (credits !== 500 && credits !== 1600 && credits !== 3400) {
    console.error("stripe checkout unknown plan", plan, credits);
    return NextResponse.json({ error: "Unknown plan.", plan, credits }, { status: 400 });
  }

  try {
    const result = await grantProfileCredits({
      eventId: event.id,
      userId,
      email: customerEmail,
      plan,
      credits,
    });
    console.log("stripe credit grant", JSON.stringify(result));
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const body = profileErrorBody(error);
    console.error("supabase credit grant", JSON.stringify(body));
    return NextResponse.json(body, { status: 500 });
  }
}

function profileErrorBody(error: unknown) {
  if (error instanceof ProfileGrantError) {
    return {
      error: "Could not update the profile.",
      step: error.step,
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    error: "Could not update the profile.",
    message: message.replace(/sk_(live|test)_\w+/g, "[redacted]").slice(0, 500),
  };
}
