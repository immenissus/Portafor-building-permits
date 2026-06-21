"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { upsertSubscriber } from "@/lib/api";
import { businessTypeLabel } from "@/lib/utils";
import { getTokenOrThrow, useSubscriber } from "@/lib/use-subscriber";
import type { BusinessType } from "@/lib/types";

export default function SettingsPage() {
  const subscriber = useSubscriber();
  const { user } = useUser();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("roofer");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [digest, setDigest] = useState("instant");
  const billing = useQuery({
    queryKey: ["billing-status"],
    queryFn: async () => fetch("/api/billing/status").then((response) => response.json())
  });

  useEffect(() => {
    if (!subscriber.data) return;
    setBusinessName(subscriber.data.business_name);
    setBusinessType(subscriber.data.business_type);
  }, [subscriber.data]);

  useEffect(() => {
    setEmailAlerts(localStorage.getItem("portafor.emailAlerts") !== "false");
    setDigest(localStorage.getItem("portafor.digest") ?? "instant");
  }, []);

  const [sendingTest, setSendingTest] = useState(false);

  async function sendTestAlert() {
    setSendingTest(true);
    try {
      const response = await fetch("/api/alerts/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to dispatch test alert");
      
      toast({
        title: "Test Alert Sent!",
        description: `A mock roofing lead alert has been dispatched to ${data.email}. Check your inbox!`
      });
    } catch (err) {
      toast({
        title: "Test Alert Failed",
        description: err instanceof Error ? err.message : "Something went wrong"
      });
    } finally {
      setSendingTest(false);
    }
  }

  function savePrefs(nextEmailAlerts = emailAlerts, nextDigest = digest) {
    localStorage.setItem("portafor.emailAlerts", String(nextEmailAlerts));
    localStorage.setItem("portafor.digest", nextDigest);
  }

  async function saveProfile() {
    if (!subscriber.data) return;
    try {
      await upsertSubscriber({
        business_name: businessName,
        business_type: businessType,
        filing_type_filters: subscriber.data.filing_type_filters,
        service_area: subscriber.data.service_area
      }, await getTokenOrThrow(getToken));
      await queryClient.invalidateQueries({ queryKey: ["subscriber"] });
      setEditing(false);
      toast({ title: "Profile updated" });
    } catch (error) {
      toast({ title: "Something went wrong - try again", description: error instanceof Error ? error.message : undefined });
    }
  }

  async function openBilling(path: string) {
    const response = await fetch(path, { method: "POST" });
    const data = await response.json();
    if (data.url) window.location.href = data.url;
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5 px-4 py-8 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-950">Settings</h1>
        <p className="text-sm text-stone-600">Profile, alerts, and billing for this workspace.</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Profile</h2>
          {!editing ? <button className="text-sm font-medium text-teal-700" onClick={() => setEditing(true)}>Edit</button> : null}
        </div>
        {editing ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Business name</Label><Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></div>
            <div className="space-y-2"><Label>Business type</Label><Select value={businessType} onChange={(event) => setBusinessType(event.target.value as BusinessType)}><option value="roofer">Roofer</option><option value="hvac">HVAC</option><option value="solar">Solar installer</option><option value="insurance">Insurance agent</option><option value="lawyer">Lawyer</option><option value="other">Other</option></Select></div>
            <Button onClick={saveProfile} className="sm:col-span-2"><Save className="h-4 w-4" /> Save profile</Button>
          </div>
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div><dt className="text-sm text-stone-500">Business</dt><dd className="font-medium">{subscriber.data?.business_name}</dd></div>
            <div><dt className="text-sm text-stone-500">Type</dt><dd className="font-medium">{businessTypeLabel(subscriber.data?.business_type ?? "")}</dd></div>
            <div><dt className="text-sm text-stone-500">Email</dt><dd className="font-medium">{user?.primaryEmailAddress?.emailAddress}</dd></div>
          </dl>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Notification preferences</h2>
        <p className="mt-1 text-sm text-stone-500">Saved on this device.</p>
        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <span><span className="block font-medium">Email alerts</span><span className="text-sm text-stone-500">Send a note when a filing matches.</span></span>
            <input type="checkbox" checked={emailAlerts} onChange={(event) => { setEmailAlerts(event.target.checked); savePrefs(event.target.checked, digest); }} className="h-5 w-5 accent-teal-700" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {["instant", "daily"].map((value) => (
              <label key={value} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <input type="radio" name="digest" checked={digest === value} onChange={() => { setDigest(value); savePrefs(emailAlerts, value); }} className="mr-2 accent-teal-700" />
                {value === "instant" ? "Instant" : "Daily digest"}
              </label>
            ))}
          </div>
          {emailAlerts && (
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                onClick={sendTestAlert}
                disabled={sendingTest || subscriber.isLoading}
              >
                {sendingTest ? "Sending Test..." : "Send Test Alert Email"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Billing</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div><p className="font-medium">{billing.data?.plan ?? "Free"} plan</p><p className="text-sm text-stone-500">{billing.data?.status ?? "active"}</p></div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => openBilling("/api/billing/portal")}><CreditCard className="h-4 w-4" /> Manage billing</Button>
            {billing.data?.plan === "Free" || !billing.data?.plan ? <Button onClick={() => openBilling("/api/billing/checkout")}>Upgrade</Button> : null}
          </div>
        </div>
      </Card>
    </section>
  );
}
