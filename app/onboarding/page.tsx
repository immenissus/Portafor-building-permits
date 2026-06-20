"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { upsertSubscriber, geocodeAddress } from "@/lib/api";
import { subscriberSchema } from "@/lib/schemas";
import type { ServiceArea } from "@/lib/types";
import { businessTypeLabel, staticPolygonUrl, createCirclePolygon } from "@/lib/utils";
import { getTokenOrThrow } from "@/lib/use-subscriber";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const DrawMap = dynamic(() => import("@/components/map/draw-map").then((module) => module.DrawMap), { ssr: false });

type FormValues = z.infer<typeof subscriberSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [serviceArea, setServiceArea] = useState<ServiceArea | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [drawMode, setDrawMode] = useState<"custom" | "circle">("custom");
  const [circleCenterAddress, setCircleCenterAddress] = useState("");
  const [circleCenterCoords, setCircleCenterCoords] = useState<[number, number] | null>(null);
  const [circleRadius, setCircleRadius] = useState(10);
  const [geocodingCircle, setGeocodingCircle] = useState(false);

  async function searchCircleCenter() {
    if (!circleCenterAddress) return;
    setGeocodingCircle(true);
    try {
      const coords = await geocodeAddress(circleCenterAddress);
      setCircleCenterCoords([coords.lng, coords.lat]);
      const circlePolygon = createCirclePolygon([coords.lng, coords.lat], circleRadius);
      setServiceArea(circlePolygon);
    } catch (err) {
      toast({ title: "Address not found", description: err instanceof Error ? err.message : undefined });
    } finally {
      setGeocodingCircle(false);
    }
  }

  function updateCircleRadius(radius: number) {
    setCircleRadius(radius);
    const center = circleCenterCoords || [-97.7431, 30.2672]; // Default Austin center
    if (!circleCenterCoords) {
      setCircleCenterCoords(center);
    }
    const circlePolygon = createCirclePolygon(center, radius);
    setServiceArea(circlePolygon);
  }

  function handleMapClick(coords: [number, number]) {
    if (drawMode !== "circle") return;
    setCircleCenterCoords(coords);
    setCircleCenterAddress(`Map selection: ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`);
    const circlePolygon = createCirclePolygon(coords, circleRadius);
    setServiceArea(circlePolygon);
  }
  const form = useForm<FormValues>({
    resolver: zodResolver(subscriberSchema),
    defaultValues: {
      business_name: "",
      business_type: "roofer",
      filing_type_filters: ["building_permit", "business_license"]
    }
  });
  const values = form.watch();
  const previewUrl = useMemo(() => serviceArea ? staticPolygonUrl(serviceArea) : "", [serviceArea]);

  async function continueFromDetails() {
    const valid = await form.trigger();
    if (valid) setStep(2);
  }

  async function activate() {
    if (!serviceArea) return;
    setSubmitting(true);
    try {
      const subscriber = await upsertSubscriber({ ...form.getValues(), service_area: serviceArea }, await getTokenOrThrow(getToken));
      await user?.update({ 
        unsafeMetadata: { 
          ...user.unsafeMetadata, 
          subscriberId: subscriber.id,
          apiKey: subscriber.api_key 
        } 
      });
      router.replace("/dashboard");
    } catch (error) {
      toast({ title: "Something went wrong - try again", description: error instanceof Error ? error.message : undefined });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-stone-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <p className="text-2xl font-semibold text-stone-950">Portafor</p>
          <div className="flex gap-2">
            {[1, 2, 3].map((item) => (
              <span key={item} className={`rounded-full px-3 py-1 text-sm font-medium ${step >= item ? "bg-teal-700 text-white" : "bg-stone-200 text-stone-600"}`}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {step === 1 ? (
          <Card className="mx-auto max-w-2xl p-6">
            <h1 className="text-2xl font-semibold">Tell us what to watch</h1>
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="business_name">Business name</Label>
                <Input id="business_name" {...form.register("business_name")} />
                <FieldError>{form.formState.errors.business_name?.message}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_type">Business type</Label>
                <Select id="business_type" {...form.register("business_type")}>
                  <option value="roofer">Roofer</option>
                  <option value="hvac">HVAC</option>
                  <option value="solar">Solar installer</option>
                  <option value="insurance">Insurance agent</option>
                  <option value="lawyer">Lawyer</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div className="space-y-3">
                <Label>Filing types to watch</Label>
                {[
                  ["building_permit", "Building permits"],
                  ["business_license", "Business licenses"]
                ].map(([value, label]) => (
                  <label key={value} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
                    <input type="checkbox" value={value} {...form.register("filing_type_filters")} className="h-4 w-4 accent-teal-700" />
                    {label}
                  </label>
                ))}
                <FieldError>{form.formState.errors.filing_type_filters?.message}</FieldError>
              </div>
              <Button type="button" onClick={continueFromDetails} className="w-full">
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Define your territory</h1>
                <p className="text-sm text-stone-600">Choose how to draw your service area boundary.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4" /> Back</Button>
                <Button onClick={() => setStep(3)} disabled={!serviceArea}>Continue <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="flex border-b border-stone-200">
              <button
                type="button"
                onClick={() => { setDrawMode("custom"); setServiceArea(null); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${drawMode === "custom" ? "border-teal-700 text-teal-700 font-semibold" : "border-transparent text-stone-500 hover:text-stone-700"}`}
              >
                Draw Custom Shape
              </button>
              <button
                type="button"
                onClick={() => { setDrawMode("circle"); setServiceArea(null); setCircleCenterCoords(null); setCircleCenterAddress(""); }}
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
                        max="50"
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

            <DrawMap
              value={serviceArea}
              onChange={setServiceArea}
              onMapClick={handleMapClick}
              drawMode={drawMode}
              className="h-[calc(100vh-270px)] min-h-[480px] w-full rounded-xl border border-stone-200"
            />
          </div>
        ) : null}

        {step === 3 ? (
          <Card className="mx-auto max-w-3xl overflow-hidden">
            {previewUrl ? <img src={previewUrl} alt="" className="h-72 w-full object-cover" /> : <div className="h-72 bg-stone-100" />}
            <div className="space-y-5 p-6">
              <div>
                <h1 className="text-2xl font-semibold">Confirm and activate</h1>
                <p className="mt-1 text-stone-600">We will email you when matching filings land inside this area.</p>
              </div>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div><dt className="text-sm text-stone-500">Business</dt><dd className="font-medium">{values.business_name}</dd></div>
                <div><dt className="text-sm text-stone-500">Type</dt><dd className="font-medium">{businessTypeLabel(values.business_type)}</dd></div>
                <div><dt className="text-sm text-stone-500">Watching</dt><dd className="font-medium">{values.filing_type_filters.length} filing types</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4" /> Back</Button>
                <Button onClick={activate} disabled={submitting || !serviceArea}>
                  <Check className="h-4 w-4" /> {submitting ? "Activating..." : "Activate alerts"}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
