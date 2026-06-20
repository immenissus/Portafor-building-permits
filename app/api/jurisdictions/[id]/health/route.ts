import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { jurisdictions, filings, quarantinedFilings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Fetch the jurisdiction
    const [jurisdiction] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.id, id))
      .limit(1);

    if (!jurisdiction) {
      return NextResponse.json({ detail: "Jurisdiction not found" }, { status: 404 });
    }

    // Calculate total filings ingested
    const [filingsCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(filings)
      .where(eq(filings.jurisdictionId, id));

    // Calculate total quarantined filings
    const [quarantinedCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quarantinedFilings)
      .where(eq(quarantinedFilings.jurisdictionId, id));

    return NextResponse.json({
      jurisdiction_id: jurisdiction.id,
      jurisdiction_name: jurisdiction.name,
      active: jurisdiction.isActive,
      last_polled_at: jurisdiction.lastPolledAt,
      last_successful_poll_at: jurisdiction.lastSuccessAt,
      consecutive_error_count: jurisdiction.consecutiveFailures,
      total_filings_ingested: filingsCountRes?.count ?? 0,
      total_quarantined: quarantinedCountRes?.count ?? 0
    });
  } catch (error) {
    console.error("Failed to query jurisdiction health:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
