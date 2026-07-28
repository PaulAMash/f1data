"use client";
import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { IconTile, StatStrip, type VisualTone } from "./Visuals";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The editorial panel.                                                       */
/*                                                                            */
/* Every session used to open with a bulleted list. Bullets are a filing       */
/* system, not writing — they flatten a race into five equal facts and give    */
/* the eye nothing to land on. This gives the same words a shape: one lede     */
/* set large enough to be the headline, a strip of the numbers that lede is    */
/* claiming, then the supporting beats as separated paragraphs.                */
/*                                                                            */
/* Same component for Practice, Qualifying, Sprint and the Race, so the        */
/* opening panel of every session reads in exactly the same voice.             */
/* -------------------------------------------------------------------------- */

export interface StoryHighlight {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: VisualTone;
  /** A second line under the figure — the context that stops it being a bare number. */
  sub?: React.ReactNode;
  /** Glossary key, when the label reads differently from the term it teaches. */
  term?: string;
}

export function StoryPanel({
  icon, kicker, title, story, highlights, notes, tone = "accent", children,
}: {
  icon: React.ReactNode;
  /** Small uppercase line above the headline — the section's identity. */
  kicker: React.ReactNode;
  /** Optional short title when the lede alone needs framing. */
  title?: React.ReactNode;
  story: string[];
  highlights?: StoryHighlight[];
  notes?: string[];
  tone?: VisualTone;
  children?: React.ReactNode;
}) {
  const [lede, ...rest] = story;
  const [open, setOpen] = useState(false);
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4">
        <IconTile tone={tone} size={26}>{icon}</IconTile>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{kicker}</span>
      </div>

      <div className="px-5 pb-5 pt-3">
        {/* Prose sets its own comfortable measure, so the numbers move into a
            right-hand rail on wide screens instead of leaving dead space beside
            the text — the standard editorial layout, and it puts the figures
            where the eye goes after the headline. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
          <div className="min-w-0">
            {title && (
              <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
            )}

            {lede ? (
              // the lede carries the session. Big enough to be read first, short
              // enough that it never becomes a paragraph.
              <p className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[21px]">
                {lede}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">No summary available for this session.</p>
            )}

            {/* The lede is the session. The supporting beats are the analysis —
                real value, but nobody should have to read five paragraphs to
                learn who won. They stay one click away, with the count on the
                control so the reader knows exactly what they're opening. */}
            {rest.length > 0 && (
              <div className="mt-4 border-t border-white/[0.06]">
                <p className="py-2.5 text-[14.5px] leading-relaxed text-ink-muted">{rest[0]}</p>
                {rest.length > 1 && (
                  <>
                    {/* slides open on its own height rather than appearing —
                        the reader keeps their place in the paragraph above */}
                    <div className={cx("grid transition-[grid-template-rows] duration-300 ease-out",
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                      <div className="overflow-hidden">
                        <div className={cx("divide-y divide-white/[0.05] border-t border-white/[0.05] transition-opacity duration-200",
                          open ? "opacity-100" : "opacity-0")}>
                          {rest.slice(1).map((s, i) => (
                            <p key={i} className="py-2.5 text-[14.5px] leading-relaxed text-ink-muted">{s}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-md py-1 text-[12px] font-semibold text-accent-soft transition-colors hover:text-accent">
                      {open ? "Show less" : `Read the full analysis · ${rest.length - 1} more`}
                      <ChevronDown size={12} className={cx("transition-transform duration-300", open && "rotate-180")} />
                    </button>
                  </>
                )}
              </div>
            )}

            {notes && notes.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {notes.map((n, i) => (
                  <p key={i} className="flex items-start gap-1.5 rounded-lg border border-amber/20 bg-amber/[0.05] px-2.5 py-1.5 text-[12px] leading-snug text-amber">
                    <Info size={12} className="mt-0.5 shrink-0" />{n}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* narrow screens keep the headline first and the figures underneath;
              wide screens move them alongside as a rail */}
          {highlights && highlights.length > 0 && (
            <aside className="mt-4 border-t border-white/[0.06] pt-3.5 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <StatStrip items={highlights} className="lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-4" />
            </aside>
          )}
        </div>

        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}
