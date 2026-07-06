"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

function SubscriptionGateInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const [allowed, setAllowed] = useState(false);

  const hasActivePlan = user?.publicMetadata?.plan && user.publicMetadata.plan !== "Free";
  const justCheckedOut = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!isLoaded) return;

    if (hasActivePlan || justCheckedOut) {
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
