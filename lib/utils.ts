import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FilingType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function filingLabel(type: FilingType | string) {
  return type === "business_license" ? "Business license" : "Building permit";
}

export function businessTypeLabel(type: string) {
  const labels: Record<string, string> = {
    roofer: "Roofer",
    hvac: "HVAC",
    solar: "Solar installer",
    insurance: "Insurance agent",
    lawyer: "Lawyer",
    other: "Other"
  };

  return labels[type] ?? type;
}

export function relativeTime(value: string) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];

  for (const [unit, amount] of divisions) {
    if (Math.abs(seconds) >= amount) {
      return formatter.format(Math.round(seconds / amount), unit);
    }
  }

  return formatter.format(seconds, "second");
}

export function staticMapUrl(lng: number, lat: number, width = 360, height = 200) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return "";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+0f766e(${lng},${lat})/${lng},${lat},14/${width}x${height}?access_token=${token}`;
}

export function staticPolygonUrl(serviceArea: GeoJSON.Geometry, width = 600, height = 320) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return "";
  const overlay = encodeURIComponent(JSON.stringify({ type: "Feature", properties: { stroke: "#185FA5", "stroke-width": 3, fill: "#3B8BD4", "fill-opacity": 0.2 }, geometry: serviceArea }));
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/geojson(${overlay})/auto/${width}x${height}?padding=48&access_token=${token}`;
}

export function createCirclePolygon(center: [number, number], radiusKm: number, points = 32): GeoJSON.Polygon {
  const coordinates: [number, number][] = [];
  const distanceX = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * (2 * Math.PI);
    const lng = center[0] + distanceX * Math.cos(angle);
    const lat = center[1] + distanceY * Math.sin(angle);
    coordinates.push([lng, lat]);
  }
  coordinates.push(coordinates[0]); // Close the polygon

  return {
    type: "Polygon",
    coordinates: [coordinates]
  };
}
