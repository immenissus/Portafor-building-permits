import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { eq, sql, and } from "drizzle-orm";
import { jurisdictions, filings, alertsSent, quarantinedFilings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const SEED_JURISDICTIONS = [
  {
    name: "Austin, TX",
    socrata_domain: "data.austintexas.gov",
    resource_id: "3syk-w9eu",
    app_token: null,
    column_field_map: {
      address: "permit_location",
      issued_date: "issue_date",
      permit_number: "permit_number",
      latitude: "latitude",
      longitude: "longitude"
    },
    start_date: "2025-01-01T00:00:00"
  },
  {
    name: "Orlando, FL",
    socrata_domain: "data.cityoforlando.net",
    resource_id: "ryhf-m453",
    app_token: null,
    column_field_map: {
      address: "permit_address",
      issued_date: "issue_permit_date",
      permit_number: "permit_number"
    },
    start_date: "2025-01-01T00:00:00"
  },
  {
    name: "Collin County, TX",
    socrata_domain: "data.texas.gov",
    resource_id: "82ee-gbj5",
    app_token: null,
    column_field_map: {
      address: "situsconcatshort",
      issued_date: "permitissueddate",
      permit_number: "permitnum"
    },
    start_date: "2025-01-01T00:00:00"
  }
];

const BATCH_SIZE = 1000;

async function backfillJurisdiction(jurisdiction: any, startDate: Date) {
  const endDate = new Date();
  let currentWatermark = startDate;
  let totalIngested = 0;
  let totalQuarantined = 0;
  let batchCount = 0;
  const details: any[] = [];

  while (currentWatermark < endDate) {
    const watermarkStr = currentWatermark.toISOString().split(".")[0];
    const endDateStr = endDate.toISOString().split(".")[0];
    
    const issuedDateField = jurisdiction.column_field_map.issued_date || "issued_date";
    const socrataUrl = `https://${jurisdiction.socrata_domain}/resource/${jurisdiction.resource_id}.json?$where=${issuedDateField} > '${watermarkStr}' AND ${issuedDateField} <= '${endDateStr}'&$order=${issuedDateField} ASC&$limit=${BATCH_SIZE}`;

    let response: Response;
    try {
      response = await fetch(socrataUrl, {
        headers: jurisdiction.app_token ? { "X-App-Token": jurisdiction.app_token } : {}
      });
      if (!response.ok) {
        throw new Error(`Socrata returned ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      details.push({
        batch: batchCount + 1,
        status: "failed",
        error: err instanceof Error ? err.message : String(err)
      });
      break;
    }

    const rawRecords: any[] = await response.json();
    if (rawRecords.length === 0) {
      details.push({ batch: batchCount + 1, status: "complete", records: 0 });
      break;
    }

    let batchIngested = 0;
    let batchQuarantined = 0;

    for (const raw of rawRecords) {
      try {
        const remapped: Record<string, any> = {};
        for (const [canonicalKey, socrataKey] of Object.entries(jurisdiction.column_field_map)) {
          const key = socrataKey as string;
          if (raw[key] !== undefined) {
            remapped[canonicalKey] = raw[key];
          }
        }
        for (const [key, val] of Object.entries(raw)) {
          if (remapped[key] === undefined) {
            remapped[key] = val;
          }
        }

        const externalId = remapped.permit_number || remapped.license_number || remapped.id || remapped.permitnum;
        const addressRaw = remapped.address || remapped.permit_address || remapped.situsconcatshort;
        const filedAtStr = remapped.issued_date;

        if (!externalId || !addressRaw || !filedAtStr) {
          throw new Error(`Missing core fields: externalId=${externalId}, address=${addressRaw}, filedAt=${filedAtStr}`);
        }

        const filedAt = new Date(filedAtStr);
        if (isNaN(filedAt.getTime())) {
          throw new Error(`Invalid date: ${filedAtStr}`);
        }

        const [existing] = await db
          .select({ id: filings.id })
          .from(filings)
          .where(and(eq(filings.jurisdictionId, jurisdiction.id), eq(filings.externalId, externalId)))
          .limit(1);

        if (existing) continue;

        let latitude = remapped.latitude ? parseFloat(remapped.latitude) : null;
        let longitude = remapped.longitude ? parseFloat(remapped.longitude) : null;

        // Geocode using Mapbox if coordinates are missing
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
          const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
          if (mapboxToken && addressRaw) {
            try {
              const geoResponse = await fetch(
                `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(addressRaw)}&limit=1&access_token=${mapboxToken}`
              );
              if (geoResponse.ok) {
                const geoData = await geoResponse.json();
                const feature = geoData.features?.[0];
                if (feature?.geometry?.coordinates) {
                  longitude = feature.geometry.coordinates[0];
                  latitude = feature.geometry.coordinates[1];
                }
              }
            } catch (geoErr) {
              console.error(`Geocoding failed for ${addressRaw}:`, geoErr);
            }
          }
        }

        if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
          const filingId = crypto.randomUUID();
          await db.insert(filings).values({
            id: filingId,
            jurisdictionId: jurisdiction.id,
            externalId,
            filingType: "building_permit",
            addressRaw,
            geom: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`,
            filedAt,
            rawData: raw
          });

          batchIngested++;

          const matchedSubscribers = await db.execute(sql`
            SELECT s.id, s.email, s.business_name
            FROM subscribers s
            WHERE s.status = 'active'
              AND ST_Contains(s.service_area, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
              AND s.filing_type_filters ? 'building_permit'
              AND NOT EXISTS (
                SELECT 1 
                FROM alerts_sent a 
                WHERE a.subscriber_id = s.id AND a.filing_id = ${filingId}
              )
          `);

          for (const sub of matchedSubscribers) {
            await db.insert(alertsSent).values({
              id: crypto.randomUUID(),
              subscriberId: sub.id as string,
              filingId
            });
          }
        } else {
          throw new Error(`No coordinates available for address: ${addressRaw}`);
        }

        if (filedAt > currentWatermark) {
          currentWatermark = filedAt;
        }
      } catch (recordError) {
        console.error("Failed to ingest record:", recordError, raw);
        await db.insert(quarantinedFilings).values({
          id: crypto.randomUUID(),
          jurisdictionId: jurisdiction.id,
          rawData: raw,
          errorLog: recordError instanceof Error ? recordError.stack || recordError.message : "Ingestion failure"
        });
        batchQuarantined++;
      }
    }

    totalIngested += batchIngested;
    totalQuarantined += batchQuarantined;
    batchCount++;

    details.push({
      batch: batchCount,
      recordsProcessed: rawRecords.length,
      ingested: batchIngested,
      quarantined: batchQuarantined,
      watermark: currentWatermark.toISOString()
    });

    if (rawRecords.length < BATCH_SIZE) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { totalIngested, totalQuarantined, batchesProcessed: batchCount, finalWatermark: currentWatermark.toISOString(), details };
}

