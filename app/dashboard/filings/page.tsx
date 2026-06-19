"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LocateFixed, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FilingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { filingSearchSchema } from "@/lib/schemas";
import type { Filing } from "@/lib/types";
import { geocodeAddress, searchFilings } from "@/lib/api";
import { useApiKey } from "@/lib/use-subscriber";

const FilingsMap = dynamic(() => import("@/components/map/filings-map").then((module) => module.FilingsMap), { ssr: false });

type FormValues = z.infer<typeof filingSearchSchema>;

export default function FilingsPage() {
  const apiKey = useApiKey();
  const { toast } = useToast();
  const [filings, setFilings] = useState<Filing[]>([]);
  const [center, setCenter] = useState<[number, number]>([-98.5795, 39.8283]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(filingSearchSchema),
    defaultValues: { address: "", radiusKm: 5, type: "all" }
  });
  const radius = form.watch("radiusKm");

  async function submit(values: FormValues) {
    setLoading(true);
    try {
      if (!apiKey) throw new Error("API Key is missing. Please sign in again or onboard.");
      const point = await geocodeAddress(values.address);
      setCenter([point.lng, point.lat]);
      setFilings(await searchFilings({ ...point, radiusKm: values.radiusKm, type: values.type }, apiKey));
    } catch (error) {
      toast({ title: "Something went wrong - try again", description: error instanceof Error ? error.message : undefined });
    } finally {
      setLoading(false);
    }
  }

  function useLocation() {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCenter([point.lng, point.lat]);
        form.setValue("address", "Current location");
        try {
          if (!apiKey) throw new Error("API Key is missing. Please sign in again or onboard.");
          setFilings(await searchFilings({ ...point, radiusKm: form.getValues("radiusKm"), type: form.getValues("type") }, apiKey));
        } catch (error) {
          toast({ title: "Something went wrong - try again", description: error instanceof Error ? error.message : undefined });
        }
      },
      () => toast({ title: "Location unavailable", description: "Search by address instead and we will center the map there." })
    );
  }

  return (
    <section className="grid min-h-screen gap-4 p-4 lg:grid-cols-[380px_1fr] lg:p-8">
      <Card className="flex min-h-0 flex-col p-5">
        <h1 className="text-2xl font-semibold text-stone-950">Search filings</h1>
        <form onSubmit={form.handleSubmit(submit)} className="mt-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <div className="flex gap-2">
              <Input id="address" {...form.register("address")} placeholder="123 Main St" />
              <Button type="button" variant="secondary" size="icon" onClick={useLocation} aria-label="Use my location">
                <LocateFixed className="h-4 w-4" />
              </Button>
            </div>
            <FieldError>{form.formState.errors.address?.message}</FieldError>
          </div>
          <div className="space-y-2">
            <Label htmlFor="radiusKm">Radius: {radius} km</Label>
            <input id="radiusKm" type="range" min="1" max="25" {...form.register("radiusKm", { valueAsNumber: true })} className="w-full accent-teal-700" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Filing type</Label>
            <Select id="type" {...form.register("type")}>
              <option value="all">All</option>
              <option value="building_permit">Building permits</option>
              <option value="business_license">Business licenses</option>
            </Select>
          </div>
          <Button className="w-full" disabled={loading}>
            <Search className="h-4 w-4" /> {loading ? "Searching..." : "Search"}
          </Button>
        </form>
        <div className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {filings.map((filing) => (
            <button key={filing.id} onMouseEnter={() => setHighlightedId(filing.id)} onMouseLeave={() => setHighlightedId(null)} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-left hover:border-teal-700">
              <FilingBadge type={filing.filing_type} />
              <p className="mt-2 text-sm font-medium text-stone-950">{filing.address}</p>
              <p className="text-xs text-stone-500">{new Date(filing.filed_at).toLocaleDateString()}</p>
            </button>
          ))}
        </div>
      </Card>
      <FilingsMap filings={filings} center={center} highlightedId={highlightedId} />
    </section>
  );
}
