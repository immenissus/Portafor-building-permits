import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized — please sign in" }, { status: 401 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("STRIPE_SECRET_KEY is missing");
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const tier = (body.tier as string) || "starter";
    const interval = (body.interval as string) || "monthly";

    // Resolve price ID from env vars
    const priceId =
      tier === "professional"
        ? (interval === "yearly" ? process.env.STRIPE_PRO_YEARLY_PRICE_ID : null) || process.env.STRIPE_PRO_PRICE_ID
        : tier === "enterprise"
        ? process.env.STRIPE_ENTERPRISE_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID
        : (interval === "yearly" ? process.env.STRIPE_STARTER_YEARLY_PRICE_ID : null) || process.env.STRIPE_STARTER_PRICE_ID;

    if (!priceId) {
      console.error(`No price ID found for tier=${tier} interval=${interval}`);
      return NextResponse.json({ error: `No price ID for ${tier}/${interval}` }, { status: 400 });
    }

    console.log(`Checkout: user=${userId} tier=${tier} interval=${interval} priceId=${priceId}`);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    // Find or create Stripe customer
    let customerId: string;
    const existing = await stripe.customers.search({
      query: `metadata['clerk_user_id']:'${userId}'`,
      limit: 1
    });

    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({ metadata: { clerk_user_id: userId } });
      customerId = customer.id;
    }

    // Determine base URL for redirects
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "www.portafor.info";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const baseUrl = `${proto}://${host}`;

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
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`
    });

    console.log(`Checkout session created: ${session.id}`);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
