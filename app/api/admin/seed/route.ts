import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { jurisdictions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const SEED_JURISDICTIONS = [
  {
    name: "Austin, TX",
    socrata_domain: "data.austintexas.gov",
    resource_id: "3syk-w9eu",
    column_field_map: {
      address: "permit_location",
      issued_date: "issue_date",
      permit_number: "permit_number",
      latitude: "latitude",
      longitude: "longitude"
    }
  },
  {
    name: "Orlando, FL",
    socrata_domain: "data.cityoforlando.net",
    resource_id: "ryhf-m453",
    column_field_map: {
      address: "permit_address",
      issued_date: "issue_permit_date",
      permit_number: "permit_number"
    }
  },
  {
    name: "Collin County, TX",
    socrata_domain: "data.texas.gov",
    resource_id: "82ee-gbj5",
    column_field_map: {
      address: "situsconcatshort",
      issued_date: "permitissueddate",
      permit_number: "permitnum"
    }
  }
];

export async function POST(request: Request) {
  try {
    const adminKeyHeader = request.headers.get("X-Admin-Key");
    const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
      return NextResponse.json({ detail: "Unauthorized - Invalid X-Admin-Key" }, { status: 401 });
    }

    const results: any[] = [];

    for (const seed of SEED_JURISDICTIONS) {
      const [existing] = await db
        .select({ id: jurisdictions.id })
        .from(jurisdictions)
        .where(eq(jurisdictions.name, seed.name))
        .limit(1);

      if (existing) {
        // Update column field map in case it changed
        await db
          .update(jurisdictions)
          .set({ columnFieldMap: seed.column_field_map, isActive: true })
          .where(eq(jurisdictions.id, existing.id));
        results.push({ name: seed.name, id: existing.id, status: "updated" });
      } else {
        const id = crypto.randomUUID();
        await db.insert(jurisdictions).values({
          id,
          name: seed.name,
          socrataDomain: seed.socrata_domain,
          resourceId: seed.resource_id,
          columnFieldMap: seed.column_field_map,
          isActive: true
        });
        results.push({ name: seed.name, id, status: "created" });
      }
    }

    return NextResponse.json({ message: "Jurisdictions seeded", results });
  } catch (error) {
    console.error("Seed failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
