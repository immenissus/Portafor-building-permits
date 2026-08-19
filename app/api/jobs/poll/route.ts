import { NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { jurisdictions, filings, alertsSent, quarantinedFilings, stripeWebhookEvents } from "@/lib/db/schema";
import { authorizeAdmin } from "@/lib/admin-auth";
import { mapLimit } from "@/lib/async";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const GEOCODE_CONCURRENCY = 6;
const DEDUPE_CHUNK_SIZE = 200;

type Candidate = {
  raw: Record<string, unknown>;
  externalId: string;
  addressRaw: string;
  filedAt: Date;
  filingType: string;
  latitude: number | null;
  longitude: number | null;
};

function resolveFilingType(jurisdiction: { name: string } & Record<string, unknown>): string {
  if (typeof jurisdiction.filingType === "string" && jurisdiction.filingType) {
    return jurisdiction.filingType;
  }
  return jurisdiction.name.toLowerCase().includes("license") ? "business_license" : "building_permit";
}

export async function GET(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

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
      details: [] as Array<Record<string, unknown>>
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
      const socrataUrl = `https://${jur.socrataDomain}/resource/${jur.resourceId}.json?$where=${columnFieldMap.issued_date || "issued_date"} > '${watermarkStr}'&$order=${columnFieldMap.issued_date || "issued_date"} ASC&$limit=1000`;

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

      const rawRecords = (await response.json()) as Array<Record<string, unknown>>;
      const candidates: Candidate[] = [];

      // Phase 1: remap, validate, and normalize records
      for (const raw of rawRecords) {
        try {
          const remapped: Record<string, string> = {};
          for (const [canonicalKey, socrataKey] of Object.entries(columnFieldMap)) {
            const value = raw[socrataKey];
            if (value !== undefined) {
              remapped[canonicalKey] = String(value);
            }
          }
          // Copy any raw Socrata fields that weren't explicitly mapped as fallbacks
          for (const [key, val] of Object.entries(raw)) {
            if (remapped[key] === undefined) {
              remapped[key] = String(val);
            }
          }

          const externalId = remapped.permit_number || remapped.license_number || remapped.id;
          const addressRaw = remapped.address;
          const filedAtStr = remapped.issued_date;

          if (!externalId || !addressRaw || !filedAtStr) {
            throw new Error(`Missing core fields: externalId=${externalId}, address=${addressRaw}, filedAt=${filedAtStr}`);
          }

          const filedAt = new Date(filedAtStr);
          if (isNaN(filedAt.getTime())) {
            throw new Error(`Invalid date: ${filedAtStr}`);
          }

          candidates.push({
            raw,
            externalId: String(externalId),
            addressRaw: String(addressRaw),
            filedAt,
            filingType: resolveFilingType(jur),
            latitude: remapped.latitude ? parseFloat(remapped.latitude) : null,
            longitude: remapped.longitude ? parseFloat(remapped.longitude) : null
          });
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

      // Phase 2: deduplicate against existing filings in one batched query per chunk
      let newCandidates = candidates;
      if (newCandidates.length > 0) {
        const existingKeys = new Set<string>();
        for (let i = 0; i < candidates.length; i += DEDUPE_CHUNK_SIZE) {
          const chunk = candidates.slice(i, i + DEDUPE_CHUNK_SIZE).map((c) => c.externalId);
          const existingRows = await db.execute(sql`
            SELECT external_id
            FROM filings
            WHERE jurisdiction_id = ${jur.id}
              AND external_id IN ${chunk}
          `);
          for (const row of existingRows) {
            existingKeys.add(String(row.external_id));
          }
        }
        newCandidates = candidates.filter((c) => !existingKeys.has(c.externalId));
      }

      // Phase 3: geocode records missing coordinates (concurrency-limited)
      const needsGeocoding = newCandidates.filter(
        (c) => !c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude)
      );
      if (needsGeocoding.length > 0) {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (token) {
          await mapLimit(needsGeocoding, GEOCODE_CONCURRENCY, async (candidate) => {
            const geocodeResponse = await fetch(
              `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(candidate.addressRaw)}&limit=1&access_token=${token}`
            );
            if (geocodeResponse.ok) {
              const geojson = await geocodeResponse.json();
              const center = geojson.features?.[0]?.geometry?.coordinates;
              if (center) {
                candidate.longitude = center[0];
                candidate.latitude = center[1];
              }
            }
          });
        }
      }

      // Separate candidates with valid coordinates for insertion
      const toInsert = newCandidates.filter(
        (c) => c.latitude && c.longitude && !isNaN(c.latitude) && !isNaN(c.longitude)
      );

      // Phase 4: batch-insert all new filings
      if (toInsert.length > 0) {
        const prepared = toInsert.map((c) => ({ ...c, id: crypto.randomUUID() }));
        await db.insert(filings).values(
          prepared.map((p) => ({
            id: p.id,
            jurisdictionId: jur.id,
            externalId: p.externalId,
            filingType: p.filingType,
            addressRaw: p.addressRaw,
            geom: sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)`,
            filedAt: p.filedAt,
            rawData: p.raw
          }))
        );

        jurNewFilings = prepared.length;
        report.totalNewFilings += prepared.length;

        // Phase 5: batch PostGIS matcher (one ST_Contains query per filing type)
        const types = [...new Set(prepared.map((c) => c.filingType))];
        for (const filingType of types) {
          const typed = prepared.filter((c) => c.filingType === filingType);
          const valuesList = typed.map((c) => sql`(${c.id}, ${c.longitude}, ${c.latitude})`);
          const matches = await db.execute(sql`
            SELECT s.id AS subscriber_id, f.filing_id AS filing_id
            FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS f(filing_id, longitude, latitude)
            INNER JOIN subscribers s
              ON s.status = 'active'
             AND s.filing_type_filters ? ${filingType}
             AND ST_Contains(s.service_area, ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326))
            WHERE NOT EXISTS (
              SELECT 1
              FROM alerts_sent a
              WHERE a.subscriber_id = s.id AND a.filing_id = f.filing_id
            )
          `);

          if (matches.length > 0) {
            await db.insert(alertsSent).values(
              matches.map((m) => ({
                id: crypto.randomUUID(),
                subscriberId: String(m.subscriber_id),
                filingId: String(m.filing_id)
              }))
            );
            jurMatchedAlerts += matches.length;
            report.totalMatchedAlerts += matches.length;
          }
        }
      }

      // Advance watermark to the latest processed record
      for (const c of toInsert) {
        if (c.filedAt > watermark) {
          watermark = c.filedAt;
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
        rawRecordsLength: rawRecords.length,
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