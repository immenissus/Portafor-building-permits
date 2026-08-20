import { describe, expect, it } from "vitest";
import { filingTypeAnySql } from "./filings";

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