"use client";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { useLocale } from "@/lib/locale";
import {
  sessionAbbr, sessionDay, stateAt, useNextUp, useNow, useSchedule, weekendSpan,
} from "@/lib/schedule";
import type { ScheduleEvent, ScheduledSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* THE SEASON.                                                                */
/*                                                                            */
/* Every round of it, in order — not the next few.                            */
/*                                                                            */
/* THE BUG THIS SHAPE EXISTS TO CLOSE. This was `UpcomingSchedule`, and it     */
/* asked the API for eight events; the countdown beside it asked for six. Two  */
/* numbers, neither of them a fact about Formula 1, deciding between them      */
/* which Grands Prix existed as far as this page was concerned. On a Friday in */
/* September a twenty-three round season came back as six weekends ending at   */
/* São Paulo, and Las Vegas, Qatar and Abu Dhabi were missing from the page    */
/* whose entire job is to say what is coming. Twice.                           */
/*                                                                            */
/* A RACE IS ON THE CALENDAR OR IT IS NOT. Whether it has been run, is being   */
/* run, or is three months away is a different question, answered per session  */
/* by `state`, and the two are kept apart: nothing here removes a round for    */
/* being in the past or for being far ahead. What the clock changes is how a   */
/* round is DRAWN — run weekends recede, the next one is marked, one on track  */
/* says so — never whether it is drawn at all.                                 */
/*                                                                            */
/* An event schedule, not a table. Each Grand Prix is a card with its own      */
/* sessions laid out as a row of times, because the unit a reader thinks in    */
/* is the weekend — "when is Monza" — and a grid of one-session-per-row makes  */
/* them assemble that themselves. On a phone the session row becomes a         */
/* two-column grid rather than a horizontal scroller: five sessions at four    */
/* columns is one cramped line and a hidden Race, which is the session most    */
/* people opened the page for.                                                 */
/*                                                                            */
/* IT SAYS WHICH WEEKEND, NOT HOW LONG. Each card used to carry an "in 7       */
/* hours" badge directly beneath a countdown giving the same number to the     */
/* second. The time remaining belongs to the countdown, once.                  */
/* -------------------------------------------------------------------------- */

export function SeasonSchedule({ className }: { className?: string }) {
  const { schedule, loading, failed } = useSchedule();
  const now = useNow(!!schedule);
  const next = useNextUp(schedule ?? null, now);

  if (loading) {
    return (
      <div className={cx("grid gap-4", className)} aria-hidden>
        {[0, 1, 2].map((i) => <div key={i} className="panel h-[150px] animate-pulse" />)}
      </div>
    );
  }
  if (failed || !schedule?.events?.length) {
    return (
      <div className={cx("panel px-6 py-10 text-center", className)}>
        <p className="text-[14px] font-medium text-ink">No calendar to show</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
          {failed
            ? "The calendar could not be read just now. It is upstream of us and usually brief."
            : "The season's calendar has not been published yet. It will appear here as soon as it is."}
        </p>
      </div>
    );
  }

  const events = schedule.events;
  const run = events.filter((e) => e.completed).length;

  return (
    <div className={className}>
      {/* THE COUNT IS THE POINT, and it is stated rather than left to be
          scrolled for: a season that has quietly lost its last three rounds
          looks exactly like a complete one until you count. */}
      <p className="mb-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-faint">
        <span className="font-semibold tabular-nums text-ink-muted">
          {events.length} rounds
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{run} run</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{events.length - run} to come</span>
      </p>

      <ol className="grid gap-4">
        {events.map((event) => (
          <li key={`${event.year}-${event.round}-${event.name}`}>
            <EventCard event={event} now={now}
              nextSessionName={next?.event.name === event.name ? next.session.name : null} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function EventCard({ event, now, nextSessionName }: {
  event: ScheduleEvent; now: number; nextSessionName: string | null;
}) {
  const liveName = event.sessions.find((s) => stateAt(s, now) === "live")?.name ?? null;
  const isNextEvent = nextSessionName !== null;
  /* Run, and nothing left to run. `completed` is the server's answer about the
     race; a weekend is finished when every session of it has been read. */
  const finished = !liveName && event.sessions.length > 0
    && event.sessions.every((s) => stateAt(s, now) === "available");

  return (
    <article className={cx("panel overflow-hidden transition-colors",
      liveName ? "border-accent/30" : isNextEvent ? "border-accent/20" : undefined,
      // A weekend already read steps back rather than disappearing: it is still
      // part of the season, and a reader looking for "when was Monza" needs it.
      finished && "opacity-[0.62] hover:opacity-100")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          {/* One line of status, and only when there is one to give. */}
          {liveName ? (
            <p className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-accent-soft">
              <span aria-hidden className="live-dot" />
              Live now · {sessionAbbr(liveName)}
            </p>
          ) : isNextEvent ? (
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-accent-soft">
              Next Grand Prix
            </p>
          ) : finished && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">
              <Check size={11} className="shrink-0" />
              Completed
            </p>
          )}
          <h3 className="truncate text-[18px] font-semibold tracking-[-0.02em] text-ink sm:text-[20px]">
            {event.name}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-muted">
            {(event.circuit || event.location) && (
              <span className="flex items-center gap-1.5">
                <MapPin size={12} className="shrink-0 text-ink-faint" />
                {event.circuit || event.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarDays size={12} className="shrink-0 text-ink-faint" />
              {weekendSpan(event)}
            </span>
            {typeof event.round === "number" && event.round > 0 && (
              <span className="text-ink-faint">Round {event.round}</span>
            )}
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-3 lg:grid-cols-5">
        {event.sessions.map((s) => (
          <SessionCell key={s.name} session={s} now={now}
            isNext={s.name === nextSessionName} />
        ))}
      </ul>
    </article>
  );
}

function SessionCell({ session, now, isNext }: {
  session: ScheduledSession; now: number; isNext: boolean;
}) {
  const { time } = useLocale();
  const state = stateAt(session, now);
  const isLive = state === "live";
  const d = session.start ? new Date(session.start) : null;
  const valid = d && Number.isFinite(d.getTime());
  return (
    <li className={cx("flex flex-col gap-0.5 px-4 py-3",
      isLive ? "bg-accent/[0.13]" : isNext ? "bg-accent/[0.09]" : "bg-base-850/80")}>
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
      {/* Where this session is in its life, in one word — "already read" and
          "on track now" are not the same thing, and neither is "months away". */}
      {isLive ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-soft">
          On track
        </span>
      ) : state === "available" && !isNext && (
        <span className="text-[10px] uppercase tracking-wide text-ink-faint/70">Run</span>
      )}
    </li>
  );
}
