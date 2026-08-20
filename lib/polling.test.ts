import { describe, expect, it } from "vitest";

const MATCH_CHUNK_SIZE = 500;

function chunkCount(length: number): number {
  return Math.ceil(length / MATCH_CHUNK_SIZE);
}

describe("poll alert matching batches", () => {
  it("keeps a 500-record batch within one query", () => {
    expect(chunkCount(500)).toBe(1);
  });

  it("splits batches larger than PostgreSQL's parameter-safe limit", () => {
    expect(chunkCount(501)).toBe(2);
    expect(chunkCount(1901)).toBe(4);
  });
});
