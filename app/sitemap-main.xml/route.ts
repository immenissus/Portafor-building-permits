import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET() {
  const now = new Date().toISOString();

  const urls: string[] = [];

  // Static pages
  urls.push(`  <url>
    <loc>${escapeXml(BASE_URL)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`);

  urls.push(`  <url>
    <loc>${escapeXml(`${BASE_URL}/pricing`)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>`);

  urls.push(`  <url>
    <loc>${escapeXml(`${BASE_URL}/blog`)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

  // City pages
  for (const city of cities) {
    urls.push(`  <url>
    <loc>${escapeXml(`${BASE_URL}/leads/${city.slug}`)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // Service pages
  for (const city of cities) {
    for (const service of services) {
      urls.push(`  <url>
    <loc>${escapeXml(`${BASE_URL}/leads/${city.slug}/${service}`)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
