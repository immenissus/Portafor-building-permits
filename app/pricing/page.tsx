"use client";

import { useRouter } from "next/navigation";
import { PricingTable } from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, CheckCircle, Mail, Map, Search, Shield, Zap } from "lucide-react";
import Link from "next/link";

export default function PricingPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const hasActivePlan = user?.publicMetadata?.plan && user.publicMetadata.plan !== "Free";

  // If user already has a plan, redirect to dashboard
  if (isLoaded && hasActivePlan) {
    router.replace("/dashboard");
    return null;
  }

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      {/* Simple nav */}
      <nav className="border-b border-stone-200/60 bg-[#FAFAF8]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/" className="text-xl font-semibold text-stone-950">Portafor</Link>
          <Link href="/sign-in" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">
            Log in
          </Link>
        </div>
      </nav>

      <div className="px-4 py-12 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-semibold text-stone-950 sm:text-4xl">
              Choose your plan
            </h1>
            <p className="mt-3 text-lg text-stone-600">
              Start your 30-day free trial. Cancel anytime.
            </p>
          </div>

          {/* What you get */}
          <div className="mb-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Map, title: "Territory mapping", desc: "Draw your exact service area" },
              { icon: Search, title: "Filing search", desc: "Find permits near any address" },
              { icon: Mail, title: "Email alerts", desc: "Get notified of new permits" }
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-900">{title}</p>
                  <p className="text-xs text-stone-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Clerk PricingTable */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <PricingTable />
          </div>

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 transition">
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
