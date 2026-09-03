import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* APPLE'S MARKS, USED AS APPLE SHIPS THEM.                                   */
/*                                                                            */
/* Two things live here and both have the same provenance rule: nothing is     */
/* drawn by hand, approximated, or taken from an icon library.                 */
/*                                                                            */
/* `AppStoreBadge` renders public/badges/app-store-badge.svg — Apple's own     */
/* "Download on the App Store" artwork (US-UK, RGB, black), downloaded from    */
/* developer.apple.com and committed byte-for-byte unmodified. Per Apple's     */
/* marketing guidelines it is never recoloured, redrawn, or truncated; it is   */
/* rendered at or above the 40px minimum height with clear space around it.    */
/*                                                                            */
/* `AppleLogo` is the Apple logo glyph for small inline lockups. Its two       */
/* <path> elements are copied VERBATIM from that same official badge file      */
/* (path ids _Path_ and _Path_2), and the viewBox is the glyph's measured      */
/* bounding box — so the geometry on screen is Apple's own, not a lookalike.   */
/*                                                                            */
/* THE BADGE IS NOT A LINK YET. Apple's badge exists to point at a real App    */
/* Store listing and Pitwall IQ does not have one until review completes, so   */
/* `href` is optional: absent, the badge renders as a static preview beside    */
/* an explicit "coming soon" label. THE DAY THE APP IS APPROVED, pass the      */
/* real App Store URL as `href` and delete nothing else — the swap is one      */
/* prop at each call site.                                                     */
/*                                                                            */
/* Attribution ("Apple, the Apple logo…are trademarks of Apple Inc.") lives    */
/* in the site footer's legal strip alongside the F1 line.                     */
/* -------------------------------------------------------------------------- */

/** The Apple logo, geometry lifted verbatim from the official badge asset. */
export function AppleLogo({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="9.9716 8.7203 17.7166 21.776" width={size}
      height={size * (21.776 / 17.7166)} aria-hidden className={cx("shrink-0", className)}>
      <path fill="currentColor" d="M24.76888,20.30068a4.94881,4.94881,0,0,1,2.35656-4.15206,5.06566,5.06566,0,0,0-3.99116-2.15768c-1.67924-.17626-3.30719,1.00483-4.1629,1.00483-.87227,0-2.18977-.98733-3.6085-.95814a5.31529,5.31529,0,0,0-4.47292,2.72787c-1.934,3.34842-.49141,8.26947,1.3612,10.97608.9269,1.32535,2.01018,2.8058,3.42763,2.7533,1.38706-.05753,1.9051-.88448,3.5794-.88448,1.65876,0,2.14479.88448,3.591.8511,1.48838-.02416,2.42613-1.33124,3.32051-2.66914a10.962,10.962,0,0,0,1.51842-3.09251A4.78205,4.78205,0,0,1,24.76888,20.30068Z" />
      <path fill="currentColor" d="M22.03725,12.21089a4.87248,4.87248,0,0,0,1.11452-3.49062,4.95746,4.95746,0,0,0-3.20758,1.65961,4.63634,4.63634,0,0,0-1.14371,3.36139A4.09905,4.09905,0,0,0,22.03725,12.21089Z" />
    </svg>
  );
}

/** The official App Store badge. Without `href`: a coming-soon preview.
 *  With `href`: the real thing. Height ≥ Apple's 40px minimum. */
export function AppStoreBadge({ href, height = 50, className }: {
  href?: string; height?: number; className?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- a committed static
    // asset that must render byte-exact; the optimizer has nothing to add
    <img src="/badges/app-store-badge.svg" alt="Download on the App Store"
      style={{ height, width: "auto" }} draggable={false} />
  );

  if (href) {
    return (
      <a href={href} className={cx("inline-flex", className)}
        aria-label="Download Pitwall IQ on the App Store">
        {img}
      </a>
    );
  }

  return (
    <span className={cx("inline-flex flex-col items-start gap-2", className)}
      aria-label="Pitwall IQ is coming soon to the App Store">
      {/* The label sits OUTSIDE the badge's clear space and the badge itself
          is untouched — a modified badge is the one thing Apple's guidelines
          are unambiguous about. */}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.10] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent-soft">
        Coming soon
      </span>
      <span className="inline-flex cursor-default select-none" aria-hidden>{img}</span>
    </span>
  );
}
