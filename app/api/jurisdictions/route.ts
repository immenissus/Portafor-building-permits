import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { jurisdictions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authorizeAdmin } from "@/lib/admin-auth";
import { jurisdictionSchema } from "@/lib/schemas";

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
        pollIntervalHours: jurisdictions.pollIntervalHours,
        isActive: jurisdictions.isActive,
        lastPolledAt: jurisdictions.lastPolledAt,
        lastAttemptAt: jurisdictions.lastAttemptAt,
        lastSuccessAt: jurisdictions.lastSuccessAt,
        consecutiveFailures: jurisdictions.consecutiveFailures,
        totalIngested: jurisdictions.totalIngested,
        totalQuarantined: jurisdictions.totalQuarantined,
        watermarkDatetime: jurisdictions.watermarkDatetime,
        lastSourceRecordAt: jurisdictions.lastSourceRecordAt,
        lastRecordsFetched: jurisdictions.lastRecordsFetched,
        lastNewFilings: jurisdictions.lastNewFilings,
        lastError: jurisdictions.lastError,
        syncStatus: jurisdictions.syncStatus,
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
    const parsed = jurisdictionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { detail: "Invalid jurisdiction payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, socrata_domain, resource_id, app_token, column_field_map, filing_type } = parsed.data;

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
      filingType: filing_type,
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
      filing_type,
      is_active: true
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to register jurisdiction:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
