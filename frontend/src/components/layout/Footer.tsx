"use client";
import Link from "next/link";
import { Radar } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* The footer.                                                                */
/*                                                                            */
/* The landing page used to simply stop after the last card, which is one of   */
/* the clearest tells that a site was built by an engineer rather than shipped */
/* by a company. A footer is not decoration: it is where a product says what   */
/* it is made of and who it is not. For something built entirely on somebody   */
/* else's sport, the last line is the one that matters most — and stating it   */
/* plainly is more credible than hoping nobody asks.                           */
/* -------------------------------------------------------------------------- */

const SOURCES = [
  { label: "FastF1", note: "lap timing, telemetry, stints" },
  { label: "Jolpica / Ergast", note: "results and standings, 1950–" },
  { label: "Open F1", note: "session and race control" },
];

export function Footer() {
  return (
    <footer className="relative mt-8 border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
              <Radar size={16} className="text-accent-soft" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Pitwall<span className="text-accent-soft"> IQ</span>
            </span>
          </span>
          <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
            Race intelligence for people who want to know why, not just who.
            Every number on every page comes from a named source, and anything
            we could not load is said out loud rather than filled in.
          </p>
        </div>

        <nav aria-label="Footer">
          <h2 className="label">Explore</h2>
          <ul className="mt-3 space-y-2 text-[13.5px]">
            {[
              ["Read a race", "/explorer"],
              ["Ask a question", "/explorer?tab=ask"],
              ["Seasons & championships", "/history"],
              ["Settings", "/settings"],
              ["Pitwall IQ for iPhone", "/app"],
            ].map(([label, href]) => (
              <li key={href}>
                <Link href={href}
                  className="text-ink-muted transition-colors duration-[--dur-2] hover:text-ink">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="label">Built on</h2>
          <ul className="mt-3 space-y-2 text-[13.5px]">
            {SOURCES.map((s) => (
              <li key={s.label} className="text-ink-muted">
                {s.label}
                <span className="mt-0.5 block text-[11.5px] text-ink-faint">{s.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.05]">
        {/* pb-20: the feedback control is fixed to the viewport's bottom-left
            corner and no longer steps out of the footer's way (see
            FeedbackDock.tsx) — so the footer keeps its own small print clear
            of that corner instead, which costs a strip of empty dark at the
            very end of the page and nothing else. */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-20 pt-5 text-[11.5px] text-ink-faint sm:px-6">
          <span>© {new Date().getFullYear()} Pitwall IQ</span>
          <span className="hidden sm:inline">·</span>
          {/* The one line that has to be here. */}
          <span className="max-w-2xl">
            An independent project. Not associated with, endorsed by, or affiliated
            with Formula 1, the FIA, or any competing team. F1 and Formula 1 are
            trademarks of Formula One Licensing BV. Apple, the Apple logo and
            App&nbsp;Store are trademarks of Apple&nbsp;Inc.
          </span>
          {/* The legal strip is where a reader — or a store reviewer — expects
              to find these, so they live here rather than in the primary nav. */}
          <span className="flex items-center gap-4 sm:ml-auto">
            <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
            <Link href="/support" className="transition-colors hover:text-ink">Support</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
