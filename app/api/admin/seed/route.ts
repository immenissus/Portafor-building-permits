import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { jurisdictions } from "@/lib/db/schema";
import { authorizeAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// VERIFIED: Each mapping tested against live Socrata API on 2026-07-08
const SEED_JURISDICTIONS = [
  {
    name: "Austin, TX",
    socrata_domain: "data.austintexas.gov",
    resource_id: "3syk-w9eu",
    filing_type: "building_permit",
    column_field_map: { address: "permit_location", issued_date: "issue_date", permit_number: "permit_number", latitude: "latitude", longitude: "longitude" }
  },
  {
    name: "Collin County, TX",
    socrata_domain: "data.texas.gov",
    resource_id: "82ee-gbj5",
    filing_type: "building_permit",
    column_field_map: { address: "situsconcatshort", issued_date: "permitissueddate", permit_number: "permitnum" }
  },
  {
    name: "Chicago, IL",
    socrata_domain: "data.cityofchicago.org",
    resource_id: "ydr8-5enu",
    filing_type: "building_permit",
    column_field_map: { address: ["street_number", "street_direction", "street_name"], issued_date: "issue_date", permit_number: "permit_", latitude: "latitude", longitude: "longitude" }
  },
  {
    name: "New York City, NY",
    socrata_domain: "data.cityofnewyork.us",
    resource_id: "rbx6-tga4",
    filing_type: "building_permit",
    column_field_map: { address: ["house_no", "street_name"], issued_date: "approved_date", permit_number: "tracking_number", latitude: "latitude", longitude: "longitude" }
  },
  {
    name: "Seattle, WA",
    socrata_domain: "data.seattle.gov",
    resource_id: "ht3q-kdvx",
    filing_type: "building_permit",
    column_field_map: { address: "originaladdress1", issued_date: "issueddate", permit_number: "permitnum", latitude: "latitude", longitude: "longitude" }
  },
  {
    name: "Orlando, FL",
    socrata_domain: "data.cityoforlando.net",
    resource_id: "ryhf-m453",
    filing_type: "building_permit",
    column_field_map: { address: "permit_address", issued_date: "issue_permit_date", permit_number: "permit_number" }
  },
];

export async function POST(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

    const results: Array<{ name: string; id: string; status: string }> = [];

    for (const seed of SEED_JURISDICTIONS) {
      const [existing] = await db.select({ id: jurisdictions.id }).from(jurisdictions).where(eq(jurisdictions.name, seed.name)).limit(1);

      if (existing) {
        await db.update(jurisdictions).set({ columnFieldMap: seed.column_field_map, filingType: seed.filing_type, isActive: true }).where(eq(jurisdictions.id, existing.id));
        results.push({ name: seed.name, id: existing.id, status: "updated" });
      } else {
        const id = crypto.randomUUID();
        await db.insert(jurisdictions).values({
          id, name: seed.name, socrataDomain: seed.socrata_domain,
          resourceId: seed.resource_id, filingType: seed.filing_type, columnFieldMap: seed.column_field_map, isActive: true
        });
        results.push({ name: seed.name, id, status: "created" });
      }
    }

    return NextResponse.json({ message: "Jurisdictions seeded", count: results.length, results });
  } catch (error) {
    console.error("Seed failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
