import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/* Static export renders this once into out/robots.txt, same as sitemap.ts.
 * /admin is disallowed here and also carries its own noindex (see
 * app/admin/layout.tsx) — disallow keeps crawlers from fetching it at all,
 * noindex keeps it out of the index even if some other page links to it. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
