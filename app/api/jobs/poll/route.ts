import { NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { jurisdictions, filings, alertsSent, quarantinedFilings, stripeWebhookEvents } from "@/lib/db/schema";
import { authorizeAdmin } from "@/lib/admin-auth";
import { mapLimit } from "@/lib/async";
import { advanceWatermark, buildSodaUrl, fetchSodaJson, normalizeSodaRecord, type ColumnFieldMap } from "@/lib/socrata";
import { mergeClerkPublicMetadata, resolveMetadataPatch, ENTITLED_FOR_DELIVERY_SQL } from "@/lib/billing";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const GEOCODE_CONCURRENCY = 6;
const DEDUPE_CHUNK_SIZE = 200;
const PAGE_SIZE = 1000;
const MAX_BATCHES = 10;
const MATCH_CHUNK_SIZE = 500;
const FETCH_TIMEOUT_MS = 30000;
const GEOCODE_TIMEOUT_MS = 15000;

type Candidate = {
  raw: Record<string, unknown>;
  externalId: string;
  addressRaw: string;
  filedAt: Date;
  filingType: string;
  latitude: number | null;
  longitude: number | null;
};

type PreparedCandidate = Candidate & { id: string };

function resolveFilingType(jurisdiction: { name: string } & Record<string, unknown>): string {
  if (typeof jurisdiction.filingType === "string" && jurisdiction.filingType) {
    return jurisdiction.filingType;
  }
  return jurisdiction.name.toLowerCase().includes("license") ? "business_license" : "building_permit";
}

/**
 * Heal failed Stripe webhook events using the stored payload (no hardcoded
 * plan) and MERGED Clerk metadata (preserves role: admin).
 */
async function healFailedWebhookEvents(): Promise<void> {
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
    const failedEvents = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.status, "failed"));

    for (const event of failedEvents) {
      if (!event.clerkUserId) continue;
      const payload = event.payload as { data?: { object?: Record<string, unknown> } };
      const patch = resolveMetadataPatch({ type: event.type, object: payload.data?.object });
      if (!patch) continue;
      try {
        await mergeClerkPublicMetadata(clerk, event.clerkUserId, patch);
        await db
          .update(stripeWebhookEvents)
          .set({ status: "processed", processedAt: new Date() })
          .where(eq(stripeWebhookEvents.id, event.id));
        console.log(`Self-Healing Queue: recovered event ${event.id} for user ${event.clerkUserId}`);
      } catch (healErr) {
        console.error(`Self-Healing Queue: failed to heal event ${event.id}:`, healErr);
      }
    }
  } catch (queueErr) {
    console.error("Self-healing webhook queue recovery failed:", queueErr);
  }
}

/**
 * Deduplicate candidates against existing filings with batched IN queries
 * (fixes the broken `external_id IN ${array}` interpolation).
 */
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

/** Geocode candidates missing coordinates with bounded concurrency + timeout. */
async function geocodeMissing(candidates: Candidate[]): Promise<void> {
  const needsGeocoding = candidates.filter(
    (c) => !c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude)
  );
  if (needsGeocoding.length === 0) return;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return;

  await mapLimit(needsGeocoding, GEOCODE_CONCURRENCY, async (candidate) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
      try {
        const geoResponse = await fetch(
          `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(candidate.addressRaw)}&limit=1&access_token=${token}`,
          { signal: controller.signal }
        );
        if (geoResponse.ok) {
          const geojson = await geoResponse.json();
          const center = geojson.features?.[0]?.geometry?.coordinates;
          if (center) {
            candidate.longitude = center[0];
            candidate.latitude = center[1];
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.error(`Geocoding failed for ${candidate.addressRaw}:`, err);
    }
  });
}

