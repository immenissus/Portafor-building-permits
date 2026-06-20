import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { subscribers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const apiKeyHeader = request.headers.get("X-Subscriber-Key");

    if (!apiKeyHeader) {
      return NextResponse.json({ detail: "Missing X-Subscriber-Key header" }, { status: 401 });
    }

    // Fetch the subscriber and check that the api_key matches
    const [subscriberRecord] = await db
      .select({ apiKey: subscribers.apiKey })
      .from(subscribers)
      .where(eq(subscribers.id, id))
      .limit(1);

    if (!subscriberRecord || subscriberRecord.apiKey !== apiKeyHeader) {
      return NextResponse.json({ detail: "Unauthorized - Invalid X-Subscriber-Key" }, { status: 401 });
    }

    // Retrieve full subscriber record with service_area converted back to GeoJSON
    const subscriberResult = await db.execute(sql`
      SELECT 
        id, email, business_name, business_type, filing_type_filters, api_key, status, created_at, updated_at,
        ST_AsGeoJSON(service_area) as service_area
      FROM subscribers 
      WHERE id = ${id}
      LIMIT 1
    `);

    const subscriber = subscriberResult[0];
    if (!subscriber) {
      return NextResponse.json({ detail: "Subscriber not found" }, { status: 404 });
    }

    // Retrieve up to 10 of their most recent dispatched alerts
    const recentAlerts = await db.execute(sql`
      SELECT 
        f.id, f.filing_type, f.address_raw, f.filed_at, a.dispatched_at as alerted_at
      FROM alerts_sent a
      JOIN filings f ON a.filing_id = f.id
      WHERE a.subscriber_id = ${id}
      ORDER BY a.dispatched_at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      id: subscriber.id,
      email: subscriber.email,
      business_name: subscriber.business_name,
      business_type: subscriber.business_type,
      filing_type_filters: subscriber.filing_type_filters,
      api_key: subscriber.api_key,
      status: subscriber.status,
      created_at: subscriber.created_at,
      updated_at: subscriber.updated_at,
      service_area: JSON.parse(subscriber.service_area as string),
      recent_alerts: recentAlerts.map((row) => ({
        id: row.id,
        filing_type: row.filing_type,
        address_raw: row.address_raw,
        filed_at: row.filed_at,
        alerted_at: row.alerted_at
      }))
    });
  } catch (error) {
    console.error("Failed to retrieve subscriber details:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
