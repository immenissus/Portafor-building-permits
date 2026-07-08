"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

function SubscriptionGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const justCheckedOut = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!isLoaded) return;

    // Force JWT refresh on return from Stripe
    if (justCheckedOut && session) {
      session.reload();
    }

    const clerkPlan = user?.publicMetadata?.plan as string | undefined;
    const clerkStatus = user?.publicMetadata?.status as string | undefined;
    const clerkHasPlan = clerkPlan && clerkPlan !== "Free" && clerkStatus !== "past_due" && clerkStatus !== "canceled";

    // Just returned from checkout — allow immediately
    if (justCheckedOut) {
      setAllowed(true);
      return;
    }

    // Clerk JWT has a plan — allow immediately
    if (clerkHasPlan) {
      setAllowed(true);
      return;
    }

    // JWT might be stale — do ONE quick API check, then decide
    fetch("/api/billing/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const apiPlan = data?.plan as string | undefined;
        if (apiPlan && apiPlan !== "Free") {
          setAllowed(true);
          router.refresh();
        } else {
          // No active plan found — redirect to pricing
          router.replace("/pricing");
        }
      })
      .catch(() => {
        // API failed — let them through rather than blocking
        setAllowed(true);
      });
  }, [isLoaded]);

  // Still loading Clerk — show spinner
  if (!isLoaded || allowed === null) {
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
