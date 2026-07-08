import { createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeWebhookEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});

export const dynamic = "force-dynamic";

// Helper: Resolve plan name from price ID
function resolvePlanName(priceId: string | undefined, interval: string | undefined): string {
  let planName = "Starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID || priceId === process.env.STRIPE_PRO_YEARLY_PRICE_ID) {
    planName = "Professional";
  } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID || priceId === process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID) {
    planName = "Enterprise";
  }
  if (interval === "year") planName += " Yearly";
  return planName;
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
    let clerkUserId: string | null = null;
    const stripeObject = event.data.object as any;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      clerkUserId = session.client_reference_id ?? session.metadata?.clerk_user_id ?? null;
    } else {
      // For subscription events, get user from customer metadata
      const customerId = stripeObject.customer as string;
      if (customerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            clerkUserId = customer.metadata?.clerk_user_id ?? null;
          }
        } catch (err) {
          console.error(`Failed to retrieve customer ${customerId} from Stripe:`, err);
        }
      }
    }

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
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: { plan: planName, status: "active" }
          });
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

          // Map Stripe status to our status
          let status = "active";
          if (sub.status === "trialing") status = "active"; // Trials are active
          else if (sub.status === "past_due") status = "past_due";
          else if (sub.status === "canceled" || sub.status === "unpaid") status = "canceled";

          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: { plan: planName, status }
          });
          processedSuccessfully = true;
          console.log(`Subscription ${event.type}: ${planName} (${sub.status}) for user ${clerkUserId}`);
        }
        break;
      }

      case "invoice.paid": {
        if (clerkUserId) {
          const invoice = event.data.object as Stripe.Invoice;
          const subId = invoice.subscription as string;
          let planName = "Starter";
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              const priceId = sub.items.data[0]?.price.id;
              const interval = sub.items.data[0]?.price.recurring?.interval;
              planName = resolvePlanName(priceId, interval);
            } catch {}
          }
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: { plan: planName, status: "active" }
          });
          processedSuccessfully = true;
          console.log(`Renewed ${planName} for user ${clerkUserId}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (clerkUserId) {
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: { status: "past_due" }
          });
          processedSuccessfully = true;
          console.warn(`Payment failed, status set to past_due for user ${clerkUserId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (clerkUserId) {
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: { plan: "Free", status: "active" }
          });
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
