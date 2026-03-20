import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://memra.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/app/", "/api/", "/platform-admin/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
