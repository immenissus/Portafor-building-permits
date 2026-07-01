"use client";

import { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Database, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { getTokenOrThrow } from "@/lib/use-subscriber";

type Jurisdiction = {
  id: string;
  name: string;
  socrata_domain: string;
  resource_id: string;
  is_active: boolean;
  last_polled_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  total_ingested: number;
  total_quarantined: number;
  watermark_datetime: string | null;
};

type DebugInfo = {
  jurisdictions: Jurisdiction[];
  filingCounts: Record<string, number>;
  quarantinedCounts: Record<string, number>;
  totalSubscribers: number;
  totalAlerts: number;
  sampleFilings: any[];
};

export default function AdminDebugPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.publicMetadata?.role === "admin" || Boolean(process.env.NEXT_PUBLIC_ADMIN_API_KEY);

  const [backfillStartDate, setBackfillStartDate] = useState("2025-06-01");

  const debugQuery = useQuery({
    queryKey: ["debug-info"],
    enabled: isAdmin,
    queryFn: async () => {
      const token = await getTokenOrThrow(getToken);
      const jurs = await apiFetch<Jurisdiction[]>("/jurisdictions", token, {}, { isApiKey: false });

      const filingCounts: Record<string, number> = {};
      const quarantinedCounts: Record<string, number> = {};

      for (const j of jurs) {
        const permitsRes = await fetch(`/api/admin/permits?jurisdiction_id=${j.id}&limit=1`, {
          headers: { "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "" }
        });
        if (permitsRes.ok) {
          const data = await permitsRes.json();
          filingCounts[j.id] = data.total ?? 0;
        }
      }

      const sampleRes = await fetch("/api/admin/permits?jurisdiction_id=" + (jurs[0]?.id ?? "") + "&limit=3", {
        headers: { "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "" }
      });
      const sampleData = sampleRes.ok ? await sampleRes.json() : { permits: [] };

      return {
        jurisdictions: jurs,
        filingCounts,
        quarantinedCounts: {},
        totalSubscribers: 0,
        totalAlerts: 0,
        sampleFilings: sampleData.permits ?? []
      };
    }
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Seed failed");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["debug-info"] });
      toast({ title: "Seed complete", description: `${data.results?.length ?? 0} jurisdictions processed` });
    },
    onError: (e) => toast({ title: "Seed failed", description: e instanceof Error ? e.message : String(e) })
  });

  const backfillMutation = useMutation({
    mutationFn: async (jurisdictionId: string) => {
      const res = await fetch("/api/jobs/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "" },
        body: JSON.stringify({ jurisdiction_id: jurisdictionId, start_date: `${backfillStartDate}T00:00:00` })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Backfill failed");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["debug-info"] });
      toast({ title: "Backfill complete", description: `${data.totalIngested ?? 0} permits ingested for ${data.jurisdiction ?? ""}` });
    },
    onError: (e) => toast({ title: "Backfill failed", description: e instanceof Error ? e.message : String(e) })
  });

  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jobs/poll");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Poll failed");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["debug-info"] });
      toast({ title: "Poll complete", description: `Processed ${data.jurisdictionsProcessed ?? 0} jurisdictions, ${data.totalNewFilings ?? 0} new filings` });
    },
    onError: (e) => toast({ title: "Poll failed", description: e instanceof Error ? e.message : String(e) })
  });

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-700" />
          <h1 className="mt-4 text-xl font-semibold">Admin access required</h1>
        </Card>
      </section>
    );
  }

  const info = debugQuery.data;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-950">Debug Dashboard</h1>
          <p className="text-sm text-stone-600">Inspect database state and trigger operations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => debugQuery.refetch()} disabled={debugQuery.isLoading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <Database className="h-4 w-4" /> {seedMutation.isPending ? "Seeding..." : "Seed Jurisdictions"}
          </Button>
          <Button onClick={() => pollMutation.mutate()} disabled={pollMutation.isPending}>
            <Zap className="h-4 w-4" /> {pollMutation.isPending ? "Polling..." : "Run Poll"}
          </Button>
        </div>
      </div>

      {debugQuery.isLoading ? (
        <Card className="p-8 text-center text-stone-500">Loading debug info...</Card>
      ) : !info ? (
        <Card className="p-8 text-center text-stone-500">Failed to load debug info</Card>
      ) : (
        <div className="space-y-6">
          {/* Jurisdictions */}
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Jurisdictions ({info.jurisdictions.length})</h2>
            {info.jurisdictions.length === 0 ? (
              <p className="text-sm text-stone-500">No jurisdictions found. Click &quot;Seed Jurisdictions&quot; to create them.</p>
            ) : (
              <div className="space-y-3">
                {info.jurisdictions.map((j) => (
                  <div key={j.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-stone-200 p-4">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        {j.is_active ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                        <span className="font-medium">{j.name}</span>
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        Domain: {j.socrata_domain} | Resource: {j.resource_id}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        Filings: {info.filingCounts[j.id] ?? "?"} | Ingested: {j.total_ingested} | Quarantined: {j.total_quarantined}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        Last polled: {j.last_polled_at ? new Date(j.last_polled_at).toLocaleString() : "Never"}
                        {j.watermark_datetime ? ` | Watermark: ${new Date(j.watermark_datetime).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => backfillMutation.mutate(j.id)}
                      disabled={backfillMutation.isPending}
                    >
                      {backfillMutation.isPending ? "Backfilling..." : "Backfill"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Backfill config */}
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Backfill Settings</h2>
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label>Start date for backfill</Label>
                <Input
                  type="date"
                  value={backfillStartDate}
                  onChange={(e) => setBackfillStartDate(e.target.value)}
                  className="w-48"
                />
              </div>
              <p className="text-sm text-stone-500 mt-5">Permits from this date onward will be imported when you click &quot;Backfill&quot; on a jurisdiction.</p>
            </div>
          </Card>

          {/* Quick SQL */}
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Quick SQL for Supabase</h2>
            <pre className="overflow-x-auto rounded-lg bg-stone-900 p-4 text-sm text-stone-100">
{`-- Permits per city
SELECT j.name, count(*) as total
FROM filings f JOIN jurisdictions j ON f.jurisdiction_id = j.id
GROUP BY j.name;

-- Austin permits (export as CSV in Supabase)
SELECT f.external_id, f.address_raw, f.filed_at,
       ST_Y(f.geom::geometry) as lat, ST_X(f.geom::geometry) as lng
FROM filings f JOIN jurisdictions j ON f.jurisdiction_id = j.id
WHERE j.name = 'Austin, TX'
ORDER BY f.filed_at DESC;

-- Orlando permits
SELECT f.external_id, f.address_raw, f.filed_at,
       ST_Y(f.geom::geometry) as lat, ST_X(f.geom::geometry) as lng
FROM filings f JOIN jurisdictions j ON f.jurisdiction_id = j.id
WHERE j.name = 'Orlando, FL'
ORDER BY f.filed_at DESC;

-- Check quarantined records
SELECT j.name, q.error_log, q.created_at
FROM quarantined_filings q JOIN jurisdictions j ON q.jurisdiction_id = j.id
ORDER BY q.created_at DESC LIMIT 20;`}
            </pre>
          </Card>

          {/* Sample filings */}
          {info.sampleFilings.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-4 text-lg font-semibold">Sample Filings</h2>
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 text-left text-stone-600">
                  <tr><th className="p-2">ID</th><th className="p-2">Address</th><th className="p-2">Filed</th></tr>
                </thead>
                <tbody>
                  {info.sampleFilings.map((f: any) => (
                    <tr key={f.id} className="border-b border-stone-100">
                      <td className="p-2 font-mono text-xs">{f.external_id}</td>
                      <td className="p-2">{f.address}</td>
                      <td className="p-2">{f.filed_at ? new Date(f.filed_at).toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
