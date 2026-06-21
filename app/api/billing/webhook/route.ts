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
    // 1. Webhook Event Deduplication (Check if already processed)
    const [existingEvent] = await db
      .select({ id: stripeWebhookEvents.id, status: stripeWebhookEvents.status })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.id, event.id))
      .limit(1);

    if (existingEvent && existingEvent.status === "processed") {
      console.log(`Deduplicated: Webhook event ${event.id} already processed.`);
      return NextResponse.json({ received: true, deduplicated: true });
    }

    // 2. Extract Clerk User ID depending on Stripe Event Type
    let clerkUserId: string | null = null;
    const stripeObject = event.data.object as any;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      clerkUserId = session.client_reference_id ?? session.metadata?.clerk_user_id ?? null;
    } else {
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

    // 3. Log event as 'pending' (upsert/insert)
    if (!existingEvent) {
      await db.insert(stripeWebhookEvents).values({
        id: event.id,
        type: event.type,
        clerkUserId,
        status: "pending",
        payload: event
      });
    }

    // 4. Process Stripe Event cases
    let processedSuccessfully = false;

    switch (event.type) {
      case "checkout.session.completed": {
        if (clerkUserId) {
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: {
              plan: "Starter Yearly",
              status: "active"
            }
          });
          processedSuccessfully = true;
          console.log(`Successfully provisioned Starter Yearly for user ${clerkUserId}`);
        }
        break;
      }

      case "invoice.paid": {
        if (clerkUserId) {
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: {
              plan: "Starter Yearly",
              status: "active"
            }
          });
          processedSuccessfully = true;
          console.log(`Successfully renewed Starter Yearly for user ${clerkUserId}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (clerkUserId) {
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: {
              status: "past_due"
            }
          });
          processedSuccessfully = true;
          console.warn(`Payment failed, status set to past_due for user ${clerkUserId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (clerkUserId) {
          await clerk.users.updateUser(clerkUserId, {
            publicMetadata: {
              plan: "Free",
              status: "active"
            }
          });
          processedSuccessfully = true;
          console.log(`Subscription deleted, user ${clerkUserId} downgraded to Free`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        processedSuccessfully = true; // No action needed, count as processed
    }

    // 5. Update Webhook Log to processed / failed
    if (processedSuccessfully) {
      await db
        .update(stripeWebhookEvents)
        .set({
          status: "processed",
          processedAt: new Date()
        })
        .where(eq(stripeWebhookEvents.id, event.id));
    } else {
      await db
        .update(stripeWebhookEvents)
        .set({
          status: "failed",
          errorLog: "Clerk User ID was missing or unresolved"
        })
        .where(eq(stripeWebhookEvents.id, event.id));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error);

    // Save failure trace to database
    try {
      await db
        .update(stripeWebhookEvents)
        .set({
          status: "failed",
          errorLog: error instanceof Error ? error.stack || error.message : "Webhook processing failure"
        })
        .where(eq(stripeWebhookEvents.id, event.id));
    } catch (logErr) {
      console.error("Failed to write webhook failure to db:", logErr);
    }

    return NextResponse.json({ error: "Failed to process event" }, { status: 500 });
  }
}
