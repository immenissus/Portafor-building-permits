import { NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eq, sql, and } from "drizzle-orm";
import { jurisdictions, filings, alertsSent, quarantinedFilings, stripeWebhookEvents } from "@/lib/db/schema";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 0. Webhook Self-Healing Retry Queue (Heals any failed Clerk synchronizations)
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
      const failedEvents = await db
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.status, "failed"));

      for (const event of failedEvents) {
        if (event.clerkUserId) {
          let success = false;
          if (event.type === "checkout.session.completed" || event.type === "invoice.paid") {
            await clerk.users.updateUser(event.clerkUserId, {
              publicMetadata: { plan: "Starter Yearly", status: "active" }
            });
            success = true;
          } else if (event.type === "customer.subscription.deleted") {
            await clerk.users.updateUser(event.clerkUserId, {
              publicMetadata: { plan: "Free", status: "active" }
            });
            success = true;
          }

          if (success) {
            await db
              .update(stripeWebhookEvents)
              .set({ status: "processed", processedAt: new Date() })
              .where(eq(stripeWebhookEvents.id, event.id));
            console.log(`Self-Healing Queue: Successfully recovered event ${event.id} for user ${event.clerkUserId}`);
          }
        }
      }
    } catch (queueErr) {
      console.error("Self-healing webhook queue recovery failed:", queueErr);
    }

    // 1. Fetch all active Socrata jurisdictions
    const activeJurisdictions = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.isActive, true));

    // Diagnostic query: Fetch all registered jurisdictions to inspect database synchronization state
    const allJurisdictions = await db
      .select({ id: jurisdictions.id, name: jurisdictions.name, isActive: jurisdictions.isActive })
      .from(jurisdictions);

    const report = {
      timestamp: new Date().toISOString(),
      jurisdictionsProcessed: 0,
      totalNewFilings: 0,
      totalMatchedAlerts: 0,
      totalJurisdictionsInDb: allJurisdictions.length,
      allJurisdictionsInDb: allJurisdictions,
      details: [] as any[]
    };

    for (const jur of activeJurisdictions) {
      let jurNewFilings = 0;
      let jurMatchedAlerts = 0;
      let watermark = jur.watermarkDatetime;

      // Default watermark to 24 hours ago if empty (to prevent full table downloads on initial poller run)
      if (!watermark) {
        watermark = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      const watermarkStr = watermark.toISOString().split(".")[0]; // YYYY-MM-DDTHH:MM:SS format
      const columnFieldMap = jur.columnFieldMap as Record<string, string>;
      const socrataUrl = `https://${jur.socrataDomain}/resource/${jur.resourceId}.json?$where=${columnFieldMap.issued_date || "issued_date"} > '${watermarkStr}'&$order=${columnFieldMap.issued_date || "issued_date"} ASC&$limit=20`;

      let response: Response;
      try {
        response = await fetch(socrataUrl, {
          headers: jur.appToken ? { "X-App-Token": jur.appToken } : {}
        });
        if (!response.ok) {
          throw new Error(`Socrata returned ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.error(`Failed to poll Socrata for ${jur.name}:`, err);
        await db
          .update(jurisdictions)
          .set({ consecutiveFailures: jur.consecutiveFailures + 1 })
          .where(eq(jurisdictions.id, jur.id));
        
        report.details.push({
          jurisdiction: jur.name,
          status: "failed",
          error: err instanceof Error ? err.message : String(err)
        });
        continue;
      }

      const rawRecords: any[] = await response.json();

      for (const raw of rawRecords) {
        try {
          // Remap custom columns based on columnFieldMap
          const remapped: Record<string, any> = {};
          for (const [key, val] of Object.entries(raw)) {
            const mappedKey = columnFieldMap[key] || key;
            remapped[mappedKey] = val;
          }

          const externalId = remapped.permit_number || remapped.license_number || remapped.id;
          const addressRaw = remapped.address;
          const filingType = remapped.permit_type || remapped.license_type || "building_permit";
          const filedAtStr = remapped.issued_date;

          if (!externalId || !addressRaw || !filedAtStr) {
            throw new Error(`Missing core fields: externalId=${externalId}, address=${addressRaw}, filedAt=${filedAtStr}`);
          }

          const filedAt = new Date(filedAtStr);

          // Check if filing already exists (duplicate checking)
          const [existing] = await db
            .select({ id: filings.id })
            .from(filings)
            .where(and(eq(filings.jurisdictionId, jur.id), eq(filings.externalId, externalId)))
            .limit(1);

          if (existing) continue;

          // Coordinate resolution: fallback to Mapbox Geocoding if missing from Socrata
          let latitude = remapped.latitude ? parseFloat(remapped.latitude) : null;
          let longitude = remapped.longitude ? parseFloat(remapped.longitude) : null;

          if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
            if (token) {
              const geocodeResponse = await fetch(
                `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(addressRaw)}&limit=1&access_token=${token}`
              );
              if (geocodeResponse.ok) {
                const geojson = await geocodeResponse.json();
                const center = geojson.features?.[0]?.geometry?.coordinates;
                if (center) {
                  longitude = center[0];
                  latitude = center[1];
                }
              }
            }
          }

          if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            throw new Error(`Failed to geocode address: ${addressRaw}`);
          }

          const filingId = crypto.randomUUID();

          // 3. Store successful filing with PostGIS POINT geometry
          await db.insert(filings).values({
            id: filingId,
            jurisdictionId: jur.id,
            externalId,
            filingType,
            addressRaw,
            geom: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`,
            filedAt,
            rawData: raw
          });

          jurNewFilings++;
          report.totalNewFilings++;

          // 4. Run PostGIS Matcher ST_Contains
          const matchedSubscribers = await db.execute(sql`
            SELECT s.id, s.email, s.business_name
            FROM subscribers s
            WHERE s.status = 'active'
              AND ST_Contains(s.service_area, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
              AND s.filing_type_filters ? ${filingType}
              AND NOT EXISTS (
                SELECT 1 
                FROM alerts_sent a 
                WHERE a.subscriber_id = s.id AND a.filing_id = ${filingId}
              )
          `);

          // 5. Send alerts & Log AlertSent record
          for (const sub of matchedSubscribers) {
            await db.insert(alertsSent).values({
              id: crypto.randomUUID(),
              subscriberId: sub.id as string,
              filingId
            });

            jurMatchedAlerts++;
            report.totalMatchedAlerts++;

            // Email alert dispatch (Uses Resend or falls back to console logging in development)
            try {
              const filingLabel = filingType.replace("_", " ").toUpperCase();
              const subject = `[RoofLead Alert] New ${filingLabel} in your service area!`;
              const textBody = `Hello ${sub.business_name},\n\nWe found a new ${filingLabel} in your area:\n- Address: ${addressRaw}\n- Date: ${filedAtStr}\n\nBest,\nRoofLead Team`;

              if (process.env.RESEND_API_KEY) {
                const senderEmail = process.env.SENDER_EMAIL || "onboarding@resend.dev";
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`
                  },
                  body: JSON.stringify({
                    from: senderEmail,
                    to: sub.email,
                    subject,
                    text: textBody
                  })
                });
              } else {
                console.log(`[Email Mock Dispatch] Sent to: ${sub.email} | Subject: ${subject}`);
              }
            } catch (emailErr) {
              console.error(`Failed to send email alert to ${sub.email}:`, emailErr);
            }
          }

          // Advance watermark to the latest processed record
          if (!watermark || filedAt > watermark) {
            watermark = filedAt;
          }
        } catch (recordError) {
          console.error("Failed to ingest raw record:", recordError, raw);
          await db.insert(quarantinedFilings).values({
            id: crypto.randomUUID(),
            jurisdictionId: jur.id,
            rawData: raw,
            errorLog: recordError instanceof Error ? recordError.stack || recordError.message : "Ingestion failure"
          });
        }
      }

      // Update jurisdiction sync stats and watermark
      await db
        .update(jurisdictions)
        .set({
          watermarkDatetime: watermark,
          consecutiveFailures: 0,
          lastPolledAt: new Date(),
          lastSuccessAt: new Date(),
          totalIngested: jur.totalIngested + jurNewFilings
        })
        .where(eq(jurisdictions.id, jur.id));

      report.details.push({
        jurisdiction: jur.name,
        newFilings: jurNewFilings,
        alertsDispatched: jurMatchedAlerts
      });
      report.jurisdictionsProcessed++;
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Filing poller job failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
