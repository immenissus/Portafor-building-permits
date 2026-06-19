"use client";

import { useMemo, useState } from "react";
import { BellRing, MapPinned } from "lucide-react";
import { AlertMapModal } from "@/components/map/alert-map-modal";
import { FilingBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriber } from "@/lib/use-subscriber";
import type { Alert } from "@/lib/types";
import { relativeTime, staticMapUrl } from "@/lib/utils";

export default function DashboardPage() {
  const [filter, setFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const subscriber = useSubscriber();
  const alerts = useMemo(() => {
    const items = subscriber.data?.recent_alerts ?? [];
    return filter === "all" ? items : items.filter((alert) => alert.filing_type === filter);
  }, [filter, subscriber.data]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-950">Recent alerts</h1>
          <p className="text-sm text-stone-600">Fresh permit and license matches for your territory.</p>
        </div>
        <Select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-56">
          <option value="all">All types</option>
          <option value="building_permit">Building permits</option>
          <option value="business_license">Business licenses</option>
        </Select>
      </div>

      {subscriber.isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="flex gap-4 p-4">
              <div className="flex-1 space-y-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-24" /></div>
              <Skeleton className="h-24 w-44" />
            </Card>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <Card className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
          <div className="mb-5 rounded-full bg-amber-100 p-5 text-amber-700"><BellRing className="h-10 w-10" /></div>
          <h2 className="text-xl font-semibold">No alerts yet - we&apos;re watching your territory</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">New government filings are checked on the backend poll schedule and will show up here when they match your service area.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {alerts.map((alert) => (
            <Card key={alert.id} className="grid gap-4 p-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-3">
                <FilingBadge type={alert.filing_type} />
                <div>
                  <p className="text-base font-medium text-stone-950">{alert.address}</p>
                  <p className="text-sm text-stone-500">{relativeTime(alert.filed_at)}</p>
                </div>
                <button onClick={() => setSelectedAlert(alert)} className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800">
                  <MapPinned className="h-4 w-4" /> View on map
                </button>
              </div>
              {staticMapUrl(alert.lng, alert.lat, 360, 200) ? (
                <img src={staticMapUrl(alert.lng, alert.lat, 360, 200)} alt="" className="h-[100px] w-full rounded-xl object-cover sm:w-[180px]" />
              ) : (
                <div className="h-[100px] rounded-xl bg-stone-100" />
              )}
            </Card>
          ))}
        </div>
      )}
      <AlertMapModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </section>
  );
}
