export interface SodaFetchOptions {
  appToken?: string;
  timeoutMs?: number;
  retries?: number;
}

export interface SodaUrlOptions {
  where?: string;
  order?: string;
  limit?: number;
}

/**
 * column_field_map shape: canonical key -> Socrata column name, or a list of
 * columns to join into one value (used for split street addresses).
 */
export type ColumnFieldMap = Record<string, string | string[]>;

export interface NormalizedSodaRecord {
  externalId: string | null;
  addressRaw: string | null;
  filedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  raw: Record<string, unknown>;
}

/**
 * Build a Socrata SODA JSON resource URL with properly URL-encoded query params.
 */
export function buildSodaUrl(domain: string, resourceId: string, options: SodaUrlOptions = {}): string {
  const params = new URLSearchParams();
  if (options.where) params.set("$where", options.where);
  if (options.order) params.set("$order", options.order);
  params.set("$limit", String(options.limit ?? 1000));
  return `https://${domain}/resource/${resourceId}.json?${params.toString()}`;
}

/**
 * Fetch JSON from Socrata with a timeout and bounded retries.
 * Retries 5xx and network/timeout errors; 4xx is never retried.
 */
export async function fetchSodaJson(
  url: string,
  options: SodaFetchOptions = {}
): Promise<Record<string, unknown>[]> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const attempts = (options.retries ?? 1) + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: options.appToken ? { "X-App-Token": options.appToken } : {},
        signal: controller.signal
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();
        if (!contentType.includes("json")) {
          throw new Error(
            `Socrata returned non-JSON content (${contentType || "unknown"}) for ${url}: ${text.slice(0, 80).replace(/\s+/g, " ")}`
          );
        }
        try {
          return JSON.parse(text) as Record<string, unknown>[];
        } catch {
          throw new Error(
            `Socrata returned invalid JSON for ${url}: ${text.slice(0, 80).replace(/\s+/g, " ")}`
          );
        }
      }
      const message = `Socrata returned ${response.status} ${response.statusText}`;
      if (response.status >= 500 && attempt < attempts - 1) {
        lastError = new Error(message);
        continue;
      }
      throw new Error(message);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts - 1) break;
      const retryable = err instanceof Error && (err.name === "AbortError" || err instanceof TypeError);
      if (retryable) continue;
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Normalize a raw Socrata record into canonical fields.
 * Applies the jurisdiction column_field_map, then copies any remaining raw
 * columns as fallbacks, then extracts externalId / addressRaw / filedAt / coords.
 */
export function normalizeSodaRecord(
  raw: Record<string, unknown>,
  columnFieldMap: ColumnFieldMap
): NormalizedSodaRecord {
  const remapped: Record<string, string> = {};
  for (const [canonicalKey, sources] of Object.entries(columnFieldMap)) {
    const keys = Array.isArray(sources) ? sources : [sources];
    const parts = keys
      .map((source) => raw[source])
      .filter((value): value is string | number => value !== undefined && value !== null)
      .map(String)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length > 0) {
      remapped[canonicalKey] = parts.join(" ");
    }
  }
  for (const [key, val] of Object.entries(raw)) {
    if (val !== undefined && val !== null && remapped[key] === undefined) {
      remapped[key] = String(val);
    }
  }

  const externalId = remapped.permit_number || remapped.license_number || remapped.id || remapped.permitnum || null;
  const addressRaw = remapped.address || remapped.permit_address || remapped.situsconcatshort || null;
  const filedAt = remapped.issued_date ? parseSodaDate(remapped.issued_date) : null;

  let latitude: number | null = remapped.latitude ? parseFloat(remapped.latitude) : null;
  let longitude: number | null = remapped.longitude ? parseFloat(remapped.longitude) : null;
  if (latitude !== null && isNaN(latitude)) latitude = null;
  if (longitude !== null && isNaN(longitude)) longitude = null;

  return { externalId, addressRaw, filedAt, latitude, longitude, raw };
}

function parseSodaDate(value: string): Date | null {
  // Socrata emits timestamps without a timezone designator (e.g. 2026-07-01T00:00:00.000);
  // treat them as UTC so parsing is consistent on any machine.
  const hasTimezone = /Z$|[+-]\d\d:\d\d$/.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Advance the poll watermark to the max record date seen, capped at `now`
 * so future-dated permit issue dates never stall ingestion (regression:
 * Collin County watermark landed in the future). Never regresses.
 */
export function advanceWatermark(current: Date, maxSeen: Date | null, now: Date): Date {
  if (!maxSeen) return current;
  const capped = maxSeen > now ? now : maxSeen;
  return capped > current ? capped : current;
}