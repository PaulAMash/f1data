"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { explorerHref, requestTopOnArrival } from "@/lib/links";
import { sessionAbbr, sessionDay, stateAt } from "@/lib/schedule";
import type { ScheduledSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* ONE SESSION, DRAWN THE SAME WAY WHEREVER IT APPEARS.                       */
/*                                                                            */
/* A session of a weekend is shown in three places — the countdown's rail, the */
/* live panel's rail, and the season list's grid — and each of them had grown  */
/* its own copy of the same three-state logic. Three copies of a rule is three */
/* chances for one of them to say a session has been read when it has not, and */
/* the whole lifecycle exists because that sentence was once false. So the     */
/* rule lives here, once, and the three places choose a shape rather than a    */
/* meaning.                                                                    */
/*                                                                            */
/* AND A SESSION THAT CAN BE READ IS A LINK TO IT. FP1 finishing during a      */
/* weekend is the first moment Pitwall IQ has anything to say about that       */
/* weekend, and until now the chip that said "RUN" was the one thing on the    */
/* page that would not take you to it. `sessionHref` opens that exact session  */
/* — not the Grand Prix's landing page — through the same query the Explorer   */
/* already reads.                                                              */
/*                                                                            */
/* WHAT MAKES IT A LINK is `stateAt(session) === "available"`: the lifecycle's */
/* own answer, the same one the server computes as `session_available` and the */
/* same one the Explorer's guard refuses on. A session on track is not it — a  */
/* race that has begun has no classification, no stints and no strategy, and   */
/* offering it would be the promise the live panel exists to stop making.      */
/* Neither is one still to come. There is no date arithmetic here and no       */
/* session named in the code.                                                  */
/* -------------------------------------------------------------------------- */

/** Where this session can be read, or null if it cannot be. */
export function sessionHref(where: { year: number; gp: string },
                            session: ScheduledSession, now: number): string | null {
  if (stateAt(session, now) !== "available") return null;
  // The server said, at response time, whether a source actually has this
  // session. `stateAt` keeps the clock current but must not overrule a plain
  // "there is nothing here" — a chip that lights up for a session no provider
  // carries is the same lie in a smaller place.
  if (session.state === "available" && session.available === false) return null;
  return explorerHref({ year: where.year, gp: where.gp, session: session.name });
}

/** A link that asks the page it opens to start at the top. */
export function ScheduleLink({ href, className, label, children }: {
  href: string; className?: string; label?: string; children: React.ReactNode;
}) {
  return (
    <Link href={href} aria-label={label} className={className}
      onClick={requestTopOnArrival}>
      {children}
    </Link>
  );
}

/** A human sentence for a session link, so the chip's three letters are not
 *  all a screen reader is handed. */
function nameFor(gp: string, session: ScheduledSession) {
  return `${gp} — read ${session.name} in Explore`;
}

/* -------------------------------------------------------------------------- */
/* THE PILL, for the two rails: the countdown's and the live panel's.          */
/* -------------------------------------------------------------------------- */
export function SessionPill({ where, session, now, isNext, isLive }: {
  where: { year: number; gp: string };
  session: ScheduledSession; now: number; isNext?: boolean; isLive?: boolean;
}) {
  const { time } = useLocale();
  const href = sessionHref(where, session, now);
  const done = stateAt(session, now) === "available";
  const d = session.start ? new Date(session.start) : null;
  const when = d && Number.isFinite(d.getTime())
    ? `${sessionDay(session.start)} ${time(d)}` : "";

  const body = (
    <>
      {isLive && <span aria-hidden className="live-dot" />}
      {sessionAbbr(session.name)}
      {/* THE CUE THAT DOES NOT NEED A CURSOR. A pill is three letters wide and
          a hover is not available to a thumb, so the one that can be opened
          carries a mark of its own rather than relying on the lift. */}
      {href && <ArrowUpRight size={11} aria-hidden className="icon-lift -mr-0.5 shrink-0 opacity-70" />}
    </>
  );

  /* A SESSION THAT CAN BE READ IS NOT "SPENT".
     Struck through was the right mark while every finished session was a dead
     end — it said "over". Now the finished ones are the only ones there is
     anything to read, so the mark would be pointing at the door and calling it
     a wall. It goes to the sessions that genuinely are closed: run, but with
     no provider carrying them. */
  const shape = cx(
    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]",
    isLive || isNext ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30"
      : href ? "bg-white/[0.06] text-ink ring-1 ring-white/[0.09]"
        : done ? "bg-white/[0.04] text-ink-faint line-through decoration-white/20"
          : "bg-white/[0.03] text-ink-muted");

  return (
    <li>
      {href ? (
        <ScheduleLink href={href} label={nameFor(where.gp, session)}
          className={cx(shape, "pressable hover:bg-white/[0.1] hover:ring-white/20")}>
          {body}
        </ScheduleLink>
      ) : (
        <span title={when} className={shape}>{body}</span>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* THE GRID CELL, for a weekend's card in the season list.                     */
/* -------------------------------------------------------------------------- */
export function SessionSlot({ where, session, now, isNext, linkable = true }: {
  where: { year: number; gp: string };
  session: ScheduledSession; now: number; isNext: boolean;
  /** False when an ancestor is already a link — an anchor inside an anchor is
   *  invalid, and the card's own link to the race is the older promise. */
  linkable?: boolean;
}) {
  const { time } = useLocale();
  const state = stateAt(session, now);
  const isLive = state === "live";
  const href = linkable ? sessionHref(where, session, now) : null;
  const d = session.start ? new Date(session.start) : null;
  const valid = d && Number.isFinite(d.getTime());

  const body = (
    <>
      <span className={cx("flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]",
        isLive || isNext ? "text-accent-soft"
          : state === "available" ? "text-ink-faint" : "text-ink-muted")}>
        {isLive && <span aria-hidden className="live-dot" />}
        {sessionAbbr(session.name)}
      </span>
      <span className={cx("text-[13px] tabular-nums",
        isLive || isNext ? "font-semibold text-ink" : "text-ink-muted")}>
        {valid ? (
          <>
            <span className="text-ink-faint">{sessionDay(session.start)}</span>{" "}
            {time(d!)}
          </>
        ) : <span className="text-ink-faint">TBC</span>}
      </span>
      {/* Where this session is in its life, in one word. A readable one says
          so as an invitation rather than as a past tense. */}
      {isLive ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-soft">
          On track
        </span>
      ) : href ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Read →
        </span>
      ) : state === "available" && !isNext && (
        <span className="text-[10px] uppercase tracking-wide text-ink-faint/70">Run</span>
      )}
    </>
  );

  const shape = cx("flex h-full flex-col gap-0.5 px-4 py-3",
    isLive ? "bg-accent/[0.13]" : isNext ? "bg-accent/[0.09]" : "bg-base-850/80");

  return (
    <li className={cx(!href && shape)}>
      {href ? (
        <ScheduleLink href={href} label={nameFor(where.gp, session)}
          className={cx(shape, "pressable hover:bg-white/[0.06]")}>
          {body}
        </ScheduleLink>
      ) : body}
    </li>
  );
}