export async function POST(request: Request) {
  try {
    const adminKeyHeader = request.headers.get("X-Admin-Key");
    const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
      return NextResponse.json({ detail: "Unauthorized - Invalid X-Admin-Key" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { jurisdictions_to_seed, skip_backfill } = body as { jurisdictions_to_seed?: string[]; skip_backfill?: boolean };

    const results: any[] = [];

    for (const seedJurisdiction of SEED_JURISDICTIONS) {
      if (jurisdictions_to_seed && !jurisdictions_to_seed.includes(seedJurisdiction.name)) {
        continue;
      }

      const [existing] = await db
        .select({ id: jurisdictions.id })
        .from(jurisdictions)
        .where(eq(jurisdictions.name, seedJurisdiction.name))
        .limit(1);

      let jurisdictionId: string;

      if (existing) {
        jurisdictionId = existing.id;
        results.push({
          name: seedJurisdiction.name,
          status: "already_exists",
          id: jurisdictionId
        });
      } else {
        jurisdictionId = crypto.randomUUID();
        await db.insert(jurisdictions).values({
          id: jurisdictionId,
          name: seedJurisdiction.name,
          socrataDomain: seedJurisdiction.socrata_domain,
          resourceId: seedJurisdiction.resource_id,
          appToken: seedJurisdiction.app_token,
          columnFieldMap: seedJurisdiction.column_field_map,
          isActive: true
        });

        results.push({
          name: seedJurisdiction.name,
          status: "created",
          id: jurisdictionId
        });
      }

      if (!skip_backfill) {
        const [jurisdictionRecord] = await db
          .select()
          .from(jurisdictions)
          .where(eq(jurisdictions.id, jurisdictionId))
          .limit(1);

        if (jurisdictionRecord && !jurisdictionRecord.watermarkDatetime) {
          const backfillResult = await backfillJurisdiction(
            { ...seedJurisdiction, id: jurisdictionId },
            new Date(seedJurisdiction.start_date)
          );
          results.push({
            name: seedJurisdiction.name,
            status: "backfilled",
            ...backfillResult
          });
        } else {
          results.push({
            name: seedJurisdiction.name,
            status: "skipped_backfill",
            reason: jurisdictionRecord?.watermarkDatetime ? "already has watermark" : "jurisdiction not found"
          });
        }
      }
    }

    return NextResponse.json({
      message: "Seed operation completed",
      jurisdictions: results
    });
  } catch (error) {
    console.error("Seed job failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
