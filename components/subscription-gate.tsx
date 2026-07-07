"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 10;

function SubscriptionGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const [allowed, setAllowed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pollCountRef = useRef(0);
  const resolvedRef = useRef(false);

  const clerkPlan = user?.publicMetadata?.plan as string | undefined;
  const clerkStatus = user?.publicMetadata?.status as string | undefined;
  const clerkHasPlan = clerkPlan && clerkPlan !== "Free" && clerkStatus !== "past_due" && clerkStatus !== "canceled";
  const justCheckedOut = searchParams.get("checkout") === "success";

  // Force Clerk JWT refresh on return from Stripe
  useEffect(() => {
    if (justCheckedOut && session) {
      session.reload();
    }
  }, [justCheckedOut, session]);

  // Primary source of truth: always query the billing API
  const checkBillingApi = useCallback(async (): Promise<{ plan: string; hasPlan: boolean }> => {
    try {
      const res = await fetch("/api/billing/status");
      if (!res.ok) return { plan: "Free", hasPlan: false };
      const data = await res.json();
      const plan = data.plan as string | undefined;
      return { plan: plan || "Free", hasPlan: Boolean(plan && plan !== "Free") };
    } catch {
      return { plan: "Free", hasPlan: false };
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || resolvedRef.current) return;

    // Immediately allow if just returned from checkout
    if (justCheckedOut) {
      resolvedRef.current = true;
      setAllowed(true);
      return;
    }

    // If Clerk JWT already shows a plan, trust it
    if (clerkHasPlan) {
      resolvedRef.current = true;
      setAllowed(true);
      return;
    }

    // JWT is stale — poll the billing API to check if the webhook completed
    if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
      pollCountRef.current += 1;
      const timer = setTimeout(async () => {
        const { hasPlan } = await checkBillingApi();
        if (hasPlan) {
          resolvedRef.current = true;
          setAllowed(true);
          // Refresh so Clerk picks up the new metadata
          router.refresh();
        } else if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
          // Exhausted polling — redirect to pricing
          resolvedRef.current = true;
          router.replace("/pricing");
        }
      }, POLL_INTERVAL_MS);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, clerkHasPlan, justCheckedOut, router, checkBillingApi]);

  // Mark hydrated
  useEffect(() => {
    if (isLoaded) setHydrated(true);
  }, [isLoaded]);

  if (!hydrated) {
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
