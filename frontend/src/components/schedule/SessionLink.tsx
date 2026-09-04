"use client";
import Link from "next/link";
import { ArrowUpRight, Hourglass } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { explorerHref, requestTopOnArrival } from "@/lib/links";
import { analysisAt, sessionAbbr, sessionDay, stateAt } from "@/lib/schedule";
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
/* WHAT MAKES IT A LINK is the DATA axis, not the lifecycle one:              */
/* `analysisAt(session) === "available"`. That distinction is V106's whole     */
/* point. A session that has taken the flag is `completed`, and gating on that */
/* would offer an analysis in the twenty minutes before the timing is even     */
/* published — the same conflation that had a finished Practice 2 calling      */
/* itself live. `analysisAt` is the same `session_available` the server        */
/* computes and the same one the Explorer's guard reads, so the chip and the   */
/* gate cannot disagree.                                                       */
/*                                                                            */
/* A FINISHED SESSION STILL WAITING IS NOT NOTHING, though, and it gets a door */
/* of its own — `waitingHref` — which opens the explanation rather than an     */
/* analysis. It is drawn differently and named differently, because a reader   */
/* must never be led to believe completed data exists when it does not.        */
/* There is no date arithmetic here and no session named in the code.          */
/* -------------------------------------------------------------------------- */

/** Where this session's ANALYSIS can be read, or null if it cannot be. */
export function sessionHref(where: { year: number; gp: string },
                            session: ScheduledSession, now: number): string | null {
  if (analysisAt(session, now) !== "available") return null;
  // The server said, at response time, whether a source actually has this
  // session. `analysisAt` keeps the clock current but must not overrule a
  // plain "there is nothing here" — a chip that lights up for a session no
  // provider carries is the same lie in a smaller place.
  if (session.analysis === "available" && session.available === false) return null;
  return explorerHref({ year: where.year, gp: where.gp, session: session.name });
}

/** Where a session that is OVER but not yet published explains itself.
 *
 *  The same destination, deliberately: the Explorer already knows how to say
 *  "this has finished and the timing has not arrived" (reason `awaiting_data`),
 *  and sending the reader there is more useful than a chip that does nothing.
 *  It is never offered for a session that is still running or still to come,
 *  and it is never dressed as an analysis. */
export function waitingHref(where: { year: number; gp: string },
                            session: ScheduledSession, now: number): string | null {
  if (stateAt(session, now) !== "completed") return null;
  if (analysisAt(session, now) === "available") return null;   // that is a real link
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

/** And the other sentence, for the door that leads to an explanation rather
 *  than to an analysis. It must not read like the one above. */
function waitingName(gp: string, session: ScheduledSession) {
  return `${gp} — ${session.name} has finished; its data has not arrived yet`;
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
  const waiting = href ? null : waitingHref(where, session, now);
  const done = stateAt(session, now) === "completed";
  const d = session.start ? new Date(session.start) : null;
  const when = d && Number.isFinite(d.getTime())
    ? `${sessionDay(session.start)} ${time(d)}` : "";

  const body = (
    <>
      {isLive && <span aria-hidden className="live-dot" />}
      {sessionAbbr(session.name)}
      {/* THE CUE THAT DOES NOT NEED A CURSOR. A pill is three letters wide and
          a hover is not available to a thumb, so the one that can be opened
          carries a mark of its own rather than relying on the lift — and the
          two marks differ, because the two doors lead to different things. */}
      {href && <ArrowUpRight size={11} aria-hidden className="icon-lift -mr-0.5 shrink-0 opacity-70" />}
      {waiting && <Hourglass size={10} aria-hidden className="-mr-0.5 shrink-0 opacity-60" />}
    </>
  );

  /* THREE MARKS FOR THREE THINGS, and the reason V106 exists is that there
     used to be two. A session that can be READ is bright and ringed. One that
     has FINISHED but is still unpublished is quieter, and says so rather than
     borrowing either neighbour's clothes. Struck through is kept for the one
     case that really is a dead end: run, settled, and no provider carrying it. */
  const shape = cx(
    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]",
    isLive || isNext ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30"
      : href ? "bg-white/[0.06] text-ink ring-1 ring-white/[0.09]"
        : waiting ? "bg-white/[0.03] text-ink-muted ring-1 ring-white/[0.06]"
          : done ? "bg-white/[0.04] text-ink-faint line-through decoration-white/20"
            : "bg-white/[0.03] text-ink-muted");

  const open = href ?? waiting;
  return (
    <li>
      {open ? (
        <ScheduleLink href={open}
          label={href ? nameFor(where.gp, session) : waitingName(where.gp, session)}
          className={cx(shape, "pressable",
            href ? "hover:bg-white/[0.1] hover:ring-white/20"
                 : "hover:bg-white/[0.06] hover:text-ink-muted")}>
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
  const waiting = linkable && !href ? waitingHref(where, session, now) : null;
  const d = session.start ? new Date(session.start) : null;
  const valid = d && Number.isFinite(d.getTime());

  const body = (
    <>
      <span className={cx("flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]",
        isLive || isNext ? "text-accent-soft"
          : state === "completed" ? "text-ink-faint" : "text-ink-muted")}>
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
      ) : waiting ? (
        /* THE WORD THE PRODUCT DID NOT HAVE. Not "on track", which was untrue
           the moment the flag fell, and not "unavailable", which reads as a
           fault. It finished; the timing has not landed. */
        <span className="text-[10px] uppercase tracking-wide text-ink-faint/80">
          Awaiting data
        </span>
      ) : state === "completed" && !isNext && (
        <span className="text-[10px] uppercase tracking-wide text-ink-faint/70">Run</span>
      )}
    </>
  );

  const shape = cx("flex h-full flex-col gap-0.5 px-4 py-3",
    isLive ? "bg-accent/[0.13]" : isNext ? "bg-accent/[0.09]" : "bg-base-850/80");

  const open = href ?? waiting;
  return (
    <li className={cx(!open && shape)}>
      {open ? (
        <ScheduleLink href={open}
          label={href ? nameFor(where.gp, session) : waitingName(where.gp, session)}
          className={cx(shape, "pressable hover:bg-white/[0.06]")}>
          {body}
        </ScheduleLink>
      ) : body}
    </li>
  );
}
