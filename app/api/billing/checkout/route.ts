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
  const interval = (body.interval as string) || "monthly"; // "monthly" or "yearly"

  // Price ID mapping — monthly and yearly
  const priceMap: Record<string, Record<string, string | undefined>> = {
    starter: {
      monthly: process.env.STRIPE_STARTER_PRICE_ID,
      yearly: process.env.STRIPE_STARTER_YEARLY_PRICE_ID
    },
    professional: {
      monthly: process.env.STRIPE_PRO_PRICE_ID,
      yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID
    },
    enterprise: {
      monthly: process.env.STRIPE_STARTER_PRICE_ID,
      yearly: process.env.STRIPE_STARTER_YEARLY_PRICE_ID
    }
  };

  const priceId = priceMap[tier]?.[interval] || priceMap[tier]?.monthly;
  if (!priceId) {
    return NextResponse.json({ error: "Invalid tier or interval" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  // Check if customer already exists for this user
  const existingCustomers = await stripe.customers.search({
    query: `metadata['clerk_user_id']:'${userId}'`,
    limit: 1
  });

  let customerId: string;
  if (existingCustomers.data.length > 0) {
    customerId = existingCustomers.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      metadata: { clerk_user_id: userId }
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    metadata: { clerk_user_id: userId, tier, interval },
    subscription_data: {
      metadata: { clerk_user_id: userId, tier, interval },
      trial_period_days: 30
    },
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`
  });

  return NextResponse.json({ url: session.url });
}
