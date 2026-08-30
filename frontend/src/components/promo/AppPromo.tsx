"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Smartphone, Sparkles, X } from "lucide-react";
import { PhoneMock } from "./PhoneMock";

/* -------------------------------------------------------------------------- */
/* THE iPHONE APP, ANNOUNCED — twice, deliberately differently.               */
/*                                                                            */
/* `AppPromoBand` is the landing page's chapter about the app: full width,     */
/* designed, part of the page's argument. `AppPromoStrip` is one quiet line    */
/* on the reading pages, phones only, dismissible for good. Two surfaces       */
/* because they talk to two different people: the band addresses somebody      */
/* deciding whether Pitwall IQ is for them, the strip addresses somebody       */
/* ALREADY squinting at a desktop-shaped product on a phone — exactly the      */
/* person the app is being built for, on exactly the screen where it helps.    */
/*                                                                            */
/* Neither is the marketing page. Both are one link away from /app, which is   */
/* where the whole case lives — these only have to be noticed, not to argue.   */
/*                                                                            */
/* WHAT NEITHER SAYS: a download link (none exists until Apple approves), or   */
/* the word Android (that version does not exist and is not implied).          */
/* -------------------------------------------------------------------------- */

/** Dismissing the strip is remembered per browser, forever. An announcement
 *  a reader has waved away once must never introduce itself again. */
const STRIP_HIDE_KEY = "pitwall.app-promo.hide";

/* ==================== the landing page band ==================== */

export function AppPromoBand() {
  return (
    <div className="panel-hero overflow-hidden">
      <div className="grid items-center gap-x-10 gap-y-0 px-6 pt-8 sm:px-10 sm:pt-10 lg:grid-cols-[minmax(0,1.15fr)_auto] lg:pb-10 lg:pt-12">
        <div className="max-w-xl pb-8 lg:pb-0">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-soft">
            <Smartphone size={13} className="shrink-0" />
            Pitwall IQ for iPhone
          </p>
          <h3 className="mt-3.5 text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">
            The pit wall, in your pocket
          </h3>
          <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-ink-muted">
            Most race weekends are watched with a phone in hand — and this
            site was built for a desk. The Pitwall IQ app is the same race
            intelligence, designed for the screen you actually hold on a
            Sunday afternoon.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href="/app"
              className="cta-glow pressable-glow group/app inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold text-pure">
              See the app
              <ArrowRight size={15}
                className="transition-transform duration-[--dur-2] group-hover/app:translate-x-0.5" />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint">
              <Sparkles size={13} className="text-accent-soft" />
              Coming soon to the App&nbsp;Store
            </span>
          </div>
        </div>

        {/* The device leans out of the band's bottom edge rather than floating
            whole inside it: a band that CONTAINS a phone is a brochure, a
            phone rising out of one is an arrival. Cropped by the band's own
            overflow-hidden, so it costs no layout below. */}
        <div className="relative -mb-16 hidden justify-self-end sm:-mb-24 sm:block lg:-mb-32">
          <PhoneMock compact className="mx-auto" />
        </div>
      </div>

      {/* On phones the device is the argument, so it is front and centre —
          same crop, but after the words instead of beside them. */}
      <div className="relative -mb-40 mt-2 flex justify-center sm:hidden">
        <PhoneMock compact />
      </div>
    </div>
  );
}

/* ==================== the reading-page strip ==================== */

/** Only the pages where somebody is actually USING the product on a phone —
 *  the landing page already has the band, and /app is the destination. */
const STRIP_PAGES = new Set(["/explorer", "/history"]);

export function AppPromoStrip() {
  const path = usePathname();

  /* Hidden until proven wanted: the strip renders nothing on the server and
     on desktop, and only appears once localStorage has confirmed the reader
     has not already dismissed it — the alternative is a strip that flashes
     in and gets yanked away, which is the exact twitchiness it must not add
     to a page that is already busy. */
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STRIP_HIDE_KEY)) setShow(true);
    } catch { setShow(true); }
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(STRIP_HIDE_KEY, "1"); } catch { /* private mode */ }
  };

  if (!STRIP_PAGES.has(path ?? "") || !show) return null;

  return (
    <div className="border-b border-accent/[0.14] bg-accent/[0.06] sm:hidden">
      <div className="mx-auto flex items-center gap-2.5 px-4 py-2">
        <Smartphone size={14} className="shrink-0 text-accent-soft" />
        <Link href="/app" className="min-w-0 flex-1 py-0.5">
          <span className="block truncate text-[12px] leading-snug text-ink">
            <span className="font-semibold">Pitwall IQ for iPhone</span>
            <span className="text-ink-muted"> — built for this screen. Coming soon.</span>
          </span>
        </Link>
        <Link href="/app"
          className="shrink-0 rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-accent-soft">
          Learn more
        </Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss the app announcement"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint
                     transition-colors hover:bg-white/[0.06] hover:text-ink">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
