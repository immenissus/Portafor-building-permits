import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  resolvePlanName,
  mergeClerkPublicMetadata,
  resolveMetadataPatch,
  isEntitledForDelivery,
  mapStripeStatusToBilling,
  ENTITLED_FOR_DELIVERY_SQL
} from "./billing";

describe("resolvePlanName", () => {
  beforeEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_m";
    process.env.STRIPE_STARTER_YEARLY_PRICE_ID = "price_starter_y";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_m";
    process.env.STRIPE_PRO_YEARLY_PRICE_ID = "price_pro_y";
    process.env.STRIPE_ENTERPRISE_PRICE_ID = "price_ent_m";
    process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID = "price_ent_y";
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Starter monthly/yearly", () => {
    expect(resolvePlanName("price_starter_m", "month")).toBe("Starter");
    expect(resolvePlanName("price_starter_y", "year")).toBe("Starter Yearly");
  });

  it("maps Professional monthly/yearly", () => {
    expect(resolvePlanName("price_pro_m", "month")).toBe("Professional");
    expect(resolvePlanName("price_pro_y", "year")).toBe("Professional Yearly");
  });

  it("maps Enterprise monthly/yearly", () => {
    expect(resolvePlanName("price_ent_m", "month")).toBe("Enterprise");
    expect(resolvePlanName("price_ent_y", "year")).toBe("Enterprise Yearly");
  });

  it("defaults to Starter for unknown price IDs", () => {
    expect(resolvePlanName("price_unknown", "month")).toBe("Starter");
  });
});

describe("mergeClerkPublicMetadata", () => {
  it("merges the patch without wiping existing metadata (role:admin preserved)", async () => {
    const clerk = {
      users: {
        getUser: vi.fn().mockResolvedValue({
          publicMetadata: { role: "admin", plan: "Starter", status: "active" }
        }),
        updateUser: vi.fn().mockResolvedValue({})
      }
    };
    await mergeClerkPublicMetadata(clerk, "user_1", { plan: "Professional", status: "active" });
    expect(clerk.users.getUser).toHaveBeenCalledWith("user_1");
    expect(clerk.users.updateUser).toHaveBeenCalledWith("user_1", {
      publicMetadata: { role: "admin", plan: "Professional", status: "active" }
    });
  });

  it("handles a user with no existing metadata", async () => {
    const clerk = {
      users: {
        getUser: vi.fn().mockResolvedValue({ publicMetadata: undefined }),
        updateUser: vi.fn().mockResolvedValue({})
      }
    };
    await mergeClerkPublicMetadata(clerk, "user_2", { plan: "Free" });
    expect(clerk.users.updateUser).toHaveBeenCalledWith("user_2", {
      publicMetadata: { plan: "Free" }
    });
  });
});

describe("resolveMetadataPatch", () => {
  it("maps checkout.session.completed from tier/interval metadata", () => {
    const patch = resolveMetadataPatch({
      type: "checkout.session.completed",
      object: { metadata: { tier: "professional", interval: "yearly" } }
    });
    expect(patch).toEqual({ plan: "Professional Yearly", status: "active" });
  });

  it("maps subscription.created trialing faithfully (keeps trialing)", () => {
    const patch = resolveMetadataPatch({
      type: "customer.subscription.created",
      object: {
        status: "trialing",
        items: { data: [{ price: { id: "price_pro_m", recurring: { interval: "month" } } }] }
      }
    });
    expect(patch).toEqual({ plan: "Professional", status: "trialing" });
  });

  it("maps subscription.deleted to Free", () => {
    const patch = resolveMetadataPatch({ type: "customer.subscription.deleted", object: {} });
    expect(patch).toEqual({ plan: "Free", status: "active" });
  });

  it("maps invoice.payment_failed to past_due without touching plan", () => {
    const patch = resolveMetadataPatch({ type: "invoice.payment_failed", object: {} });
    expect(patch).toEqual({ status: "past_due" });
  });

  it("returns null for unhandled event types", () => {
    expect(resolveMetadataPatch({ type: "charge.updated", object: {} })).toBeNull();
  });
});

describe("mapStripeStatusToBilling", () => {
  it("keeps trialing distinct from active", () => {
    expect(mapStripeStatusToBilling("trialing")).toBe("trialing");
    expect(mapStripeStatusToBilling("active")).toBe("active");
  });

  it("maps cancel/unpaid states to canceled", () => {
    expect(mapStripeStatusToBilling("canceled")).toBe("canceled");
    expect(mapStripeStatusToBilling("unpaid")).toBe("canceled");
    expect(mapStripeStatusToBilling("incomplete_expired")).toBe("canceled");
  });

  it("keeps past_due and incomplete faithful", () => {
    expect(mapStripeStatusToBilling("past_due")).toBe("past_due");
    expect(mapStripeStatusToBilling("incomplete")).toBe("incomplete");
  });
});

describe("isEntitledForDelivery", () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  it("allows active subscriptions with no expiry", () => {
    expect(isEntitledForDelivery({ billingStatus: "active", trialEnd: null, currentPeriodEnd: null })).toBe(true);
  });

  it("allows a trialing subscription inside the trial window", () => {
    expect(isEntitledForDelivery({ billingStatus: "trialing", trialEnd: future, currentPeriodEnd: null })).toBe(true);
  });

  it("blocks a trial that has expired", () => {
    expect(isEntitledForDelivery({ billingStatus: "trialing", trialEnd: past, currentPeriodEnd: null })).toBe(false);
  });

  it("blocks an active subscription past its billing period end", () => {
    expect(isEntitledForDelivery({ billingStatus: "active", trialEnd: null, currentPeriodEnd: past })).toBe(false);
  });

  it("blocks canceled and past_due regardless of dates", () => {
    expect(isEntitledForDelivery({ billingStatus: "canceled", trialEnd: null, currentPeriodEnd: future })).toBe(false);
    expect(isEntitledForDelivery({ billingStatus: "past_due", trialEnd: null, currentPeriodEnd: future })).toBe(false);
  });

  it("blocks an unknown/absent billing status", () => {
    expect(isEntitledForDelivery({ billingStatus: null, trialEnd: null, currentPeriodEnd: null })).toBe(false);
  });
});

describe("ENTITLED_FOR_DELIVERY_SQL", () => {
  it("requires billing_status in (trialing, active) and unexpired trial/period", () => {
    expect(ENTITLED_FOR_DELIVERY_SQL).toContain("s.billing_status IN ('trialing','active')");
    expect(ENTITLED_FOR_DELIVERY_SQL).toContain("s.trial_end IS NULL OR s.trial_end > NOW()");
    expect(ENTITLED_FOR_DELIVERY_SQL).toContain("s.current_period_end IS NULL OR s.current_period_end > NOW()");
  });
});