"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { ServiceArea } from "@/lib/types";

const defaultCenter: [number, number] = [-98.5795, 39.8283];

type DrawMapProps = {
  value?: ServiceArea | null;
  onChange?: (geometry: ServiceArea | null) => void;
  editable?: boolean;
  className?: string;
};

export function DrawMap({ value, onChange, editable = true, className }: DrawMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: defaultCenter,
      zoom: 3.1
    });

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: editable ? { polygon: true, trash: true } : {},
      defaultMode: editable ? "draw_polygon" : "simple_select"
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    if (editable) map.addControl(draw, "top-left");

    map.on("load", () => {
      if (value) {
        const feature = { type: "Feature" as const, properties: {}, geometry: value };
        if (editable) {
          draw.add(feature);
        } else {
          map.addSource("service-area", { type: "geojson", data: feature });
          map.addLayer({
            id: "service-area-fill",
            type: "fill",
            source: "service-area",
            paint: { "fill-color": "#3B8BD4", "fill-opacity": 0.2 }
          });
          map.addLayer({
            id: "service-area-line",
            type: "line",
            source: "service-area",
            paint: { "line-color": "#185FA5", "line-width": 2 }
          });
        }
        const bounds = new mapboxgl.LngLatBounds();
        collectCoordinates(value).forEach(([lng, lat]) => bounds.extend([lng, lat]));
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, maxZoom: 12 });
      }
    });

    const updateGeometry = () => {
      const feature = draw.getAll().features[0];
      onChange?.((feature?.geometry as ServiceArea | undefined) ?? null);
    };

    map.on("draw.create", updateGeometry);
    map.on("draw.update", updateGeometry);
    map.on("draw.delete", updateGeometry);
    mapRef.current = map;
    drawRef.current = draw;

    return () => map.remove();
  }, [editable, onChange, value]);

  return <div ref={containerRef} className={className ?? "h-[520px] w-full rounded-xl border border-stone-200"} />;
}

function collectCoordinates(geometry: ServiceArea): [number, number][] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat() as [number, number][];
  return geometry.coordinates.flat(2) as [number, number][];
}
