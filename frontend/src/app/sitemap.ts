import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/* Static export (see next.config.mjs) renders this once at build time into
 * out/sitemap.xml — there is no server here to answer it per-request.
 *
 * Only the pages a reader can land on without a token belong here. /admin
 * is gated behind an admin bearer token and is excluded via robots.ts and
 * its own noindex (app/admin/layout.tsx); /settings holds no content of
 * its own — it is a panel of toggles, not a destination — so it is left
 * out the same way a sitewide nav link is left out of a sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/explorer`, lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/history`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/welcome`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    // The iPhone app's marketing page — the URL on the App Store listing.
    { url: `${SITE_URL}/app`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    // The public support/contact page — the URL app stores link to.
    { url: `${SITE_URL}/support`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    // The privacy policy — required by App Store Connect, linked from the footer.
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
