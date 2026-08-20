import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { subscribers, alertsSent } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
import { eq, sql } from "drizzle-orm";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });

export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ detail: "DATABASE_URL environment variable is missing on Vercel" }, { status: 500 });
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    // Retrieve user email from Clerk
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress ?? "";

    const body = await request.json();
    const { business_name, business_type, filing_type_filters, service_area, email: bodyEmail, market } = body;
    const subscriberEmail = bodyEmail || email;

    if (!business_name || !business_type || !filing_type_filters || !service_area) {
      return NextResponse.json({ detail: "Missing required fields" }, { status: 400 });
    }

    const serviceAreaGeoJson = JSON.stringify(service_area);

    // Check if subscriber already exists
    const [existing] = await db
      .select({ id: subscribers.id, apiKey: subscribers.apiKey })
      .from(subscribers)
      .where(eq(subscribers.id, userId))
      .limit(1);

    let apiKey = existing?.apiKey;

    if (existing) {
      // Perform Update (Upsert)
      await db
        .update(subscribers)
        .set({
          businessName: business_name,
          businessType: business_type,
          filingTypeFilters: filing_type_filters,
          serviceArea: sql`ST_GeomFromGeoJSON(${serviceAreaGeoJson})`,
          ...(bodyEmail ? { email: bodyEmail } : {}),
          market: market || "austin",
          updatedAt: new Date()
        })
        .where(eq(subscribers.id, userId));
    } else {
      // Generate unique API Key: sb_key_...
      apiKey = `sb_key_${crypto.randomBytes(24).toString("hex")}`;

      // Perform Insert
      await db.insert(subscribers).values({
        id: userId,
        email: subscriberEmail,
        businessName: business_name,
        businessType: business_type,
        filingTypeFilters: filing_type_filters,
        serviceArea: sql`ST_GeomFromGeoJSON(${serviceAreaGeoJson})`,
        apiKey: apiKey,
        market: market || "austin",
        status: "active"
      });

      // Synchronize back to Clerk publicMetadata so status / webhooks work seamlessly
      await clerk.users.updateUser(userId, {
        publicMetadata: {
          plan: "Free",
          status: "active"
        }
      });
    }

    // -------------------------------------------------------------------------
    // INSTANT HISTORICAL ALERT PRE-POPULATION (create only)
    // -------------------------------------------------------------------------
    // On FIRST creation, link the 10 most recent filings inside this contractor's
    // zone as active alerts. On profile/zone UPDATES we deliberately do NOT touch
    // alerts_sent — clearing + re-inserting would resurrect digested alerts and
    // re-email old permits in the next digest run.
    if (!existing) {
      try {
        const pastMatches = await db.execute(sql`
          SELECT id 
          FROM filings 
          WHERE ST_Contains(ST_GeomFromGeoJSON(${serviceAreaGeoJson}), geom)
            AND ${JSON.stringify(filing_type_filters)}::jsonb ? filing_type
          ORDER BY filed_at DESC
          LIMIT 10
        `);

        if (pastMatches.length > 0) {
          await db
            .insert(alertsSent)
            .values(
              pastMatches.map((match) => ({
                id: crypto.randomUUID(),
                subscriberId: userId,
                filingId: match.id as string
              }))
            )
            .onConflictDoNothing();
        }
        console.log(`Instant Matching: Pre-populated subscriber ${userId} with ${pastMatches.length} historical leads.`);
      } catch (matchErr) {
        console.error("Instant historical alerts matching failed:", matchErr);
      }
    }

    // Retrieve the newly created / updated record (converting geometry back to GeoJSON)
    const result = await db.execute(sql`
      SELECT 
        id, email, business_name, business_type, filing_type_filters, api_key, status, created_at, updated_at,
        ST_AsGeoJSON(service_area) as service_area
      FROM subscribers 
      WHERE id = ${userId}
      LIMIT 1
    `);

    const updated = result[0];
    if (!updated) {
      return NextResponse.json({ detail: "Failed to fetch updated subscriber" }, { status: 500 });
    }

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      business_name: updated.business_name,
      business_type: updated.business_type,
      filing_type_filters: updated.filing_type_filters,
      api_key: updated.api_key,
      status: updated.status,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      service_area: JSON.parse(updated.service_area as string)
    }, { status: existing ? 200 : 211 }); // 211 / 201 Created or 200 OK
  } catch (error) {
    console.error("Failed to upsert subscriber:", error);

    const pgError = error as { message?: string; detail?: string; hint?: string; cause?: unknown } | null;
    let dbErrorMessage = pgError && typeof pgError === "object" ? pgError.message ?? "Something went wrong" : "Something went wrong";
    if (pgError && typeof pgError === "object") {
      if (pgError.detail) dbErrorMessage += ` (${pgError.detail})`;
      if (pgError.hint) dbErrorMessage += ` [Hint: ${pgError.hint}]`;
      if (pgError.cause) {
        const causeMessage = pgError.cause instanceof Error ? pgError.cause.message : String(pgError.cause);
        dbErrorMessage += ` | Connection Cause: ${causeMessage}`;
      }
    }

    return NextResponse.json({ detail: dbErrorMessage }, { status: 500 });
  }
}
