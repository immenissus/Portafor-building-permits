import { createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeWebhookEvents, subscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mergeClerkPublicMetadata, resolvePlanName, mapStripeStatusToBilling } from "@/lib/billing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

/** Resolve the Clerk user for a Stripe event with multiple fallbacks. */
async function resolveClerkUserId(event: Stripe.Event): Promise<string | null> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    return session.client_reference_id ?? session.metadata?.clerk_user_id ?? null;
  }

  const stripeObject = event.data.object as unknown as Record<string, unknown>;
  // Metadata propagated at checkout lands on the subscription object itself.
  const objectMeta = stripeObject.metadata as Record<string, unknown> | undefined;
  const fromObject = objectMeta?.clerk_user_id as string | undefined;
  if (fromObject) return fromObject;

  // Fallback: customer metadata (covers legacy customers created without it).
  const customerId = stripeObject.customer as string;
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) {
        return customer.metadata?.clerk_user_id ?? null;
      }
    } catch (err) {
      console.error(`Failed to retrieve customer ${customerId} from Stripe:`, err);
    }
  }
  return null;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    // 1. Webhook Event Deduplication
    const [existingEvent] = await db
      .select({ id: stripeWebhookEvents.id, status: stripeWebhookEvents.status })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.id, event.id))
      .limit(1);

    if (existingEvent && existingEvent.status === "processed") {
      console.log(`Deduplicated: Webhook event ${event.id} already processed.`);
      return NextResponse.json({ received: true, deduplicated: true });
    }

    // 2. Extract Clerk User ID
    const clerkUserId = await resolveClerkUserId(event);

    // 3. Log event as 'pending'
    if (!existingEvent) {
      await db.insert(stripeWebhookEvents).values({
        id: event.id,
        type: event.type,
        clerkUserId,
        status: "pending",
        payload: event
      });
    }

    // 4. Process Event
    let processedSuccessfully = false;

    switch (event.type) {
      case "checkout.session.completed": {
        if (clerkUserId) {
          const session = event.data.object as Stripe.Checkout.Session;
          const tier = session.metadata?.tier || "starter";
          const interval = session.metadata?.interval || "monthly";
          const planName = tier.charAt(0).toUpperCase() + tier.slice(1) + (interval === "yearly" ? " Yearly" : "");
          await mergeClerkPublicMetadata(clerk, clerkUserId, { plan: planName, status: "active" });
          if (session.customer) {
            await db
              .update(subscribers)
              .set({ stripeCustomerId: String(session.customer) })
              .where(eq(subscribers.id, clerkUserId));
          }
          processedSuccessfully = true;
          console.log(`Provisioned ${planName} for user ${clerkUserId}`);
        }
        break;
      }

      // Handle subscription lifecycle events (trials, renewals, etc.)
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        if (clerkUserId) {
          const sub = event.data.object as Stripe.Subscription;
          const priceId = sub.items.data[0]?.price.id;
          const interval = sub.items.data[0]?.price.recurring?.interval;
          const planName = resolvePlanName(priceId, interval);
          const billingStatus = mapStripeStatusToBilling(sub.status);
          const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
          const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
          const status = billingStatus === "canceled" ? "canceled" : billingStatus === "past_due" ? "past_due" : "active";

          await mergeClerkPublicMetadata(clerk, clerkUserId, { plan: planName, status: billingStatus });
          await db
            .update(subscribers)
            .set({
              stripeCustomerId: typeof sub.customer === "string" ? sub.customer : undefined,
              stripeSubscriptionId: sub.id,
              billingStatus,
              trialEnd,
              currentPeriodEnd: periodEnd,
              status
            })
            .where(eq(subscribers.id, clerkUserId));
          processedSuccessfully = true;
          console.log(`Subscription ${event.type}: ${planName} (${sub.status}) for user ${clerkUserId}`);
        }
        break;
      }

      case "invoice.paid": {
        if (clerkUserId) {
          const invoice = event.data.object as Stripe.Invoice;
          const subId = invoice.subscription as string | undefined;
          let planName = "Starter";
          let periodEnd: Date | null = null;
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              const priceId = sub.items.data[0]?.price.id;
              const interval = sub.items.data[0]?.price.recurring?.interval;
              planName = resolvePlanName(priceId, interval);
              if (sub.current_period_end) periodEnd = new Date(sub.current_period_end * 1000);
            } catch {}
          }
          await mergeClerkPublicMetadata(clerk, clerkUserId, { plan: planName, status: "active" });
          await db
            .update(subscribers)
            .set({ billingStatus: "active", currentPeriodEnd: periodEnd, status: "active" })
            .where(eq(subscribers.id, clerkUserId));
          processedSuccessfully = true;
          console.log(`Renewed ${planName} for user ${clerkUserId}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (clerkUserId) {
          await mergeClerkPublicMetadata(clerk, clerkUserId, { status: "past_due" });
          await db
            .update(subscribers)
            .set({ billingStatus: "past_due", status: "past_due" })
            .where(eq(subscribers.id, clerkUserId));
          processedSuccessfully = true;
          console.warn(`Payment failed, status set to past_due for user ${clerkUserId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (clerkUserId) {
          await mergeClerkPublicMetadata(clerk, clerkUserId, { plan: "Free", status: "active" });
          await db
            .update(subscribers)
            .set({ billingStatus: "canceled", status: "canceled" })
            .where(eq(subscribers.id, clerkUserId));
          processedSuccessfully = true;
          console.log(`Subscription deleted, user ${clerkUserId} downgraded to Free`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        processedSuccessfully = true;
    }

    // 5. Update Webhook Log
    if (processedSuccessfully) {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(stripeWebhookEvents.id, event.id));
    } else {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "failed", errorLog: "Clerk User ID was missing or unresolved" })
        .where(eq(stripeWebhookEvents.id, event.id));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error);
    try {
      await db
        .update(stripeWebhookEvents)
        .set({ status: "failed", errorLog: error instanceof Error ? error.stack || error.message : "Webhook processing failure" })
        .where(eq(stripeWebhookEvents.id, event.id));
    } catch (logErr) {
      console.error("Failed to write webhook failure to db:", logErr);
    }
    return NextResponse.json({ error: "Failed to process event" }, { status: 500 });
  }
}