import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_STARTER_PRICE_ID) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const customer = await stripe.customers.create({
    metadata: { clerk_user_id: userId }
  });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: process.env.STRIPE_STARTER_PRICE_ID, quantity: 1 }],
    client_reference_id: userId,
    metadata: { clerk_user_id: userId },
    subscription_data: {
      metadata: { clerk_user_id: userId },
      trial_period_days: 30
    },
    success_url: `${origin}/dashboard/settings?billing=success`,
    cancel_url: `${origin}/dashboard/settings?billing=cancelled`
  });

  return NextResponse.json({ url: session.url });
}
