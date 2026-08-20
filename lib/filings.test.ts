import { describe, expect, it } from "vitest";
import { filingTypeAnySql, serviceAreaSql } from "./filings";

describe("filingTypeAnySql", () => {
  it("renders a single type as an ANY array predicate", () => {
    expect(filingTypeAnySql(["building_permit"])).toBe(
      "f.filing_type = ANY(ARRAY['building_permit']::text[])"
    );
  });

  it("renders multiple types comma-separated", () => {
    expect(filingTypeAnySql(["building_permit", "business_license"])).toBe(
      "f.filing_type = ANY(ARRAY['building_permit','business_license']::text[])"
    );
  });

  it("drops unknown filing types (injection guard)", () => {
    expect(filingTypeAnySql(["building_permit", "']::text[]; DROP TABLE filings; --"])).toBe(
      "f.filing_type = ANY(ARRAY['building_permit']::text[])"
    );
  });

  it("renders an empty predicate-safe array when no valid types remain", () => {
    expect(filingTypeAnySql(["bogus"])).toBe("f.filing_type = ANY(ARRAY[]::text[])");
  });
});

describe("serviceAreaSql", () => {
  it("accepts GeoJSON polygons", () => {
    expect(serviceAreaSql('{"type":"Polygon","coordinates":[]}')).toEqual({
      expression: "geojson",
      value: '{"type":"Polygon","coordinates":[]}'
    });
  });

  it("accepts hexadecimal WKB polygons", () => {
    expect(serviceAreaSql("0103000020E610000001000000210000001C6B0BDDE66858").expression).toBe("wkb");
  });

  it("rejects invalid geometry", () => {
    expect(() => serviceAreaSql("not-geometry")).toThrow("Invalid service area geometry");
  });
});
