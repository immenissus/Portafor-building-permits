"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { upsertSubscriber, geocodeAddress } from "@/lib/api";
import type { ServiceArea } from "@/lib/types";
import { createCirclePolygon } from "@/lib/utils";
import { getTokenOrThrow, useSubscriber } from "@/lib/use-subscriber";

const DrawMap = dynamic(() => import("@/components/map/draw-map").then((module) => module.DrawMap), { ssr: false });

export default function TerritoryPage() {
  const subscriber = useSubscriber();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ServiceArea | null>(null);
  const serviceArea = subscriber.data?.service_area ?? null;

  const [drawMode, setDrawMode] = useState<"custom" | "circle">("circle");
  const [circleCenterAddress, setCircleCenterAddress] = useState("");
  const [circleCenterCoords, setCircleCenterCoords] = useState<[number, number] | null>(null);
  const [circleRadius, setCircleRadius] = useState(10);
  const [geocodingCircle, setGeocodingCircle] = useState(false);

  // Initialize values when subscriber data loads
  useEffect(() => {
    if (subscriber.data) {
      setCircleRadius(subscriber.data.radius_km || 10);
    }
  }, [subscriber.data]);

  async function searchCircleCenter() {
    if (!circleCenterAddress) return;
    setGeocodingCircle(true);
    try {
      const coords = await geocodeAddress(circleCenterAddress);
      setCircleCenterCoords([coords.lng, coords.lat]);
      const circlePolygon = createCirclePolygon([coords.lng, coords.lat], circleRadius);
      setDraft(circlePolygon);
    } catch (err) {
      toast({ title: "Address not found", description: err instanceof Error ? err.message : undefined });
    } finally {
      setGeocodingCircle(false);
    }
  }

  function updateCircleRadius(radius: number) {
    setCircleRadius(radius);
    const center = circleCenterCoords || [-97.7431, 30.2672]; // Fallback to Austin, TX
    if (!circleCenterCoords) {
      setCircleCenterCoords(center);
    }
    const circlePolygon = createCirclePolygon(center, radius);
    setDraft(circlePolygon);
  }

  function handleMapClick(coords: [number, number]) {
    if (!editing || drawMode !== "circle") return;
    setCircleCenterCoords(coords);
    setCircleCenterAddress(`Map selection: ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`);
    const circlePolygon = createCirclePolygon(coords, circleRadius);
    setDraft(circlePolygon);
  }

  async function save() {
    if (!subscriber.data || !draft) return;
    try {
      await upsertSubscriber({
        business_name: subscriber.data.business_name,
        business_type: subscriber.data.business_type,
        filing_type_filters: subscriber.data.filing_type_filters,
        service_area: draft
      }, await getTokenOrThrow(getToken));
      await queryClient.invalidateQueries({ queryKey: ["subscriber"] });
      setEditing(false);
      toast({ title: "Territory saved", description: "We will use this boundary for future matches." });
    } catch (error) {
      toast({ title: "Something went wrong - try again", description: error instanceof Error ? error.message : undefined });
    }
  }

  return (
    <section className="flex h-screen flex-col px-4 py-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-950">Territory</h1>
          <p className="text-sm text-stone-600">Keep your service area tuned to where you actually work.</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => { setDraft(serviceArea); setEditing(false); }}><X className="h-4 w-4" /> Cancel</Button>
              <Button onClick={save} disabled={!draft}><Check className="h-4 w-4" /> Save</Button>
            </>
          ) : (
            <Button onClick={() => { setDraft(serviceArea); setEditing(true); }}><Pencil className="h-4 w-4" /> Edit territory</Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-4 space-y-4">
          <div className="flex border-b border-stone-200">
            <button
              type="button"
              onClick={() => { setDrawMode("custom"); setDraft(null); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${drawMode === "custom" ? "border-teal-700 text-teal-700 font-semibold" : "border-transparent text-stone-500 hover:text-stone-700"}`}
            >
              Draw Custom Shape
            </button>
            <button
              type="button"
              onClick={() => { setDrawMode("circle"); setDraft(null); setCircleCenterCoords(null); setCircleCenterAddress(""); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${drawMode === "circle" ? "border-teal-700 text-teal-700 font-semibold" : "border-transparent text-stone-500 hover:text-stone-700"}`}
            >
              Circular Service Radius
            </button>
          </div>

          {drawMode === "circle" ? (
            <Card className="p-4 bg-stone-50 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="circleAddress">1. Enter center address (or click map to place)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="circleAddress"
                      value={circleCenterAddress}
                      onChange={(e) => setCircleCenterAddress(e.target.value)}
                      placeholder="e.g. 1100 Congress Ave, Austin, TX"
                    />
                    <Button type="button" onClick={searchCircleCenter} disabled={geocodingCircle}>
                      {geocodingCircle ? "Searching..." : "Search"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radiusSlider">2. Service Radius: {circleRadius} km</Label>
                  <div className="flex items-center gap-4">
                    <input
                      id="radiusSlider"
                      type="range"
                      min="1"
                      max="100"
                      value={circleRadius}
                      onChange={(e) => updateCircleRadius(Number(e.target.value))}
                      className="w-full accent-teal-700 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-medium text-stone-600 w-12">{circleRadius} km</span>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <p className="text-sm text-stone-500 bg-stone-50 p-3 rounded-lg border border-stone-200">
              Click on the map to place vertices for your custom territory. Click your very first point to close and save the shape.
            </p>
          )}
        </div>
      )}

      <DrawMap
        key={editing ? `edit-${drawMode}` : "view"}
        value={editing ? draft : serviceArea}
        onChange={setDraft}
        onMapClick={handleMapClick}
        editable={editing}
        drawMode={editing ? drawMode : "circle"}
        className="min-h-0 flex-1 rounded-xl border border-stone-200"
      />
    </section>
  );
}
