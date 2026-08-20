import { describe, expect, it } from "vitest";
import { jurisdictionSchema } from "./schemas";

const VALID = {
  name: "Chicago, IL",
  socrata_domain: "data.cityofchicago.org",
  resource_id: "ydr8-5enu",
  filing_type: "building_permit",
  column_field_map: {
    address: ["street_number", "street_direction", "street_name"],
    issued_date: "issue_date",
    permit_number: "permit_",
    latitude: "latitude",
    longitude: "longitude"
  }
};

describe("jurisdictionSchema", () => {
  it("accepts a valid jurisdiction with a composite address map", () => {
    const result = jurisdictionSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("accepts a string address map (single column)", () => {
    const result = jurisdictionSchema.safeParse({
      ...VALID,
      column_field_map: { address: "permit_location", issued_date: "issue_date", permit_number: "permit_number" }
    });
    expect(result.success).toBe(true);
  });

  it("defaults filing_type to building_permit", () => {
    const result = jurisdictionSchema.safeParse({ ...VALID, filing_type: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filing_type).toBe("building_permit");
  });

  it("rejects a map without an address key", () => {
    const result = jurisdictionSchema.safeParse({
      ...VALID,
      column_field_map: { issued_date: "issue_date", permit_number: "permit_" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a map without issued_date", () => {
    const result = jurisdictionSchema.safeParse({
      ...VALID,
      column_field_map: { address: "street_name", permit_number: "permit_" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a map without any external id key", () => {
    const result = jurisdictionSchema.safeParse({
      ...VALID,
      column_field_map: { address: "street_name", issued_date: "issue_date" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name or missing domain", () => {
    expect(jurisdictionSchema.safeParse({ ...VALID, name: "" }).success).toBe(false);
    expect(jurisdictionSchema.safeParse({ ...VALID, socrata_domain: "" }).success).toBe(false);
  });

  it("rejects an invalid filing_type", () => {
    expect(jurisdictionSchema.safeParse({ ...VALID, filing_type: "permits" }).success).toBe(false);
  });
});