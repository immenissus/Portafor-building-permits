import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildSodaUrl,
  fetchSodaJson,
  normalizeSodaRecord,
  advanceWatermark
} from "./socrata";

describe("buildSodaUrl", () => {
  it("builds a Socrata resource URL with encoded query params", () => {
    const url = buildSodaUrl("data.austintexas.gov", "3syk-w9eu", {
      where: "issue_date > '2024-01-01'",
      order: "issue_date ASC",
      limit: 1000
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("data.austintexas.gov");
    expect(parsed.pathname).toBe("/resource/3syk-w9eu.json");
    expect(parsed.searchParams.get("$where")).toBe("issue_date > '2024-01-01'");
    expect(parsed.searchParams.get("$order")).toBe("issue_date ASC");
    expect(parsed.searchParams.get("$limit")).toBe("1000");
  });

  it("defaults the limit to 1000 and omits optional params", () => {
    const url = buildSodaUrl("data.cityofchicago.org", "ydr8-5enu");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("$limit")).toBe("1000");
    expect(parsed.searchParams.get("$where")).toBeNull();
    expect(parsed.searchParams.get("$order")).toBeNull();
  });
});

describe("normalizeSodaRecord", () => {
  it("maps canonical fields via column_field_map", () => {
    const raw = {
      permit_location: "123 Main St",
      issue_date: "2026-07-01T00:00:00.000",
      permit_number: "2026-12345",
      latitude: "30.2672",
      longitude: "-97.7431"
    };
    const map = {
      address: "permit_location",
      issued_date: "issue_date",
      permit_number: "permit_number",
      latitude: "latitude",
      longitude: "longitude"
    };
    const record = normalizeSodaRecord(raw, map);
    expect(record.externalId).toBe("2026-12345");
    expect(record.addressRaw).toBe("123 Main St");
    expect(record.filedAt?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(record.latitude).toBe(30.2672);
    expect(record.longitude).toBe(-97.7431);
  });

  it("joins composite address columns into a single address", () => {
    const raw = {
      street_number: "7529",
      street_direction: "N",
      street_name: "CLARK ST",
      issue_date: "2024-09-18T00:00:00.000",
      permit_: "101046020",
      latitude: "42.0186",
      longitude: "-87.6758"
    };
    const map = {
      address: ["street_number", "street_direction", "street_name"],
      issued_date: "issue_date",
      permit_number: "permit_",
      latitude: "latitude",
      longitude: "longitude"
    };
    const record = normalizeSodaRecord(raw, map);
    expect(record.addressRaw).toBe("7529 N CLARK ST");
    expect(record.externalId).toBe("101046020");
  });

  it("skips empty composite parts and drops a wholly-empty composite", () => {
    const raw = {
      street_number: "43-30",
      street_name: "PARSONS BOULEVARD",
      issued_date: "2026-08-18T00:00:00.000",
      tracking_number: "593832799",
      latitude: "40.756514",
      longitude: "-73.817023"
    };
    const record = normalizeSodaRecord(
      raw,
      { address: ["street_number", "", "street_name"], issued_date: "issued_date", permit_number: "tracking_number" }
    );
    expect(record.addressRaw).toBe("43-30 PARSONS BOULEVARD");

    const empty = normalizeSodaRecord(
      { tracking_number: "t1", issued_date: "2026-01-01" },
      { address: ["", " "], issued_date: "issued_date", permit_number: "tracking_number" }
    );
    expect(empty.addressRaw).toBeNull();
  });

  it("falls back to raw columns for unmapped keys (id, permitnum, situsconcatshort)", () => {
    const raw = { id: "r1", permitnum: "P-9", situsconcatshort: "5 Oak Rd" };
    const record = normalizeSodaRecord(raw, {});
    expect(record.externalId).toBe("r1");
    expect(record.addressRaw).toBe("5 Oak Rd");
  });

  it("uses the ID fallback chain permit_number -> license_number -> id -> permitnum", () => {
    const base = { address: "x", issued_date: "2026-01-01" };
    expect(normalizeSodaRecord({ ...base, permit_number: "pn" }, {}).externalId).toBe("pn");
    expect(normalizeSodaRecord({ ...base, license_number: "ln" }, {}).externalId).toBe("ln");
    expect(normalizeSodaRecord({ ...base, id: "raw-id" }, {}).externalId).toBe("raw-id");
    expect(normalizeSodaRecord({ ...base, permitnum: "col-1" }, {}).externalId).toBe("col-1");
  });

  it("uses the address fallback chain address -> permit_address -> situsconcatshort", () => {
    const base = { id: "x", issued_date: "2026-01-01" };
    expect(normalizeSodaRecord({ ...base, address: "a" }, {}).addressRaw).toBe("a");
    expect(normalizeSodaRecord({ ...base, permit_address: "b" }, {}).addressRaw).toBe("b");
    expect(normalizeSodaRecord({ ...base, situsconcatshort: "c" }, {}).addressRaw).toBe("c");
  });

  it("returns null fields for missing core data", () => {
    const record = normalizeSodaRecord({ foo: "bar" }, {});
    expect(record.externalId).toBeNull();
    expect(record.addressRaw).toBeNull();
    expect(record.filedAt).toBeNull();
  });

  it("returns null filedAt for an invalid date", () => {
    const raw = { id: "x", address: "a", issued_date: "not-a-date" };
    const record = normalizeSodaRecord(raw, {});
    expect(record.filedAt).toBeNull();
  });

  it("returns null coordinates for unparsable values", () => {
    const raw = { id: "x", address: "a", issued_date: "2026-01-01", latitude: "oops", longitude: "nope" };
    const record = normalizeSodaRecord(raw, {});
    expect(record.latitude).toBeNull();
    expect(record.longitude).toBeNull();
  });
});

describe("advanceWatermark", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  it("advances the watermark to the max seen date", () => {
    const current = new Date("2026-08-01T00:00:00Z");
    const maxSeen = new Date("2026-08-10T00:00:00Z");
    expect(advanceWatermark(current, maxSeen, now).toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("caps a future-dated watermark to now (regression: Collin County 2026-12-29)", () => {
    const current = new Date("2026-07-08T00:00:00Z");
    const maxSeen = new Date("2026-12-29T00:00:00Z");
    expect(advanceWatermark(current, maxSeen, now).toISOString()).toBe("2026-08-19T12:00:00.000Z");
  });

  it("never regresses the watermark", () => {
    const current = new Date("2026-08-10T00:00:00Z");
    const maxSeen = new Date("2026-08-01T00:00:00Z");
    expect(advanceWatermark(current, maxSeen, now).toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("keeps the current watermark when no records were seen", () => {
    const current = new Date("2026-08-01T00:00:00Z");
    expect(advanceWatermark(current, null, now).toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("fetchSodaJson", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const jsonHeaders = { "Content-Type": "application/json" };

  it("returns records on a 200 response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ id: "a" }]), { status: 200, headers: jsonHeaders })
    );
    const records = await fetchSodaJson("https://x/y.json");
    expect(records).toEqual([{ id: "a" }]);
  });

  it("retries once on a 503 then succeeds", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "b" }]), { status: 200, headers: jsonHeaders }));
    vi.mocked(fetch).mockImplementation(mock);
    const records = await fetchSodaJson("https://x/y.json", { retries: 1 });
    expect(mock).toHaveBeenCalledTimes(2);
    expect(records).toEqual([{ id: "b" }]);
  });

  it("throws after exhausting retries on a persistent 503", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchSodaJson("https://x/y.json", { retries: 1 })).rejects.toThrow("Socrata returned 503");
  });

  it("does not retry a 404", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.mocked(fetch).mockImplementation(mock);
    await expect(fetchSodaJson("https://x/y.json", { retries: 2 })).rejects.toThrow("Socrata returned 404");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries on a network error then throws when it persists", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchSodaJson("https://x/y.json", { retries: 1 })).rejects.toThrow("fetch failed");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("aborts on timeout and throws", async () => {
    vi.mocked(fetch).mockImplementation(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })
    );
    await expect(fetchSodaJson("https://x/y.json", { timeoutMs: 10, retries: 0 })).rejects.toThrow("aborted");
  });
});