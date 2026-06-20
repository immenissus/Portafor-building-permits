import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      plan: "Free",
      status: "active"
    });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const customers = await stripe.customers.search({
      query: `metadata['clerk_user_id']:'${userId}'`,
      limit: 1
    });

    if (!customers.data || customers.data.length === 0) {
      return NextResponse.json({
        plan: "Free",
        status: "active"
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1
    });

    if (subscriptions.data && subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      const priceId = sub.items.data[0]?.price.id;
      
      // Check if price matches our configured yearly/monthly starter price
      const isStarterYearly = priceId === process.env.STRIPE_STARTER_PRICE_ID;
      const planName = isStarterYearly ? "Starter Yearly" : "Starter";

      return NextResponse.json({
        plan: planName,
        status: sub.status
      });
    }

    return NextResponse.json({
      plan: "Free",
      status: "active"
    });
  } catch (error) {
    console.error("Failed to fetch billing status:", error);
    return NextResponse.json({
      plan: "Free",
      status: "active"
    });
  }
}
