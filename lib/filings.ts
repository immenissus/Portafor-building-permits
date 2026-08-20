const VALID_FILING_TYPES = new Set(["building_permit", "business_license"]);

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