import { describe, expect, it } from "vitest";
import { digestCutoff } from "./digest";

const NOW = new Date("2026-08-19T06:00:00Z");
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

describe("digestCutoff", () => {
  it("uses now - lookback when the subscriber has never been digested", () => {
    const cutoff = digestCutoff(null, NOW, LOOKBACK_MS);
    expect(cutoff.toISOString()).toBe("2026-08-17T06:00:00.000Z");
  });

  it("uses last_digest_at when it is within the lookback window", () => {
    const last = new Date("2026-08-19T00:30:00Z");
    expect(digestCutoff(last, NOW, LOOKBACK_MS).toISOString()).toBe("2026-08-19T00:30:00.000Z");
  });

  it("falls back to now - lookback when last_digest_at is stale", () => {
    const stale = new Date("2026-08-01T00:00:00Z");
    expect(digestCutoff(stale, NOW, LOOKBACK_MS).toISOString()).toBe("2026-08-17T06:00:00.000Z");
  });
});