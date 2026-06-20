import { createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});

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
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.clerk_user_id;
        
        if (userId) {
          await clerk.users.updateUser(userId, {
            publicMetadata: {
              plan: "Starter Yearly",
              status: "active"
            }
          });
          console.log(`Successfully provisioned Starter Yearly for user ${userId}`);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        
        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            const userId = customer.metadata?.clerk_user_id;
            if (userId) {
              await clerk.users.updateUser(userId, {
                publicMetadata: {
                  plan: "Starter Yearly",
                  status: "active"
                }
              });
              console.log(`Successfully renewed Starter Yearly for user ${userId}`);
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            const userId = customer.metadata?.clerk_user_id;
            if (userId) {
              await clerk.users.updateUser(userId, {
                publicMetadata: {
                  status: "past_due"
                }
              });
              console.warn(`Payment failed, status set to past_due for user ${userId}`);
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            const userId = customer.metadata?.clerk_user_id;
            if (userId) {
              await clerk.users.updateUser(userId, {
                publicMetadata: {
                  plan: "Free",
                  status: "active"
                }
              });
              console.log(`Subscription deleted, user ${userId} downgraded to Free`);
            }
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error);
    return NextResponse.json({ error: "Failed to process event" }, { status: 500 });
  }
}
