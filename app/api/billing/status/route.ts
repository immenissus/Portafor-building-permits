import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fast Path: Check if Clerk has already cached the plan and status in publicMetadata
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
    const user = await clerk.users.getUser(userId);
    const plan = user.publicMetadata.plan as string | undefined;
    const status = user.publicMetadata.status as string | undefined;

    if (plan) {
      return NextResponse.json({
        plan,
        status: status ?? "active"
      });
    }
  } catch (error) {
    console.error("Clerk metadata retrieval failed, falling back to Stripe:", error);
  }

  // Fallback Path: Query Stripe customer and subscription records directly
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
    console.error("Failed to fetch billing status from Stripe:", error);
    return NextResponse.json({
      plan: "Free",
      status: "active"
    });
  }
}
