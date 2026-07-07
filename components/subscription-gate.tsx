"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

function SubscriptionGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const [allowed, setAllowed] = useState(false);

  const plan = user?.publicMetadata?.plan as string | undefined;
  const status = user?.publicMetadata?.status as string | undefined;
  const hasActivePlan = plan && plan !== "Free" && status !== "past_due" && status !== "canceled";
  const justCheckedOut = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!isLoaded) return;

    // If just came from Stripe checkout, save to localStorage and allow
    if (justCheckedOut) {
      localStorage.setItem("portafor_checkout_success", Date.now().toString());
      setAllowed(true);
      return;
    }

    // Check if we recently checked out (within last 5 minutes)
    const checkoutTime = localStorage.getItem("portafor_checkout_success");
    if (checkoutTime) {
      const elapsed = Date.now() - parseInt(checkoutTime);
      if (elapsed < 5 * 60 * 1000) {
        setAllowed(true);
        return;
      }
      // Expired — remove it
      localStorage.removeItem("portafor_checkout_success");
    }

    if (hasActivePlan) {
      setAllowed(true);
    } else {
      router.replace("/pricing");
    }
  }, [isLoaded, hasActivePlan, justCheckedOut, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-teal-700" />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-teal-700" />
      </div>
    }>
      <SubscriptionGateInner>{children}</SubscriptionGateInner>
    </Suspense>
  );
}
