import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { jurisdictions, filings, alertsSent, quarantinedFilings } from "@/lib/db/schema";
import { authorizeAdmin } from "@/lib/admin-auth";
import { mapLimit } from "@/lib/async";
import { advanceWatermark, buildSodaUrl, fetchSodaJson, normalizeSodaRecord, type ColumnFieldMap } from "@/lib/socrata";
import { ENTITLED_FOR_DELIVERY_SQL } from "@/lib/billing";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 1000;
const GEOCODE_CONCURRENCY = 6;
const DEDUPE_CHUNK_SIZE = 200;
const MAX_BATCHES = 500;
const FETCH_TIMEOUT_MS = 30000;
const GEOCODE_TIMEOUT_MS = 15000;

type Candidate = {
  raw: Record<string, unknown>;
  externalId: string;
  addressRaw: string;
  filedAt: Date;
  latitude: number | null;
  longitude: number | null;
};

async function dedupeCandidates(jurisdictionId: string, candidates: Candidate[]): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const existingKeys = new Set<string>();
  for (let i = 0; i < candidates.length; i += DEDUPE_CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + DEDUPE_CHUNK_SIZE).map((c) => c.externalId);
    const existingRows = await db
      .select({ externalId: filings.externalId })
      .from(filings)
      .where(and(eq(filings.jurisdictionId, jurisdictionId), inArray(filings.externalId, chunk)));
    for (const row of existingRows) {
      existingKeys.add(row.externalId);
    }
  }
  return candidates.filter((c) => !existingKeys.has(c.externalId));
}

async function geocodeMissing(candidates: Candidate[]): Promise<void> {
  const needsGeocoding = candidates.filter(
    (c) => !c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude)
  );
  if (needsGeocoding.length === 0) return;
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) return;

  await mapLimit(needsGeocoding, GEOCODE_CONCURRENCY, async (candidate) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
      try {
        const geoResponse = await fetch(
          `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(candidate.addressRaw)}&limit=1&access_token=${mapboxToken}`,
          { signal: controller.signal }
        );
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          const feature = geoData.features?.[0];
          if (feature?.geometry?.coordinates) {
            candidate.longitude = feature.geometry.coordinates[0];
            candidate.latitude = feature.geometry.coordinates[1];
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (geoErr) {
      console.error(`Geocoding failed for ${candidate.addressRaw}:`, geoErr);
    }
  });
}

