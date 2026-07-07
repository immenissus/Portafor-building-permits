import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { jurisdictions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const SEED_JURISDICTIONS = [
  // TEXAS
  {
    name: "Austin, TX",
    socrata_domain: "data.austintexas.gov",
    resource_id: "3syk-w9eu",
    column_field_map: { address: "permit_location", issued_date: "issue_date", permit_number: "permit_number", latitude: "latitude", longitude: "longitude" }
  },
  {
    name: "Dallas, TX",
    socrata_domain: "www.dallasopendata.com",
    resource_id: "e7gq-4sah",
    column_field_map: { address: "address", issued_date: "issued_date", permit_number: "permit_number" }
  },
  {
    name: "Fort Worth, TX",
    socrata_domain: "data.fortworthtexas.gov",
    resource_id: "gqxy-4nix",
    column_field_map: { address: "address", issued_date: "issue_date", permit_number: "permit_number", latitude: "y_coordinate", longitude: "x_coordinate" }
  },
  {
    name: "Collin County, TX",
    socrata_domain: "data.texas.gov",
    resource_id: "82ee-gbj5",
    column_field_map: { address: "situsconcatshort", issued_date: "permitissueddate", permit_number: "permitnum" }
  },
  // ILLINOIS
  {
    name: "Chicago, IL",
    socrata_domain: "data.cityofchicago.org",
    resource_id: "ydr8-5enu",
    column_field_map: { address: "street_number", issued_date: "issue_date", permit_number: "permit_", latitude: "latitude", longitude: "longitude" }
  },
  // NEW YORK
  {
    name: "New York City, NY",
    socrata_domain: "data.cityofnewyork.us",
    resource_id: "rbx6-tga4",
    column_field_map: { address: "street_name", issued_date: "issued_date", permit_number: "job_filing_number", latitude: "latitude", longitude: "longitude" }
  },
  // CALIFORNIA
  {
    name: "Los Angeles, CA",
    socrata_domain: "data.lacity.org",
    resource_id: "yv23-pmwf",
    column_field_map: { address: "street_name", issued_date: "issue_date", permit_number: "pcis_permit" }
  },
  {
    name: "San Francisco, CA",
    socrata_domain: "data.sfgov.org",
    resource_id: "hj9w-htr2",
    column_field_map: { address: "location_1", issued_date: "issued_date", permit_number: "permit_number" }
  },
  {
    name: "San Diego, CA",
    socrata_domain: "data.sandiego.gov",
    resource_id: "6c0x-sbhe",
    column_field_map: { address: "address", issued_date: "issue_date", permit_number: "permit_number" }
  },
  // WASHINGTON
  {
    name: "Seattle, WA",
    socrata_domain: "data.seattle.gov",
    resource_id: "ht3q-kdvx",
    column_field_map: { address: "originaladdress1", issued_date: "applicationdate", permit_number: "permitnum", latitude: "latitude", longitude: "longitude" }
  },
  {
    name: "King County, WA",
    socrata_domain: "data.kingcounty.gov",
    resource_id: "ep2k-f9n7",
    column_field_map: { address: "address", issued_date: "issue_date", permit_number: "permit_number" }
  },
  // MASSACHUSETTS
  {
    name: "Boston, MA",
    socrata_domain: "data.boston.gov",
    resource_id: "b7a7-szrw",
    column_field_map: { address: "address", issued_date: "issue_date", permit_number: "permit_number" }
  },
  // FLORIDA
  {
    name: "Miami-Dade County, FL",
    socrata_domain: "opendata.miamidade.gov",
    resource_id: "mb6e-5m3u",
    column_field_map: { address: "site_address", issued_date: "issue_date", permit_number: "permit_number" }
  },
  {
    name: "Orlando, FL",
    socrata_domain: "data.cityoforlando.net",
    resource_id: "ryhf-m453",
    column_field_map: { address: "permit_address", issued_date: "issue_permit_date", permit_number: "permit_number" }
  },
  // MICHIGAN
  {
    name: "Detroit, MI",
    socrata_domain: "data.detroitmi.gov",
    resource_id: "a4rs-s2ux",
    column_field_map: { address: "address", issued_date: "issue_date", permit_number: "permit_number" }
  }
];

export async function POST(request: Request) {
  try {
    const adminKeyHeader = request.headers.get("X-Admin-Key");
    const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;
    if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const results: any[] = [];

    for (const seed of SEED_JURISDICTIONS) {
      const [existing] = await db.select({ id: jurisdictions.id }).from(jurisdictions).where(eq(jurisdictions.name, seed.name)).limit(1);

      if (existing) {
        await db.update(jurisdictions).set({ columnFieldMap: seed.column_field_map, isActive: true }).where(eq(jurisdictions.id, existing.id));
        results.push({ name: seed.name, id: existing.id, status: "updated" });
      } else {
        const id = crypto.randomUUID();
        await db.insert(jurisdictions).values({
          id, name: seed.name, socrataDomain: seed.socrata_domain,
          resourceId: seed.resource_id, columnFieldMap: seed.column_field_map, isActive: true
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
