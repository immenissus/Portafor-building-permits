const VALID_FILING_TYPES = new Set(["building_permit", "business_license"]);

export function serviceAreaSql(serviceArea: string): { expression: "geojson" | "wkb"; value: string } {
  const value = serviceArea.trim();
  if (value.startsWith("{") || value.startsWith("[")) {
    JSON.parse(value);
    return { expression: "geojson", value };
  }
  if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0) {
    return { expression: "wkb", value };
  }
  throw new Error("Invalid service area geometry");
}

/**
 * Build the SQL predicate `f.filing_type = ANY(ARRAY[...]::text[])` from a
 * subscriber's filing type filters.
 *
 * Regression: embedding a JS array directly into a Drizzle `sql` template
 * renders as a row constructor (`= ANY(($1, $2))`), which PostgreSQL rejects.
 * Values are whitelisted to the known filing types before inlining.
 */
export function filingTypeAnySql(filters: string[]): string {
  const safe = filters.filter((f) => VALID_FILING_TYPES.has(f));
  const literal = safe.map((f) => `'${f}'`).join(",");
  return `f.filing_type = ANY(ARRAY[${literal}]::text[])`;
}
