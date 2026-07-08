import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fast Path: Check Clerk server-side metadata
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
    const user = await clerk.users.getUser(userId);
    const plan = user.publicMetadata.plan as string | undefined;
    const status = user.publicMetadata.status as string | undefined;

    if (plan && plan !== "Free") {
      return NextResponse.json({ plan, status: status ?? "active" });
    }
  } catch (error) {
    console.error("Clerk metadata retrieval failed, falling back to Stripe:", error);
  }

  // Fallback: Query Stripe directly for active OR trialing subscriptions
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ plan: "Free", status: "active" });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const customers = await stripe.customers.search({
      query: `metadata['clerk_user_id']:'${userId}'`,
      limit: 1
    });

    if (!customers.data || customers.data.length === 0) {
      return NextResponse.json({ plan: "Free", status: "active" });
    }

    // Check for active subscriptions first, then trialing
    let subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1
    });

    // Also check trialing subscriptions (trial_period_days creates "trialing" status)
    if (subscriptions.data.length === 0) {
      subscriptions = await stripe.subscriptions.list({
        customer: customers.data[0].id,
        status: "trialing",
        limit: 1
      });
    }

    if (subscriptions.data && subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      const priceId = sub.items.data[0]?.price.id;
      const interval = sub.items.data[0]?.price.recurring?.interval;

      let planName = "Starter";
      if (priceId === process.env.STRIPE_PRO_PRICE_ID || priceId === process.env.STRIPE_PRO_YEARLY_PRICE_ID) {
        planName = "Professional";
      } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID || priceId === process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID) {
        planName = "Enterprise";
      }
      if (interval === "year") planName += " Yearly";

      // Map Stripe status to our status
      const mappedStatus = sub.status === "trialing" ? "active" : sub.status;

      return NextResponse.json({ plan: planName, status: mappedStatus });
    }

    return NextResponse.json({ plan: "Free", status: "active" });
  } catch (error) {
    console.error("Failed to fetch billing status from Stripe:", error);
    return NextResponse.json({ plan: "Free", status: "active" });
  }
}
