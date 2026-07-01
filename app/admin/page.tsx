"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, createJurisdiction } from "@/lib/api";
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
};

export default function AdminPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isAdmin = user?.publicMetadata?.role === "admin";

  const jurisdictionsQuery = useQuery({
    queryKey: ["jurisdictions"],
    enabled: isAdmin,
    queryFn: async () => apiFetch<Jurisdiction[]>("/jurisdictions", await getTokenOrThrow(getToken), {}, { isApiKey: false })
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? ""
        },
        body: JSON.stringify({ skip_backfill: false })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to seed data");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jurisdictions"] });
      toast({ title: "Seed completed", description: `Created/updated ${data.jurisdictions?.length ?? 0} jurisdictions` });
    },
    onError: (error) => {
      toast({ title: "Seed failed", description: error instanceof Error ? error.message : undefined });
    }
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        name: form.get("name"),
        socrata_domain: form.get("socrata_domain"),
        resource_id: form.get("resource_id"),
        app_token: form.get("app_token"),
        column_field_map: JSON.parse(String(form.get("column_field_map") || "{}"))
      };
      await createJurisdiction(payload, await getTokenOrThrow(getToken), process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "");
      queryClient.invalidateQueries({ queryKey: ["jurisdictions"] });
      setOpen(false);
      toast({ title: "Jurisdiction added" });
    } catch (error) {
      toast({ title: "Something went wrong - try again", description: error instanceof Error ? error.message : undefined });
    }
  }

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

  const jurisdictions = jurisdictionsQuery.data ?? [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-950">Jurisdiction health</h1>
          <p className="text-sm text-stone-600">Feed sync status for Socrata data sources.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <Database className="h-4 w-4" /> {seedMutation.isPending ? "Seeding..." : "Seed Southern Cities"}
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add jurisdiction</Button>
        </div>
      </div>

      {jurisdictionsQuery.isLoading ? (
        <Card className="p-8 text-center text-stone-500">Loading jurisdictions...</Card>
      ) : jurisdictions.length === 0 ? (
        <Card className="p-8 text-center">
          <Database className="mx-auto h-10 w-10 text-stone-400" />
          <h2 className="mt-4 text-lg font-semibold">No jurisdictions configured</h2>
          <p className="mt-2 text-sm text-stone-600">Click &quot;Seed Southern Cities&quot; to add Austin TX, Orlando FL, and Collin County TX.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr><th className="p-3">Name</th><th className="p-3">Domain</th><th className="p-3">Last polled</th><th className="p-3">Last success</th><th className="p-3">Failures</th><th className="p-3">Ingested</th><th className="p-3">Quarantined</th></tr>
            </thead>
            <tbody>
              {jurisdictions.map((jur) => (
                <tr key={jur.id} className="border-b border-stone-100">
                  <td className="p-3 font-medium">{jur.name}</td>
                  <td className="p-3 text-xs text-stone-500">{jur.socrata_domain}</td>
                  <td className="p-3">{jur.last_polled_at ? new Date(jur.last_polled_at).toLocaleString() : "-"}</td>
                  <td className="p-3">{jur.last_success_at ? new Date(jur.last_success_at).toLocaleString() : "-"}</td>
                  <td className={`p-3 ${jur.consecutive_failures > 0 ? "font-medium text-red-700" : ""}`}>{jur.consecutive_failures}</td>
                  <td className="p-3">{jur.total_ingested}</td>
                  <td className={`p-3 ${jur.total_quarantined > 0 ? "font-medium text-amber-700" : ""}`}>{jur.total_quarantined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4">
          <Card className="w-full max-w-2xl p-5">
            <h2 className="text-lg font-semibold">Add jurisdiction</h2>
            <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Name</Label><Input name="name" required /></div>
              <div className="space-y-2"><Label>Socrata domain</Label><Input name="socrata_domain" required placeholder="data.city.gov" /></div>
              <div className="space-y-2"><Label>Resource ID</Label><Input name="resource_id" required /></div>
              <div className="space-y-2"><Label>App token</Label><Input name="app_token" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Column field map</Label><Textarea name="column_field_map" defaultValue={'{\n  "address": "address",\n  "filed_at": "filed_at"\n}'} /></div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button>Add jurisdiction</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
