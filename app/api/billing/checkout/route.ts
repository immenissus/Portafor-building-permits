import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const tier = (body.tier as string) || "starter";

  const priceMap: Record<string, string | undefined> = {
    starter: process.env.STRIPE_STARTER_PRICE_ID,
    professional: process.env.STRIPE_PRO_PRICE_ID,
    enterprise: process.env.STRIPE_STARTER_PRICE_ID // fallback to starter for now
  };

  const priceId = priceMap[tier];
  if (!priceId) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const customer = await stripe.customers.create({
    metadata: { clerk_user_id: userId }
  });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    metadata: { clerk_user_id: userId, tier },
    subscription_data: {
      metadata: { clerk_user_id: userId, tier },
      trial_period_days: 30
    },
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`
  });

  return NextResponse.json({ url: session.url });
}
