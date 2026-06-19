"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Filing } from "@/lib/types";
import { filingLabel } from "@/lib/utils";

type FilingsMapProps = {
  filings: Filing[];
  center?: [number, number];
  highlightedId?: string | null;
};

export function FilingsMap({ filings, center = [-98.5795, 39.8283], highlightedId }: FilingsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: 11
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = filings.map((filing) => {
      const element = document.createElement("button");
      element.className = `h-4 w-4 rounded-full border-2 border-white ${highlightedId === filing.id ? "bg-amber-700 ring-4 ring-amber-700/25" : "bg-teal-700"}`;
      const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${filing.address}</strong><br/>${filingLabel(filing.filing_type)}<br/>${new Date(filing.filed_at).toLocaleDateString()}`);
      return new mapboxgl.Marker({ element }).setLngLat([filing.lng, filing.lat]).setPopup(popup).addTo(map);
    });

    if (filings.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      filings.forEach((filing) => bounds.extend([filing.lng, filing.lat]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 14 });
    } else {
      map.flyTo({ center, zoom: 11 });
    }
  }, [center, filings, highlightedId]);

  return <div ref={containerRef} className="h-full min-h-[460px] w-full rounded-xl border border-stone-200" />;
}
