"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const hasActivePlan = user?.publicMetadata?.plan && user.publicMetadata.plan !== "Free";

  useEffect(() => {
    if (isLoaded && !hasActivePlan) {
      router.replace("/pricing");
    }
  }, [isLoaded, hasActivePlan, router]);

  // Don't render anything until we know the user's plan status
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-teal-700" />
      </div>
    );
  }

  // If no plan, show nothing (will redirect)
  if (!hasActivePlan) {
    return null;
  }

  return <>{children}</>;
}
