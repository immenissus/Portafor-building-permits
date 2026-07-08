import type { MetadataRoute } from "next";

const BASE_URL = "https://portafor.info";

const cities = [
  { slug: "austin", state: "Texas" },
  { slug: "orlando", state: "Florida" },
  { slug: "dallas", state: "Texas" },
  { slug: "fort-worth", state: "Texas" },
  { slug: "chicago", state: "Illinois" },
  { slug: "new-york-city", state: "New York" },
  { slug: "los-angeles", state: "California" },
  { slug: "san-francisco", state: "California" },
  { slug: "san-diego", state: "California" },
  { slug: "seattle", state: "Washington" },
  { slug: "boston", state: "Massachusetts" },
  { slug: "miami", state: "Florida" },
  { slug: "detroit", state: "Michigan" },
];

const services = [
  "roofing-leads",
  "hvac-leads",
  "solar-leads",
  "building-permit-leads",
  "contractor-leads",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const cityPages: MetadataRoute.Sitemap = cities.map((city) => ({
    url: `${BASE_URL}/leads/${city.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const servicePages: MetadataRoute.Sitemap = services.map((service) => ({
    url: `${BASE_URL}/${service}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...cityPages, ...servicePages];
}
