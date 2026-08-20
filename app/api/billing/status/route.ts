import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mapStripeStatusToBilling, resolvePlanName } from "@/lib/billing";

export const dynamic = "force-dynamic";

const LEGACY_STATUS = (billingStatus: string): string =>
  billingStatus === "trialing" ? "active" : billingStatus;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // DB is the authoritative source for billing status + trial/period end dates
  // (written by the webhook). Used even when the Clerk metadata cache hits.
  const [subscriber] = await db
    .select({
      billingStatus: subscribers.billingStatus,
      trialEnd: subscribers.trialEnd,
      currentPeriodEnd: subscribers.currentPeriodEnd
    })
    .from(subscribers)
    .where(eq(subscribers.id, userId))
    .limit(1)
    .catch(() => []);

  // Fast Path: Clerk metadata cache for the plan name.
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
    const user = await clerk.users.getUser(userId);
    const plan = user.publicMetadata.plan as string | undefined;
    const cachedStatus = user.publicMetadata.status as string | undefined;

    if (plan && plan !== "Free") {
      const billingStatus = subscriber?.billingStatus ?? cachedStatus ?? "active";
      return NextResponse.json({
        plan,
        status: LEGACY_STATUS(billingStatus),
        billingStatus,
        trialEnd: subscriber?.trialEnd ?? null,
        currentPeriodEnd: subscriber?.currentPeriodEnd ?? null
      });
    }
  } catch (error) {
    console.error("Clerk metadata retrieval failed, falling back to Stripe:", error);
  }

  // Fallback: Query Stripe directly for active OR trialing subscriptions
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      plan: "Free",
      status: LEGACY_STATUS(subscriber?.billingStatus ?? "active"),
      billingStatus: subscriber?.billingStatus ?? "active",
      trialEnd: subscriber?.trialEnd ?? null,
      currentPeriodEnd: subscriber?.currentPeriodEnd ?? null
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
        status: LEGACY_STATUS(subscriber?.billingStatus ?? "active"),
        billingStatus: subscriber?.billingStatus ?? "active",
        trialEnd: subscriber?.trialEnd ?? null,
        currentPeriodEnd: subscriber?.currentPeriodEnd ?? null
      });
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
      const planName = resolvePlanName(priceId, interval);
      const billingStatus = mapStripeStatusToBilling(sub.status);
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
      const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

      return NextResponse.json({
        plan: planName,
        status: LEGACY_STATUS(billingStatus),
        billingStatus,
        trialEnd,
        currentPeriodEnd
      });
    }

    return NextResponse.json({
      plan: "Free",
      status: LEGACY_STATUS(subscriber?.billingStatus ?? "active"),
      billingStatus: subscriber?.billingStatus ?? "active",
      trialEnd: subscriber?.trialEnd ?? null,
      currentPeriodEnd: subscriber?.currentPeriodEnd ?? null
    });
  } catch (error) {
    console.error("Failed to fetch billing status from Stripe:", error);
    return NextResponse.json({
      plan: "Free",
      status: LEGACY_STATUS(subscriber?.billingStatus ?? "active"),
      billingStatus: subscriber?.billingStatus ?? "active",
      trialEnd: subscriber?.trialEnd ?? null,
      currentPeriodEnd: subscriber?.currentPeriodEnd ?? null
    });
  }
}