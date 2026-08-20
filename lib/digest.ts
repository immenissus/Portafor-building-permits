const DEFAULT_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/**
 * Earliest `alerts_sent.dispatched_at` to include in a digest run.
 * Uses the subscriber's last digest timestamp when fresh, otherwise falls back
 * to now - lookback so alerts dispatched since the last poll are never missed
 * (belt-and-suspenders on top of the `digested` flag).
 */
export function digestCutoff(lastDigestAt: Date | null, now: Date, lookbackMs?: number): Date {
  const lookback = lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const fallback = new Date(now.getTime() - lookback);
  if (!lastDigestAt) return fallback;
  return lastDigestAt > fallback ? lastDigestAt : fallback;
}