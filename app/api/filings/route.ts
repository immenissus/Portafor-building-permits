import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { subscribers } from "@/lib/db/schema";
import { authorizeAdmin } from "@/lib/admin-auth";
import { isEntitledForDelivery } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Auth: valid subscriber API key (X-Subscriber-Key) OR admin credentials
    const apiKey = request.headers.get("X-Subscriber-Key");
    if (apiKey) {
      const [subscriber] = await db
        .select({
          billingStatus: subscribers.billingStatus,
          trialEnd: subscribers.trialEnd,
          currentPeriodEnd: subscribers.currentPeriodEnd
        })
        .from(subscribers)
        .where(eq(subscribers.apiKey, apiKey))
        .limit(1);
      if (!subscriber || !isEntitledForDelivery(subscriber)) {
        return NextResponse.json({ detail: "Unauthorized - Invalid or expired subscriber key" }, { status: 401 });
      }
    } else {
      const authError = await authorizeAdmin(request);
      if (authError) return authError;
    }

    const { searchParams } = new URL(request.url);
    const near = searchParams.get("near");
    const radiusKm = parseFloat(searchParams.get("radius_km") || "5.0");
    const type = searchParams.get("type");

    if (!near) {
      return NextResponse.json({ detail: "Query parameter 'near' is required" }, { status: 400 });
    }

    // Parse coordinates from "latitude,longitude" format
    let latitude: number;
    let longitude: number;
    try {
      const parts = near.split(",");
      latitude = parseFloat(parts[0]!.trim());
      longitude = parseFloat(parts[1]!.trim());

      if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error();
      }
    } catch {
      return NextResponse.json(
        { detail: "Query parameter 'near' must be in 'latitude,longitude' format." },
        { status: 400 }
      );
    }

    // Define search point in PostGIS (SRID 4326)
    const searchPoint = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;

    // Execute the proximity query using ST_DWithin on geography.
    // ST_DWithin(::geography) is backed by the GiST geography index (see migrations/002).
    // ST_DistanceSphere cannot use an index and scans every filing.
    const results = await db.execute(sql`
      SELECT 
        id, jurisdiction_id, external_id, filing_type, address_raw, address_parsed, filed_at, created_at,
        ST_X(geom::geometry) as longitude,
        ST_Y(geom::geometry) as latitude,
        ST_DistanceSphere(geom, ${searchPoint}) as distance_meters
      FROM filings
      WHERE ST_DWithin(geom::geography, ${searchPoint}::geography, ${radiusKm * 1000.0})
      ${type && type !== "all" ? sql`AND filing_type = ${type.trim().toLowerCase()}` : sql``}
      ORDER BY distance_meters ASC
      LIMIT 100
    `);

    return NextResponse.json(
      results.map((row) => ({
        id: row.id,
        jurisdiction_id: row.jurisdiction_id,
        external_id: row.external_id,
        filing_type: row.filing_type,
        address_raw: row.address_raw,
        address_parsed: row.address_parsed,
        latitude: row.latitude,
        longitude: row.longitude,
        filed_at: row.filed_at,
        distance_meters: row.distance_meters,
        created_at: row.created_at
      }))
    );
  } catch (error) {
    console.error("Failed to query filings proximity:", error);
    const pgError = error as { message?: string; detail?: string; hint?: string } | null;
    const detail = pgError && typeof pgError === "object"
      ? `${pgError.message || "Something went wrong"}${pgError.detail ? ` (${pgError.detail})` : ""}${pgError.hint ? ` [Hint: ${pgError.hint}]` : ""}`
      : "Something went wrong";
    return NextResponse.json({ detail }, { status: 500 });
  }
}