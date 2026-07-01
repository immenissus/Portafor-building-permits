"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, UserButton, useUser } from "@clerk/nextjs";
import { Bell, Bug, Map, Search, Settings, ShieldCheck, Table } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Alerts", icon: Bell },
  { href: "/dashboard/territory", label: "Territory", icon: Map },
  { href: "/dashboard/filings", label: "Search filings", icon: Search },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";

  return (
    <div className="min-h-screen bg-background text-stone-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-200 bg-white/90 px-4 py-5 shadow-tactile lg:flex lg:flex-col">
        <Link href="/dashboard" className="px-2 text-2xl font-semibold tracking-normal text-stone-950">
          Portafor
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", active ? "bg-teal-50 text-teal-800" : "text-stone-700 hover:bg-stone-100")}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin ? (
            <>
              <Link href="/admin" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", pathname === "/admin" ? "bg-teal-50 text-teal-800" : "text-stone-700 hover:bg-stone-100")}>
                <ShieldCheck className="h-4 w-4" />
                Admin
              </Link>
              <Link href="/admin/permits" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", pathname === "/admin/permits" ? "bg-teal-50 text-teal-800" : "text-stone-700 hover:bg-stone-100")}>
                <Table className="h-4 w-4" />
                Permits Data
              </Link>
              <Link href="/admin/debug" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", pathname === "/admin/debug" ? "bg-teal-50 text-teal-800" : "text-stone-700 hover:bg-stone-100")}>
                <Bug className="h-4 w-4" />
                Debug
              </Link>
            </>
          ) : null}
        </nav>
        <div className="flex items-center gap-3 border-t border-stone-200 pt-4">
          <UserButton afterSignOutUrl="/sign-in" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-900">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</p>
            <SignOutButton>
              <button className="text-sm text-stone-500 hover:text-teal-700">Sign out</button>
            </SignOutButton>
          </div>
        </div>
      </aside>
      <main className="pb-20 lg:ml-64 lg:pb-0">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-stone-200 bg-white lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} aria-label={item.label} className={cn("flex h-16 items-center justify-center", active ? "text-teal-700" : "text-stone-500")}>
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
