"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { SubscriptionGate } from "@/components/subscription-gate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubscriptionGate>
      <DashboardShell>{children}</DashboardShell>
    </SubscriptionGate>
  );
}
