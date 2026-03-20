import type { MetadataRoute } from "next";
// TODO: change to actual domain name
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://memra.ai";

const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/features",
  "/security",
  "/integrations",
  "/docs",
  "/blog",
  "/contact",
  "/about",
  "/legal",
  "/legal/privacy",
  "/legal/terms",
  "/legal/dpa",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route.startsWith("/legal") ? 0.5 : 0.8,
  }));
}
