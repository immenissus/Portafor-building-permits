"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { upsertSubscriber } from "@/lib/api";
import type { ServiceArea } from "@/lib/types";
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
      <DrawMap key={editing ? "edit" : "view"} value={editing ? draft : serviceArea} onChange={setDraft} editable={editing} className="min-h-0 flex-1 rounded-xl border border-stone-200" />
    </section>
  );
}
