import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
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

    // Execute the proximity distance query
    const results = await db.execute(sql`
      SELECT 
        id, jurisdiction_id, external_id, filing_type, address_raw, address_parsed, filed_at, created_at,
        ST_X(geom::geometry) as longitude,
        ST_Y(geom::geometry) as latitude,
        ST_DistanceSphere(geom, ${searchPoint}) as distance_meters
      FROM filings
      WHERE ST_DistanceSphere(geom, ${searchPoint}) <= ${radiusKm * 1000.0}
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
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