/** Batch PostGIS matcher: one ST_Contains query per filing type. */
async function dispatchMatchedAlerts(jurisdictionId: string, prepared: PreparedCandidate[]): Promise<number> {
  const types = [...new Set(prepared.map((c) => c.filingType))];
  let total = 0;
  for (const filingType of types) {
    const typed = prepared.filter((c) => c.filingType === filingType);
    for (let offset = 0; offset < typed.length; offset += MATCH_CHUNK_SIZE) {
      const chunk = typed.slice(offset, offset + MATCH_CHUNK_SIZE);
      const valuesList = chunk.map((c) => sql`(${c.id}, ${c.longitude}, ${c.latitude})`);
      const matches = await db.execute(sql`
      SELECT s.id AS subscriber_id, f.filing_id AS filing_id
      FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS f(filing_id, longitude, latitude)
      INNER JOIN subscribers s
        ON s.status = 'active'
       AND ${sql.raw(ENTITLED_FOR_DELIVERY_SQL)}
       AND s.filing_type_filters ? ${filingType}
        AND ST_Contains(
          s.service_area,
          ST_SetSRID(ST_MakePoint(f.longitude::double precision, f.latitude::double precision), 4326)
        )
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
        total += matches.length;
      }
    }
  }
  return total;
}

/** Poll one jurisdiction with pagination and a future-date-safe watermark. */
async function pollJurisdiction(jur: typeof jurisdictions.$inferSelect) {
  const columnFieldMap = jur.columnFieldMap as ColumnFieldMap;
  const issuedDateField = columnFieldMap.issued_date || "issued_date";
  const now = new Date();
  let watermark = jur.watermarkDatetime ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let newFilings = 0;
  let alertsDispatched = 0;
  let quarantined = 0;
  let totalFetched = 0;
  let batches = 0;
  let lastSourceRecordAt: Date | null = null;
  const issuedDateSource = typeof columnFieldMap.issued_date === "string" ? columnFieldMap.issued_date : null;

  while (batches < MAX_BATCHES) {
    const watermarkStr = watermark.toISOString().split(".")[0];
    const url = buildSodaUrl(jur.socrataDomain, jur.resourceId, {
      where: `${issuedDateField} > '${watermarkStr}'`,
      order: `${issuedDateField} ASC`,
      limit: PAGE_SIZE
    });

    const rawRecords = await fetchSodaJson(url, {
      appToken: jur.appToken ?? undefined,
      timeoutMs: FETCH_TIMEOUT_MS,
      retries: 1
    });
    totalFetched += rawRecords.length;
    for (const raw of rawRecords) {
      const sourceDate = issuedDateSource && typeof raw[issuedDateSource] === "string"
        ? new Date(`${raw[issuedDateSource]}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(raw[issuedDateSource])) ? "" : "Z"}`)
        : null;
      if (sourceDate && !Number.isNaN(sourceDate.getTime()) && (!lastSourceRecordAt || sourceDate > lastSourceRecordAt)) {
        lastSourceRecordAt = sourceDate;
      }
    }
    if (rawRecords.length === 0) break;

    const candidates: Candidate[] = [];
    for (const raw of rawRecords) {
      const normalized = normalizeSodaRecord(raw, columnFieldMap);
      if (!normalized.externalId || !normalized.addressRaw || !normalized.filedAt) {
        await db.insert(quarantinedFilings).values({
          id: crypto.randomUUID(),
          jurisdictionId: jur.id,
          rawData: raw,
          errorLog: `Missing core fields: externalId=${normalized.externalId}, address=${normalized.addressRaw}, filedAt=${normalized.filedAt}`
        });
        quarantined++;
        continue;
      }
      candidates.push({
        raw,
        externalId: normalized.externalId,
        addressRaw: normalized.addressRaw,
        filedAt: normalized.filedAt,
        filingType: resolveFilingType(jur),
        latitude: normalized.latitude,
        longitude: normalized.longitude
      });
    }

    const newCandidates = await dedupeCandidates(jur.id, candidates);
    await geocodeMissing(newCandidates);

    const toInsert = newCandidates.filter(
      (c) => c.latitude && c.longitude && !isNaN(c.latitude) && !isNaN(c.longitude)
    );
    for (const c of newCandidates) {
      if (!c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude)) {
        await db.insert(quarantinedFilings).values({
          id: crypto.randomUUID(),
          jurisdictionId: jur.id,
          rawData: c.raw,
          errorLog: `No coordinates available for address: ${c.addressRaw}`
        });
        quarantined++;
      }
    }

    if (toInsert.length > 0) {
      const prepared: PreparedCandidate[] = toInsert.map((c) => ({ ...c, id: crypto.randomUUID() }));
      const inserted = await db
        .insert(filings)
        .values(
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
        )
        .onConflictDoNothing()
        .returning({ id: filings.id });

      newFilings += inserted.length;
      alertsDispatched += await dispatchMatchedAlerts(jur.id, prepared);
    }

    // Advance the watermark from ALL fetched candidates (not just inserted),
    // capped at now so future-dated permits never stall ingestion.
    const maxSeen = candidates.length > 0 ? new Date(Math.max(...candidates.map((c) => c.filedAt.getTime()))) : null;
    const nextWatermark = advanceWatermark(watermark, maxSeen, now);
    if (nextWatermark <= watermark) break; // no progress -> avoid infinite loop
    watermark = nextWatermark;
    batches++;

    if (rawRecords.length < PAGE_SIZE) break;
  }

  await db
    .update(jurisdictions)
    .set({
      watermarkDatetime: watermark,
      consecutiveFailures: 0,
      lastPolledAt: new Date(),
      lastSuccessAt: new Date(),
      totalIngested: jur.totalIngested + newFilings,
      totalQuarantined: jur.totalQuarantined + quarantined,
      lastSourceRecordAt,
      lastRecordsFetched: totalFetched,
      lastNewFilings: newFilings,
      lastError: null,
      syncStatus: totalFetched === 0 ? "empty" : "healthy"
    })
    .where(eq(jurisdictions.id, jur.id));

  return { status: "success", recordsFetched: totalFetched, newFilings, alertsDispatched, quarantined, batches };
}

async function probeSourceNewestDate(jur: typeof jurisdictions.$inferSelect): Promise<Date | null> {
  const map = jur.columnFieldMap as ColumnFieldMap;
  const dateField = typeof map.issued_date === "string" ? map.issued_date : null;
  if (!dateField) return null;

  const url = buildSodaUrl(jur.socrataDomain, jur.resourceId, {
    order: `${dateField} DESC`,
    limit: 1
  });
  const rows = await fetchSodaJson(url, {
    appToken: jur.appToken ?? undefined,
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: 1
  });
  const value = rows[0]?.[dateField];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(`${value}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? "" : "Z"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

    await healFailedWebhookEvents();

    const { searchParams } = new URL(request.url);
    const jurisdictionId = searchParams.get("jurisdiction_id");
    const force = searchParams.get("force") === "true" || searchParams.get("force") === "1";

    // Fetch all active Socrata jurisdictions (optionally a single one)
    const activeJurisdictions = jurisdictionId
      ? await db
          .select()
          .from(jurisdictions)
          .where(and(eq(jurisdictions.isActive, true), eq(jurisdictions.id, jurisdictionId)))
      : await db.select().from(jurisdictions).where(eq(jurisdictions.isActive, true));

    // Respect per-jurisdiction poll_interval_hours (default 24h). A targeted
    // ?jurisdiction_id= poll or ?force=true always runs immediately.
    const eligible = activeJurisdictions.filter((jur) => {
      if (force || jurisdictionId) return true;
      if (!jur.lastPolledAt) return true;
      const intervalMs = (jur.pollIntervalHours ?? 24) * 60 * 60 * 1000;
      return Date.now() - new Date(jur.lastPolledAt).getTime() >= intervalMs;
    });

    // Diagnostic query: all registered jurisdictions to inspect sync state
    const allJurisdictions = await db
      .select({ id: jurisdictions.id, name: jurisdictions.name, isActive: jurisdictions.isActive })
      .from(jurisdictions);

    const report = {
      timestamp: new Date().toISOString(),
      jurisdictionsProcessed: 0,
      jurisdictionsSkipped: activeJurisdictions.length - eligible.length,
      totalNewFilings: 0,
      totalMatchedAlerts: 0,
      totalJurisdictionsInDb: allJurisdictions.length,
      allJurisdictionsInDb: allJurisdictions,
      details: [] as Array<Record<string, unknown>>
    };

    for (const jur of eligible) {
      const attemptAt = new Date();
      await db
        .update(jurisdictions)
        .set({ lastAttemptAt: attemptAt })
        .where(eq(jurisdictions.id, jur.id));
      try {
        let sourceNewestDate: Date | null = null;
        let sourceProbeError: string | null = null;
        try {
          sourceNewestDate = await probeSourceNewestDate(jur);
        } catch (probeError) {
          sourceProbeError = probeError instanceof Error ? probeError.message : String(probeError);
        }
        const outcome = await pollJurisdiction(jur);
        await db
          .update(jurisdictions)
          .set({ lastSourceRecordAt: sourceNewestDate })
          .where(eq(jurisdictions.id, jur.id));
        report.details.push({
          jurisdiction: jur.name,
          ...outcome,
          sourceNewestDate: sourceNewestDate?.toISOString() ?? null,
          sourceProbeError
        });
        report.jurisdictionsProcessed++;
        report.totalNewFilings += outcome.newFilings;
        report.totalMatchedAlerts += outcome.alertsDispatched;
      } catch (err) {
        console.error(`Failed to poll ${jur.name}:`, err);
      await db
        .update(jurisdictions)
        .set({
          consecutiveFailures: jur.consecutiveFailures + 1,
          lastError: err instanceof Error ? err.message : String(err),
          syncStatus: "failed"
        })
          .where(eq(jurisdictions.id, jur.id));
        report.details.push({
          jurisdiction: jur.name,
          status: "failed",
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Filing poller job failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
  }
}
