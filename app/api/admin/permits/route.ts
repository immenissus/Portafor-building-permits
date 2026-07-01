import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const adminKeyHeader = request.headers.get("X-Admin-Key");
    const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
      return NextResponse.json({ detail: "Unauthorized - Invalid X-Admin-Key" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jurisdictionId = searchParams.get("jurisdiction_id");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const format = searchParams.get("format") || "json";

    if (!jurisdictionId) {
      return NextResponse.json({ detail: "jurisdiction_id is required" }, { status: 400 });
    }

    const results = await db.execute(sql`
      SELECT 
        f.id,
        f.external_id,
        f.filing_type,
        f.address_raw,
        f.filed_at,
        f.created_at,
        ST_X(f.geom::geometry) as longitude,
        ST_Y(f.geom::geometry) as latitude,
        j.name as jurisdiction_name
      FROM filings f
      JOIN jurisdictions j ON f.jurisdiction_id = j.id
      WHERE f.jurisdiction_id = ${jurisdictionId}
      ORDER BY f.filed_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const [countResult] = await db.execute(sql`
      SELECT count(*)::int as total
      FROM filings
      WHERE jurisdiction_id = ${jurisdictionId}
    `);

    if (format === "csv") {
      const csvHeader = "ID,External ID,Filing Type,Address,Filed At,Latitude,Longitude\n";
      const csvRows = results.map((row: any) => 
        `"${row.id}","${row.external_id}","${row.filing_type}","${row.address_raw}","${row.filed_at}","${row.latitude}","${row.longitude}"`
      ).join("\n");
      
      return new NextResponse(csvHeader + csvRows, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="permits-${jurisdictionId}.csv"`
        }
      });
    }

    return NextResponse.json({
      total: (countResult as any)?.total ?? 0,
      limit,
      offset,
      permits: results.map((row: any) => ({
        id: row.id,
        external_id: row.external_id,
        filing_type: row.filing_type,
        address: row.address_raw,
        filed_at: row.filed_at,
        latitude: row.latitude,
        longitude: row.longitude,
        jurisdiction: row.jurisdiction_name
      }))
    });
  } catch (error) {
    console.error("Failed to query permits:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
