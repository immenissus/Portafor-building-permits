"use client";

import { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { getTokenOrThrow } from "@/lib/use-subscriber";

type Jurisdiction = {
  id: string;
  name: string;
};

type Permit = {
  id: string;
  external_id: string;
  filing_type: string;
  address: string;
  filed_at: string;
  latitude: number;
  longitude: number;
  jurisdiction: string;
};

type PermitsResponse = {
  total: number;
  limit: number;
  offset: number;
  permits: Permit[];
};

export default function AdminPermitsPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 50;
  const isAdmin = user?.publicMetadata?.role === "admin" || Boolean(process.env.NEXT_PUBLIC_ADMIN_API_KEY);

  const jurisdictionsQuery = useQuery({
    queryKey: ["jurisdictions"],
    enabled: isAdmin,
    queryFn: async () => apiFetch<Jurisdiction[]>("/jurisdictions", await getTokenOrThrow(getToken), {}, { isApiKey: false })
  });

  const permitsQuery = useQuery({
    queryKey: ["admin-permits", selectedJurisdiction, page],
    enabled: isAdmin && Boolean(selectedJurisdiction),
    queryFn: async () => {
      const params = new URLSearchParams({
        jurisdiction_id: selectedJurisdiction,
        limit: String(limit),
        offset: String(page * limit)
      });
      return apiFetch<PermitsResponse>(`/admin/permits?${params.toString()}`, await getTokenOrThrow(getToken), {}, { isApiKey: false });
    }
  });

  async function downloadCSV() {
    if (!selectedJurisdiction) return;
    const token = await getTokenOrThrow(getToken);
    const params = new URLSearchParams({
      jurisdiction_id: selectedJurisdiction,
      format: "csv"
    });
    const response = await fetch(`/api/admin/permits?${params.toString()}`, {
      headers: { "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "" }
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `permits-${selectedJurisdiction}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
  const permits = permitsQuery.data?.permits ?? [];
  const total = permitsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-950">Permits by Territory</h1>
          <p className="text-sm text-stone-600">View and export building permit data for each jurisdiction.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedJurisdiction}
            onChange={(e) => { setSelectedJurisdiction(e.target.value); setPage(0); }}
            className="w-64"
          >
            <option value="">Select a territory...</option>
            {jurisdictions.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </Select>
          {selectedJurisdiction && (
            <Button variant="secondary" onClick={downloadCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {!selectedJurisdiction ? (
        <Card className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <Table className="mb-5 h-10 w-10 text-stone-400" />
          <h2 className="text-xl font-semibold">Select a territory</h2>
          <p className="mt-2 max-w-md text-sm text-stone-600">Choose a jurisdiction from the dropdown above to view its permits.</p>
        </Card>
      ) : permitsQuery.isLoading ? (
        <Card className="p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : permits.length === 0 ? (
        <Card className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <Table className="mb-5 h-10 w-10 text-stone-400" />
          <h2 className="text-xl font-semibold">No permits found</h2>
          <p className="mt-2 max-w-md text-sm text-stone-600">This jurisdiction has no permits yet. Run a backfill to import historical data.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between text-sm text-stone-600">
            <span>Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total.toLocaleString()} permits</span>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                <tr>
                  <th className="p-3">Permit ID</th>
                  <th className="p-3">Address</th>
                  <th className="p-3">Filed</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Lat</th>
                  <th className="p-3">Lng</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((permit) => (
                  <tr key={permit.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="p-3 font-mono text-xs">{permit.external_id}</td>
                    <td className="p-3">{permit.address}</td>
                    <td className="p-3">{new Date(permit.filed_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                        {permit.filing_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-stone-500">{permit.latitude?.toFixed(6)}</td>
                    <td className="p-3 text-xs text-stone-500">{permit.longitude?.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-stone-600">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
