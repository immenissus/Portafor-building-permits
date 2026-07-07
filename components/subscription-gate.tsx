"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

const CHECKOUT_GRACE_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000; // poll every 2s while waiting for webhook
const MAX_POLL_ATTEMPTS = 15; // max 30s of polling

function SubscriptionGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const [allowed, setAllowed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pollCountRef = useRef(0);

  const plan = user?.publicMetadata?.plan as string | undefined;
  const status = user?.publicMetadata?.status as string | undefined;
  const hasActivePlan = plan && plan !== "Free" && status !== "past_due" && status !== "canceled";
  const justCheckedOut = searchParams.get("checkout") === "success";

  // Bug D fix: Force Clerk JWT refresh immediately on return from Stripe
  useEffect(() => {
    if (justCheckedOut && session) {
      session.reload();
    }
  }, [justCheckedOut, session]);

  // Bug C fix: Poll billing status API as fallback while webhook processes
  const pollBillingStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/billing/status");
      if (!res.ok) return false;
      const data = await res.json();
      return data.plan && data.plan !== "Free";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    // If just came from Stripe checkout, allow immediately and persist
    if (justCheckedOut) {
      localStorage.setItem("portafor_checkout_success", Date.now().toString());
      setAllowed(true);
      return;
    }

    // Check if we recently checked out (within grace window)
    const checkoutTime = localStorage.getItem("portafor_checkout_success");
    if (checkoutTime) {
      const elapsed = Date.now() - parseInt(checkoutTime);
      if (elapsed < CHECKOUT_GRACE_MS) {
        setAllowed(true);

        // Also poll to confirm webhook completed, then stop using localStorage
        if (!hasActivePlan && pollCountRef.current < MAX_POLL_ATTEMPTS) {
          pollCountRef.current += 1;
          const timer = setTimeout(async () => {
            const confirmed = await pollBillingStatus();
            if (confirmed) {
              localStorage.removeItem("portafor_checkout_success");
              // Force a fresh render so Clerk picks up the new metadata
              router.refresh();
            }
          }, POLL_INTERVAL_MS);
          return () => clearTimeout(timer);
        }

        // Grace window expired or polling exhausted — fall through
        localStorage.removeItem("portafor_checkout_success");
      } else {
        localStorage.removeItem("portafor_checkout_success");
      }
    }

    if (hasActivePlan) {
      setAllowed(true);
    } else {
      router.replace("/pricing");
    }
  }, [isLoaded, hasActivePlan, justCheckedOut, router, pollBillingStatus]);

  // Mark hydrated so we don't flash-redirect before Clerk loads
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
