"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { ServiceArea } from "@/lib/types";

const defaultCenter: [number, number] = [-98.5795, 39.8283];

type DrawMapProps = {
  value?: ServiceArea | null;
  onChange?: (geometry: ServiceArea | null) => void;
  onMapClick?: (coords: [number, number]) => void;
  editable?: boolean;
  className?: string;
  drawMode?: "custom" | "circle";
};

export function DrawMap({ value, onChange, onMapClick, editable = true, className, drawMode = "custom" }: DrawMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  const onMapClickRef = useRef(onMapClick);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onChangeRef.current = onChange;
  });

  // Initialize Map and Controls (Once on Mount)
  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: defaultCenter,
      zoom: 3.1
    });

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: editable && drawMode === "custom" ? { polygon: true, trash: true } : {},
      defaultMode: editable && drawMode === "custom" ? "draw_polygon" : "simple_select"
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    
    // Add draw controls only if in custom editable mode
    if (editable && drawMode === "custom") {
      map.addControl(draw, "top-left");
    }

    map.on("load", () => {
      // Create GeoJSON source for circle or read-only modes
      if (drawMode === "circle" || !editable) {
        map.addSource("service-area", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: value || { type: "Polygon", coordinates: [] }
          }
        });

        map.addLayer({
          id: "service-area-fill",
          type: "fill",
          source: "service-area",
          paint: { "fill-color": "#0f766e", "fill-opacity": 0.2 }
        });

        map.addLayer({
          id: "service-area-line",
          type: "line",
          source: "service-area",
          paint: { "line-color": "#0d9488", "line-width": 2 }
        });
      }

      // Populate custom drawing tool if we have an existing value
      if (value) {
        if (editable && drawMode === "custom") {
          draw.add({ type: "Feature" as const, properties: {}, geometry: value });
        }
        
        // Auto-center map on existing geometry
        const bounds = new mapboxgl.LngLatBounds();
        collectCoordinates(value).forEach(([lng, lat]) => bounds.extend([lng, lat]));
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, maxZoom: 12 });
      }
    });

    // Handle Mapbox Draw updates (for custom mode)
    const updateGeometry = () => {
      if (drawMode !== "custom") return;
      const feature = draw.getAll().features[0];
      onChangeRef.current?.((feature?.geometry as ServiceArea | undefined) ?? null);
    };

    map.on("draw.create", updateGeometry);
    map.on("draw.update", updateGeometry);
    map.on("draw.delete", updateGeometry);

    // Expose map click event for centering circles
    map.on("click", (e) => {
      onMapClickRef.current?.([e.lngLat.lng, e.lngLat.lat]);
    });

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, drawMode]); // Re-initialize only if edit mode or draw mode switches

  // Dynamic geometry synchronization (No page reloads/re-initialization!)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyUpdates = () => {
      if (drawMode === "custom" && editable && drawRef.current) {
        const draw = drawRef.current;
        const currentFeatures = draw.getAll().features;
        const valueJson = value ? JSON.stringify(value) : "";
        const drawJson = currentFeatures[0] ? JSON.stringify(currentFeatures[0].geometry) : "";

        if (valueJson !== drawJson) {
          draw.deleteAll();
          if (value) {
            draw.add({ type: "Feature" as const, properties: {}, geometry: value });
          }
        }
      } else {
        const source = map.getSource("service-area") as mapboxgl.GeoJSONSource | undefined;
        if (source) {
          source.setData({
            type: "Feature",
            properties: {},
            geometry: value || { type: "Polygon", coordinates: [] }
          });
        }
      }
    };

    if (map.isStyleLoaded()) {
      applyUpdates();
    } else {
      map.once("idle", applyUpdates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <div ref={containerRef} className={className ?? "h-[520px] w-full rounded-xl border border-stone-200"} />;
}

function collectCoordinates(geometry: ServiceArea): [number, number][] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat() as [number, number][];
  return geometry.coordinates.flat(2) as [number, number][];
}
