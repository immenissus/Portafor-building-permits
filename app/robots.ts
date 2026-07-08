import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/admin",
          "/onboarding",
          "/settings",
          "/api/",
        ],
      },
    ],
    sitemap: "https://portafor.info/sitemap.xml",
  };
}
