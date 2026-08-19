"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

const tiers = [
  {
    name: "Starter",
    price: 49,
    yearlyPrice: 39,
    description: "For solo contractors",
    features: [
      "1 city territory",
      "Building permit alerts",
      "Email notifications",
      "Basic territory mapping",
      "30-day free trial"
    ],
    tier: "starter",
    popular: false
  },
  {
    name: "Professional",
    price: 99,
    yearlyPrice: 79,
    description: "For growing businesses",
    features: [
      "Up to 3 city territories",
      "Building permits + business licenses",
      "Instant email alerts",
      "Advanced territory mapping",
      "Filing search tool",
      "Priority support"
    ],
    tier: "professional",
    popular: true
  },
  {
    name: "Enterprise",
    price: 249,
    yearlyPrice: 199,
    description: "For multi-location teams",
    features: [
      "Unlimited city territories",
      "All permit types",
      "Instant alerts + daily digest",
      "Team dashboard access",
      "API access",
      "Dedicated account manager",
      "Custom integrations"
    ],
    tier: "enterprise",
    popular: false
  }
];

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  async function handleSubscribe(tier: string) {
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: billingInterval })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
        setLoadingTier(null);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setLoadingTier(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4 py-12">
      <div className="w-full max-w-4xl">
        {/* Toggle */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <button
            onClick={() => setBillingInterval("monthly")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${billingInterval === "monthly" ? "bg-teal-700 text-white" : "text-stone-600 hover:text-stone-900"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingInterval("yearly")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${billingInterval === "yearly" ? "bg-teal-700 text-white" : "text-stone-600 hover:text-stone-900"}`}
          >
            Yearly <span className="ml-1 text-xs text-amber-600">Save 20%</span>
          </button>
        </div>

        {/* Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map(({ name, price, yearlyPrice, description, features, tier, popular }) => {
            const displayPrice = billingInterval === "yearly" ? yearlyPrice : price;
            const isLoading = loadingTier === tier;
            return (
              <div
                key={tier}
                className={`relative rounded-2xl border p-6 ${
                  popular
                    ? "border-teal-200 bg-white shadow-lg shadow-teal-100/50 ring-1 ring-teal-100"
                    : "border-stone-200 bg-white"
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-700 px-4 py-1 text-xs font-medium text-white">
                    Most popular
                  </div>
                )}
                <div className="text-sm font-medium text-stone-500">{name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-stone-950">${displayPrice}</span>
                  <span className="text-stone-500">/month</span>
                </div>
                {billingInterval === "yearly" && (
                  <p className="mt-1 text-xs text-stone-500">${displayPrice * 12}/year — save ${(price * 12) - (yearlyPrice * 12)}</p>
                )}
                <p className="mt-2 text-sm text-stone-600">{description}</p>
                <button
                  onClick={() => handleSubscribe(tier)}
                  disabled={isLoading}
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-medium transition ${
                    popular
                      ? "bg-teal-700 text-white hover:bg-teal-800"
                      : "border border-stone-200 text-stone-700 hover:bg-stone-50"
                  } disabled:opacity-50`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Start free trial"
                  )}
                </button>
                <ul className="mt-6 space-y-3">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-stone-600">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
