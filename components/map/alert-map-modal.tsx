"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Alert } from "@/lib/types";

export function AlertMapModal({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!alert || !containerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [alert.lng, alert.lat],
      zoom: 14
    });
    new mapboxgl.Marker({ color: "#0F766E" }).setLngLat([alert.lng, alert.lat]).addTo(map);
    return () => map.remove();
  }, [alert]);

  if (!alert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-4">
          <div>
            <p className="font-medium text-stone-950">{alert.address}</p>
            <p className="text-sm text-stone-500">{new Date(alert.filed_at).toLocaleString()}</p>
          </div>
          <button aria-label="Close map" onClick={onClose} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={containerRef} className="h-[520px] rounded-b-xl" />
      </div>
    </div>
  );
}
