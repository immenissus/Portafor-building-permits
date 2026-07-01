import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql, and } from "drizzle-orm";
import { jurisdictions, filings, alertsSent, quarantinedFilings } from "@/lib/db/schema";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 1000;

export async function POST(request: Request) {
  try {
    const adminKeyHeader = request.headers.get("X-Admin-Key");
    const expectedKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
      return NextResponse.json({ detail: "Unauthorized - Invalid X-Admin-Key" }, { status: 401 });
    }

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

    const columnFieldMap = jurisdiction.columnFieldMap as Record<string, string>;
    const startDate = new Date(start_date);
    const endDate = end_date ? new Date(end_date) : new Date();
    
    let currentWatermark = startDate;
    let totalIngested = 0;
    let totalQuarantined = 0;
    let batchCount = 0;
    const report: any[] = [];

    while (currentWatermark < endDate) {
      const watermarkStr = currentWatermark.toISOString().split(".")[0];
      const endDateStr = endDate.toISOString().split(".")[0];
      
      const issuedDateField = columnFieldMap.issued_date || "issued_date";
      const socrataUrl = `https://${jurisdiction.socrataDomain}/resource/${jurisdiction.resourceId}.json?$where=${issuedDateField} > '${watermarkStr}' AND ${issuedDateField} <= '${endDateStr}'&$order=${issuedDateField} ASC&$limit=${BATCH_SIZE}`;

      let response: Response;
      try {
        response = await fetch(socrataUrl, {
          headers: jurisdiction.appToken ? { "X-App-Token": jurisdiction.appToken } : {}
        });
        if (!response.ok) {
          throw new Error(`Socrata returned ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.error(`Failed to fetch batch for ${jurisdiction.name}:`, err);
        report.push({
          batch: batchCount + 1,
          status: "failed",
          error: err instanceof Error ? err.message : String(err)
        });
        break;
      }

      const rawRecords: any[] = await response.json();
      if (rawRecords.length === 0) {
        report.push({ batch: batchCount + 1, status: "complete", records: 0 });
        break;
      }

      let batchIngested = 0;
      let batchQuarantined = 0;

      for (const raw of rawRecords) {
        try {
          const remapped: Record<string, any> = {};
          for (const [canonicalKey, socrataKey] of Object.entries(columnFieldMap)) {
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
            .where(and(eq(filings.jurisdictionId, jurisdiction_id), eq(filings.externalId, externalId)))
            .limit(1);

          if (existing) continue;

          let latitude = remapped.latitude ? parseFloat(remapped.latitude) : null;
          let longitude = remapped.longitude ? parseFloat(remapped.longitude) : null;

          if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
            const filingId = crypto.randomUUID();
            await db.insert(filings).values({
              id: filingId,
              jurisdictionId: jurisdiction_id,
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
            jurisdictionId: jurisdiction_id,
            rawData: raw,
            errorLog: recordError instanceof Error ? recordError.stack || recordError.message : "Ingestion failure"
          });
          batchQuarantined++;
        }
      }

      totalIngested += batchIngested;
      totalQuarantined += batchQuarantined;
      batchCount++;

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

      await new Promise(resolve => setTimeout(resolve, 100));
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
