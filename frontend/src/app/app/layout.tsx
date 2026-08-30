import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

/* page.tsx below is "use client" and cannot export metadata itself — this
 * layout is the whole reason it exists, and it is where the App Store's
 * Marketing URL gets its title, its description and its share card.
 *
 * Absolute URLs rather than a `metadataBase` on the root layout: this page
 * needs a canonical and an og:url, and nothing else in the product declares
 * metadata, so the setting belongs to the one route that uses it instead of
 * being added globally where it would sit inert. SITE_URL is the same
 * constant sitemap.ts and robots.ts read (lib/site.ts), so the canonical
 * cannot drift onto a preview domain. */
const TITLE = "Pitwall IQ for iPhone — F1 race intelligence";
const DESCRIPTION =
  "An F1 app that explains why a race unfolded the way it did: race stories, "
  + "strategy, tyres, fuel- and tyre-corrected pace, position charts, driver "
  + "comparison and plain-English answers, from real Formula 1 timing data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/app` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/app`,
    siteName: "Pitwall IQ",
    type: "website",
    locale: "en_GB",
  },
  // `summary` rather than `summary_large_image`: there is no share image in
  // the repository, and claiming a card size we cannot fill renders a broken
  // one. When artwork exists, this becomes summary_large_image and gains an
  // `images` entry — in the same commit as the file.
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function AppMarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
