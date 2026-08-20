import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("includes the canonical public city and service URLs", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://www.portafor.info/leads/austin");
    expect(urls).toContain("https://www.portafor.info/leads/orlando/roofing-leads");
    expect(urls).not.toContain("https://www.portafor.info/leads/detroit");
  });

  it("uses the canonical hostname for every URL", () => {
    for (const entry of sitemap()) {
      expect(entry.url).toMatch(/^https:\/\/www\.portafor\.info(?:\/|$)/);
    }
  });
});