export async function POST(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

    const body = await request.json();
    const { jurisdiction_id, start_date, end_date } = body;

    if (!jurisdiction_id || !start_date) {
      return NextResponse.json({ detail: "jurisdiction_id and start_date are required" }, { status: 400 });
    }

    const [jurisdiction] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.id, jurisdiction_id))
      .limit(1);

    if (!jurisdiction) {
      return NextResponse.json({ detail: "Jurisdiction not found" }, { status: 404 });
    }

    const columnFieldMap = jurisdiction.columnFieldMap as ColumnFieldMap;
    const issuedDateField = columnFieldMap.issued_date || "issued_date";
    const startDate = new Date(start_date);
    const endDate = end_date ? new Date(end_date) : new Date();

    let currentWatermark = startDate;
    let totalIngested = 0;
    let totalQuarantined = 0;
    let batchCount = 0;
    const report: Array<Record<string, unknown>> = [];

    while (currentWatermark < endDate && batchCount < MAX_BATCHES) {
      const watermarkStr = currentWatermark.toISOString().split(".")[0];
      const endDateStr = endDate.toISOString().split(".")[0];

      const url = buildSodaUrl(jurisdiction.socrataDomain, jurisdiction.resourceId, {
        where: `${issuedDateField} > '${watermarkStr}' AND ${issuedDateField} <= '${endDateStr}'`,
        order: `${issuedDateField} ASC`,
        limit: BATCH_SIZE
      });

      let rawRecords: Array<Record<string, unknown>>;
      try {
        rawRecords = await fetchSodaJson(url, {
          appToken: jurisdiction.appToken ?? undefined,
          timeoutMs: FETCH_TIMEOUT_MS,
          retries: 1
        });
      } catch (err) {
        console.error(`Failed to fetch batch for ${jurisdiction.name}:`, err);
        report.push({
          batch: batchCount + 1,
          status: "failed",
          error: err instanceof Error ? err.message : String(err)
        });
        break;
      }

      if (rawRecords.length === 0) {
        report.push({ batch: batchCount + 1, status: "complete", records: 0 });
        break;
      }

      let batchIngested = 0;
      let batchQuarantined = 0;
      const candidates: Candidate[] = [];

      // Phase 1: remap, validate, normalize
      for (const raw of rawRecords) {
        const normalized = normalizeSodaRecord(raw, columnFieldMap);
        if (!normalized.externalId || !normalized.addressRaw || !normalized.filedAt) {
          await db.insert(quarantinedFilings).values({
            id: crypto.randomUUID(),
            jurisdictionId: jurisdiction_id,
            rawData: raw,
            errorLog: `Missing core fields: externalId=${normalized.externalId}, address=${normalized.addressRaw}, filedAt=${normalized.filedAt}`
          });
          batchQuarantined++;
          continue;
        }
        candidates.push({
          raw,
          externalId: normalized.externalId,
          addressRaw: normalized.addressRaw,
          filedAt: normalized.filedAt,
          latitude: normalized.latitude,
          longitude: normalized.longitude
        });
      }

      // Phase 2: deduplicate against existing filings (batched inArray)
      const newCandidates = await dedupeCandidates(jurisdiction_id, candidates);

      // Phase 3: geocode records missing coordinates (concurrency-limited)
      await geocodeMissing(newCandidates);

      // Separate valid candidates and quarantine the rest
      const toInsert = newCandidates.filter(
        (c) => c.latitude && c.longitude && !isNaN(c.latitude) && !isNaN(c.longitude)
      );
      for (const c of newCandidates) {
        if (!c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude)) {
          await db.insert(quarantinedFilings).values({
            id: crypto.randomUUID(),
            jurisdictionId: jurisdiction_id,
            rawData: c.raw,
            errorLog: `No coordinates available for address: ${c.addressRaw}`
          });
          batchQuarantined++;
        }
      }

      // Phase 4: batch-insert filings + Phase 5: batch matcher
      if (toInsert.length > 0) {
        const prepared = toInsert.map((c) => ({ ...c, id: crypto.randomUUID() }));
        const filingType = jurisdiction.filingType ?? "building_permit";
        await db
          .insert(filings)
          .values(
            prepared.map((p) => ({
              id: p.id,
              jurisdictionId: jurisdiction_id,
              externalId: p.externalId,
              filingType,
              addressRaw: p.addressRaw,
              geom: sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)`,
              filedAt: p.filedAt,
              rawData: p.raw
            }))
          )
          .onConflictDoNothing();

        batchIngested += prepared.length;

        const valuesList = prepared.map((p) => sql`(${p.id}, ${p.longitude}, ${p.latitude})`);
        const matches = await db.execute(sql`
          SELECT s.id AS subscriber_id, f.filing_id AS filing_id
          FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS f(filing_id, longitude, latitude)
          INNER JOIN subscribers s
            ON s.status = 'active'
           AND ${sql.raw(ENTITLED_FOR_DELIVERY_SQL)}
           AND s.filing_type_filters ? ${filingType}
           AND ST_Contains(s.service_area, ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326))
          WHERE NOT EXISTS (
            SELECT 1
            FROM alerts_sent a
            WHERE a.subscriber_id = s.id AND a.filing_id = f.filing_id
          )
        `);

        if (matches.length > 0) {
          await db
            .insert(alertsSent)
            .values(
              matches.map((m) => ({
                id: crypto.randomUUID(),
                subscriberId: String(m.subscriber_id),
                filingId: String(m.filing_id)
              }))
            )
            .onConflictDoNothing();
        }
      }

      // Advance the watermark from ALL fetched candidates, never past endDate.
      const maxSeen = candidates.length > 0 ? new Date(Math.max(...candidates.map((c) => c.filedAt.getTime()))) : null;
      const nextWatermark = advanceWatermark(currentWatermark, maxSeen, endDate);
      if (nextWatermark <= currentWatermark) break; // no progress -> avoid infinite loop
      currentWatermark = nextWatermark;
      batchCount++;

      totalIngested += batchIngested;
      totalQuarantined += batchQuarantined;

      report.push({
        batch: batchCount,
        recordsProcessed: rawRecords.length,
        ingested: batchIngested,
        quarantined: batchQuarantined,
        watermark: currentWatermark.toISOString()
      });

      if (rawRecords.length < BATCH_SIZE) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await db
      .update(jurisdictions)
      .set({
        watermarkDatetime: currentWatermark,
        lastSuccessAt: new Date(),
        totalIngested: jurisdiction.totalIngested + totalIngested,
        totalQuarantined: jurisdiction.totalQuarantined + totalQuarantined
      })
      .where(eq(jurisdictions.id, jurisdiction_id));

    return NextResponse.json({
      jurisdiction: jurisdiction.name,
      totalIngested,
      totalQuarantined,
      batchesProcessed: batchCount,
      finalWatermark: currentWatermark.toISOString(),
      details: report
    });
  } catch (error) {
    console.error("Backfill job failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}