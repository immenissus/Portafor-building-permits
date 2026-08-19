import { describe, expect, it } from "vitest";
import { cn, filingLabel, businessTypeLabel, relativeTime, createCirclePolygon } from "./utils";

describe("createCirclePolygon", () => {
  it("creates a closed polygon with the requested number of points", () => {
    const polygon = createCirclePolygon([-97.7, 30.3], 10, 32);
    expect(polygon.type).toBe("Polygon");
    const ring = polygon.coordinates[0];
    expect(ring.length).toBe(33); // 32 points + closing point
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    expect(firstLng).toBe(lastLng);
    expect(firstLat).toBe(lastLat);
  });

  it("scales the radius with size", () => {
    const extent = (ring: GeoJSON.Position[]) => {
      const lngs = ring.map((p) => p[0] as number);
      return Math.max(...lngs) - Math.min(...lngs);
    };
    const small = createCirclePolygon([0, 0], 1, 4);
    const big = createCirclePolygon([0, 0], 10, 4);
    expect(extent(big.coordinates[0])).toBeGreaterThan(extent(small.coordinates[0]));
  });

  it("handles extreme latitudes without throwing", () => {
    expect(() => createCirclePolygon([-179, 89.9], 100, 8)).not.toThrow();
  });
});

describe("filingLabel", () => {
  it("maps business_license and building_permit", () => {
    expect(filingLabel("business_license")).toBe("Business license");
    expect(filingLabel("building_permit")).toBe("Building permit");
    expect(filingLabel("unknown")).toBe("Building permit");
  });
});

describe("businessTypeLabel", () => {
  it("maps known business types and passes through unknown", () => {
    expect(businessTypeLabel("roofer")).toBe("Roofer");
    expect(businessTypeLabel("hvac")).toBe("HVAC");
    expect(businessTypeLabel("solar")).toBe("Solar installer");
    expect(businessTypeLabel("custom")).toBe("custom");
  });
});

describe("relativeTime", () => {
  it("returns a string for a recent timestamp", () => {
    expect(typeof relativeTime(new Date().toISOString())).toBe("string");
  });
});

describe("cn", () => {
  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2", "px-3")).toBe("px-3");
  });

  it("combines distinct classes", () => {
    expect(cn("px-2", "py-2")).toBe("px-2 py-2");
  });
});