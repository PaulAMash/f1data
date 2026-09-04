"use client";
import { CalendarDays, MapPin } from "lucide-react";
import { useLocale } from "@/lib/locale";
import {
  sessionAbbr, sessionDay, splitDuration, useNextUp, useNow, useSchedule,
  weekendSpan,
} from "@/lib/schedule";
import type { ScheduleEvent, ScheduledSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* WHAT IS COMING.                                                            */
/*                                                                            */
/* An event schedule, not a table. Each Grand Prix is a card with its own      */
/* sessions laid out as a row of times, because the unit a reader thinks in    */
/* is the weekend — "when is Monza" — and a grid of one-session-per-row makes  */
/* them assemble that themselves.                                             */
/*                                                                            */
/* ON A PHONE the session row becomes a two-column grid rather than a          */
/* horizontal scroller: five sessions at four columns is one cramped line and  */
/* a hidden Race, which is the session most people opened the page for.        */
/*                                                                            */
/* All dates come from /api/schedule — the same source the countdown reads and */
/* the same session times that decide availability, so this list can never     */
/* disagree with either. Times print in the reader's own zone and clock        */
/* preference (lib/locale).                                                    */
/* -------------------------------------------------------------------------- */

export function UpcomingSchedule({ limit = 6, className }: {
  limit?: number; className?: string;
}) {
  const { schedule, loading, failed } = useSchedule(limit);
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
        <p className="text-[14px] font-medium text-ink">No upcoming sessions</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
          {failed
            ? "The calendar could not be read just now. It is upstream of us and usually brief."
            : "The season has finished. The next one will appear here as soon as its calendar is published."}
        </p>
      </div>
    );
  }

  return (
    <div className={cx("grid gap-4", className)}>
      {schedule.events.map((event) => (
        <EventCard key={`${event.year}-${event.name}`} event={event}
          nextSessionName={next?.event.name === event.name ? next.session.name : null}
          msToNext={next?.event.name === event.name ? next.msLeft : null} />
      ))}
    </div>
  );
}

function EventCard({ event, nextSessionName, msToNext }: {
  event: ScheduleEvent; nextSessionName: string | null; msToNext: number | null;
}) {
  const isNextEvent = nextSessionName !== null;
  return (
    <article className={cx("panel overflow-hidden transition-colors",
      isNextEvent && "border-accent/20")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          {isNextEvent && (
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-accent-soft">
              Next Grand Prix
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
          </p>
        </div>

        {/* How far away, in the coarsest unit that is still true — a reader
            scanning a list wants "in 3 days", not a running clock on every
            card. The live seconds belong to the countdown, once. */}
        {msToNext !== null && <Away ms={msToNext} />}
      </div>

      <ul className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-3 lg:grid-cols-5">
        {event.sessions.map((s) => (
          <SessionCell key={s.name} session={s} isNext={s.name === nextSessionName} />
        ))}
      </ul>
    </article>
  );
}

function SessionCell({ session, isNext }: { session: ScheduledSession; isNext: boolean }) {
  const { time } = useLocale();
  const d = session.start ? new Date(session.start) : null;
  const valid = d && Number.isFinite(d.getTime());
  return (
    <li className={cx("flex flex-col gap-0.5 px-4 py-3",
      isNext ? "bg-accent/[0.09]" : "bg-base-850/80")}>
      <span className={cx("text-[10.5px] font-bold uppercase tracking-[0.14em]",
        isNext ? "text-accent-soft" : session.available ? "text-ink-faint" : "text-ink-muted")}>
        {sessionAbbr(session.name)}
      </span>
      <span className={cx("text-[13px] tabular-nums",
        isNext ? "font-semibold text-ink" : "text-ink-muted")}>
        {valid ? (
          <>
            <span className="text-ink-faint">{sessionDay(session.start)}</span>{" "}
            {time(d!)}
          </>
        ) : <span className="text-ink-faint">TBC</span>}
      </span>
      {/* A session that has already run says so, because on a schedule of
          upcoming events an in-progress weekend still shows its Friday. */}
      {session.available && !isNext && (
        <span className="text-[10px] uppercase tracking-wide text-ink-faint/70">Run</span>
      )}
    </li>
  );
}

/** "in 3 days" / "in 4 hours" / "in 12 min" — one unit, never a running clock. */
function Away({ ms }: { ms: number }) {
  const t = splitDuration(ms);
  const label = t.days > 0 ? `${t.days} day${t.days === 1 ? "" : "s"}`
    : t.hours > 0 ? `${t.hours} hour${t.hours === 1 ? "" : "s"}`
      : `${t.minutes} min`;
  return (
    <span className="shrink-0 rounded-lg border border-accent/25 bg-accent/[0.08] px-2.5 py-1 text-[12px] font-semibold text-accent-soft">
      in {label}
    </span>
  );
}
