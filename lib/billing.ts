export interface ClerkUserLike {
  publicMetadata?: Record<string, unknown>;
}

export interface ClerkLike {
  users: {
    getUser: (userId: string) => Promise<ClerkUserLike>;
    updateUser: (userId: string, params: { publicMetadata: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface StripeEventLike {
  type: string;
  object?: Record<string, unknown>;
}

/**
 * Resolve the plan display name from a Stripe price ID + billing interval.
 */
export function resolvePlanName(priceId: string | undefined, interval: string | undefined): string {
  let planName = "Starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID || priceId === process.env.STRIPE_PRO_YEARLY_PRICE_ID) {
    planName = "Professional";
  } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID || priceId === process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID) {
    planName = "Enterprise";
  }
  if (interval === "year") planName += " Yearly";
  return planName;
}

/**
 * SQL fragment for the delivery gate (used in the poll/backfill matcher and the
 * digest job). Alias is always `s` (subscribers). Blocks expired trials,
 * ended billing periods, and non-trialing/active states.
 */
export const ENTITLED_FOR_DELIVERY_SQL = `s.billing_status IN ('trialing','active') AND (s.trial_end IS NULL OR s.trial_end > NOW()) AND (s.current_period_end IS NULL OR s.current_period_end > NOW())`;

export interface DeliveryEntitlement {
  billingStatus: string | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * Map a Stripe subscription status to our billing_status column.
 * `trialing` stays distinct from `active` (a trial is not a paid subscription).
 */
export function mapStripeStatusToBilling(stripeStatus: string | undefined | null): string {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "active";
  }
}

/**
 * Whether a subscriber may receive leads: billing_status is trialing or active
 * AND the trial/current billing period has not ended.
 */
export function isEntitledForDelivery(sub: DeliveryEntitlement): boolean {
  if (sub.billingStatus !== "trialing" && sub.billingStatus !== "active") return false;
  const now = Date.now();
  if (sub.trialEnd && sub.trialEnd.getTime() < now) return false;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now) return false;
  return true;
}

/**
 * Merge a metadata patch into a user's publicMetadata instead of replacing it,
 * preserving unrelated keys (e.g. role: admin).
 */
export async function mergeClerkPublicMetadata(
  clerk: ClerkLike,
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const user = await clerk.users.getUser(userId);
  await clerk.users.updateUser(userId, {
    publicMetadata: { ...(user.publicMetadata ?? {}), ...patch }
  });
}

/**
 * Derive the Clerk publicMetadata patch for a Stripe webhook event from its
 * payload alone (no Stripe API calls), so the self-healing queue can recover
 * failed events without hardcoding a plan.
 */
export function resolveMetadataPatch(event: StripeEventLike): Record<string, unknown> | null {
  const object: Record<string, unknown> = event.object ?? {};
  switch (event.type) {
    case "checkout.session.completed": {
      const meta = ((object.metadata as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
      const tier = String(meta.tier || "starter");
      const interval = String(meta.interval || "monthly");
      const plan = tier.charAt(0).toUpperCase() + tier.slice(1) + (interval === "yearly" ? " Yearly" : "");
      return { plan, status: "active" };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const items =
        ((object.items as { data?: Array<{ price?: { id?: string; recurring?: { interval?: string } } }> } | undefined)
          ?.data) ?? [];
      const price = items[0]?.price;
      const plan = resolvePlanName(price?.id, price?.recurring?.interval);
      const subStatus = object.status as string | undefined;
      return { plan, status: mapStripeStatusToBilling(subStatus) };
    }
    case "invoice.paid": {
      const lines =
        ((object.lines as { data?: Array<{ price?: { id?: string; recurring?: { interval?: string } } }> } | undefined)
          ?.data) ?? [];
      const price = lines[0]?.price;
      const plan = resolvePlanName(price?.id, price?.recurring?.interval);
      return { plan, status: "active" };
    }
    case "invoice.payment_failed":
      return { status: "past_due" };
    case "customer.subscription.deleted":
      return { plan: "Free", status: "active" };
    default:
      return null;
  }
}