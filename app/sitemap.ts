import type { MetadataRoute } from "next";

const BASE_URL = "https://www.portafor.info";

const cities = [
  { slug: "austin", state: "Texas" },
  { slug: "collin-county", state: "Texas" },
  { slug: "chicago", state: "Illinois" },
  { slug: "new-york-city", state: "New York" },
  { slug: "seattle", state: "Washington" },
  { slug: "orlando", state: "Florida" },
];

const services = [
  "roofing-leads",
  "hvac-leads",
  "solar-leads",
  "building-permit-leads",
  "contractor-leads",
];

export const revalidate = 3600;

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];

  const cityPages: MetadataRoute.Sitemap = cities.map((city) => ({
    url: `${BASE_URL}/leads/${city.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const servicePages: MetadataRoute.Sitemap = [];
  for (const city of cities) {
    for (const service of services) {
      servicePages.push({
        url: `${BASE_URL}/leads/${city.slug}/${service}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      });
    }
  }

  return [...staticPages, ...cityPages, ...servicePages];
}
