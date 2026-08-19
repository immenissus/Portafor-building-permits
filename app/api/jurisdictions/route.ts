import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { jurisdictions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authorizeAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

    const allJurisdictions = await db
      .select({
        id: jurisdictions.id,
        name: jurisdictions.name,
        socrataDomain: jurisdictions.socrataDomain,
        resourceId: jurisdictions.resourceId,
        filingType: jurisdictions.filingType,
        isActive: jurisdictions.isActive,
        lastPolledAt: jurisdictions.lastPolledAt,
        lastSuccessAt: jurisdictions.lastSuccessAt,
        consecutiveFailures: jurisdictions.consecutiveFailures,
        totalIngested: jurisdictions.totalIngested,
        totalQuarantined: jurisdictions.totalQuarantined,
        createdAt: jurisdictions.createdAt
      })
      .from(jurisdictions);

    return NextResponse.json(allJurisdictions);
  } catch (error) {
    console.error("Failed to list jurisdictions:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

    const body = await request.json();
    const { name, socrata_domain, resource_id, app_token, column_field_map, filing_type } = body;

    if (!name || !socrata_domain || !resource_id || !column_field_map) {
      return NextResponse.json({ detail: "Missing required fields" }, { status: 400 });
    }

    const normalizedFilingType = filing_type === "business_license" ? "business_license" : "building_permit";

    // Check if name already exists
    const [existing] = await db
      .select({ id: jurisdictions.id })
      .from(jurisdictions)
      .where(eq(jurisdictions.name, name))
      .limit(1);

    if (existing) {
      return NextResponse.json({ detail: `Jurisdiction with name '${name}' already exists.` }, { status: 400 });
    }

    const jurisdictionId = crypto.randomUUID();

    // Insert new jurisdiction
    await db.insert(jurisdictions).values({
      id: jurisdictionId,
      name,
      socrataDomain: socrata_domain,
      resourceId: resource_id,
      filingType: normalizedFilingType,
      appToken: app_token || null,
      columnFieldMap: column_field_map,
      isActive: true
    });

    return NextResponse.json({
      id: jurisdictionId,
      name,
      socrata_domain,
      resource_id,
      app_token: app_token ? "REDACTED" : null,
      column_field_map,
      filing_type: normalizedFilingType,
      is_active: true
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to register jurisdiction:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
