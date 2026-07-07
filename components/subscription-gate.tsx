"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15;

function SubscriptionGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const [allowed, setAllowed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

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

  // Main gate logic
  useEffect(() => {
    if (!isLoaded) return;

    // Just returned from Stripe — allow immediately
    if (justCheckedOut) {
      setAllowed(true);
      return;
    }

    // Clerk JWT already has a plan — allow
    if (clerkHasPlan) {
      setAllowed(true);
      return;
    }

    // JWT is stale — start polling the billing API
    async function checkBilling() {
      try {
        const res = await fetch("/api/billing/status");
        if (!res.ok) return false;
        const data = await res.json();
        return Boolean(data.plan && data.plan !== "Free");
      } catch {
        return false;
      }
    }

    // Check immediately (first poll)
    checkBilling().then((hasPlan) => {
      if (hasPlan) {
        setAllowed(true);
        router.refresh();
      }
    });

    // Set up interval polling
    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;
      const hasPlan = await checkBilling();
      if (hasPlan) {
        if (pollRef.current) clearInterval(pollRef.current);
        setAllowed(true);
        router.refresh();
      } else if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        router.replace("/pricing");
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLoaded, clerkHasPlan, justCheckedOut, router]);

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
