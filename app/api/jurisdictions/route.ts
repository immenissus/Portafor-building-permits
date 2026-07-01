import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { jurisdictions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allJurisdictions = await db
      .select({
        id: jurisdictions.id,
        name: jurisdictions.name,
        socrataDomain: jurisdictions.socrataDomain,
        resourceId: jurisdictions.resourceId,
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
    const adminKeyHeader = request.headers.get("X-Admin-Key");
    const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
      return NextResponse.json({ detail: "Unauthorized - Invalid X-Admin-Key" }, { status: 401 });
    }

    const body = await request.json();
    const { name, socrata_domain, resource_id, app_token, column_field_map } = body;

    if (!name || !socrata_domain || !resource_id || !column_field_map) {
      return NextResponse.json({ detail: "Missing required fields" }, { status: 400 });
    }

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
      is_active: true
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to register jurisdiction:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
