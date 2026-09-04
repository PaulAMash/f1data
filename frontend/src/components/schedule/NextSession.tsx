"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { usePrefs } from "@/lib/prefs";
import {
  sessionAbbr, sessionDay, splitDuration, useChanged, useNextUp, useNow,
  useSchedule, weekendSpan,
} from "@/lib/schedule";
import type { ScheduleEvent, ScheduledSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* WHAT IS NEXT.                                                              */
/*                                                                            */
/* A pit wall's clock: the Grand Prix, the session it is waiting for, and the  */
/* time until it starts — with the rest of the weekend underneath so a reader  */
/* can see where in the weekend they are standing.                            */
/*                                                                            */
/* IT TRANSITIONS BY ITSELF and holds no dates of its own. `useNextUp`         */
/* recomputes "next" from the schedule every tick rather than latching it at   */
/* mount, so FP1 gives way to FP2 the instant FP1 begins, and the following    */
/* Grand Prix takes over when a weekend runs out of sessions. The dates come   */
/* from /api/schedule, which reads the same session times that decide whether  */
/* a session may be loaded (backend app/schedule.py) — so this can never       */
/* count down to something the Explorer is simultaneously offering to open.    */
/*                                                                            */
/* EVERY COMPARISON IS BETWEEN INSTANTS, never between local date strings, so  */
/* a session at 22:00-08:00 is correct from any timezone and daylight saving   */
/* moves nothing. Times are printed with the reader's own clock preference     */
/* (lib/locale), in their own timezone, because that is the only zone that     */
/* answers "can I watch this".                                                 */
/* -------------------------------------------------------------------------- */

export function NextSession({ className }: { className?: string }) {
  const { schedule, loading, failed } = useSchedule(6);
  const { prefs } = usePrefs();

  /* The clock ticks only when there is something to count. Under Reduced the
     seconds are not animated, but the number still has to be right — a
     countdown frozen at load is worse than no countdown, so the tick stays
     and only the movement goes. */
  const now = useNow(!!schedule);
  const next = useNextUp(schedule ?? null, now);
  const still = prefs.motion === "reduced";

  if (loading) return <Skeleton className={className} />;
  // Quiet on failure: this is an enhancement, and a dead endpoint must not
  // leave an error card sitting on a page that is otherwise fine.
  if (failed || !schedule || !next) return null;

  const { event, session, msLeft } = next;
  const t = splitDuration(msLeft);

  return (
    <div className={cx("panel-hero relative overflow-hidden", className)}>
      <span aria-hidden className="cd-sweep" />

      <div className="relative grid gap-x-10 gap-y-7 px-6 py-7 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {/* ---- who, where ---- */}
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-soft">
            <span className="h-px w-6 bg-accent-soft/60" />
            Next up
          </p>
          <h3 className="mt-2.5 truncate text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">
            {event.name}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            {(event.circuit || event.location) && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="shrink-0 text-ink-faint" />
                {event.circuit || event.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarDays size={13} className="shrink-0 text-ink-faint" />
              {weekendSpan(event)}
            </span>
          </p>

          {/* The rest of the weekend, so the countdown says where you are in
              it rather than only what is immediately next. */}
          <SessionRail event={event} nextName={session.name} />
        </div>

        {/* ---- the clock ---- */}
        <div className="lg:justify-self-end">
          {!still && (
            <div className="cd-lights mb-4" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="cd-light"
                  style={{ animationDelay: `${i * 0.16}s` }} />
              ))}
            </div>
          )}

          {/* `key` on the session name is what makes a session change animate:
              React remounts the block, and the arrival plays once. */}
          <div key={session.name} className={cx(!still && "cd-session-in")}>
            <p className="flex items-baseline gap-2.5">
              <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-accent-soft ring-1 ring-accent/25">
                {sessionAbbr(session.name)}
              </span>
              <span className="text-[12px] text-ink-faint">
                {sessionDay(session.start)} · <Clock iso={session.start} />
              </span>
            </p>

            <Readout t={t} still={still} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The number itself. Tabular figures so nothing shifts as digits change, and  */
/* the days column disappears once it would read "0d" — a zero that only ever  */
/* means "not today" is noise.                                                 */
/* -------------------------------------------------------------------------- */
function Readout({ t, still }: { t: ReturnType<typeof splitDuration>; still: boolean }) {
  return (
    <p className="mt-3 flex items-baseline gap-1 font-mono text-[40px] font-bold leading-none tracking-[-0.04em] text-ink sm:text-[52px]">
      {t.days > 0 && (
        <>
          <Cell value={String(t.days)} still={still} />
          <Unit>d</Unit>
        </>
      )}
      <Cell value={t.hh} still={still} />
      <Sep />
      <Cell value={t.mm} still={still} />
      <Sep />
      <Cell value={t.ss} still={still} accent />
    </p>
  );
}

/** One group of digits, animated only when its own value changes — so the
 *  seconds tick every second and the hours sit perfectly still for an hour. */
function Cell({ value, still, accent }: { value: string; still: boolean; accent?: boolean }) {
  const changed = useChanged(value);
  return (
    <span key={value}
      className={cx("tabular-nums", accent && "text-accent",
        changed && !still && "cd-tick")}>
      {value}
    </span>
  );
}

const Sep = () => <span aria-hidden className="px-0.5 text-ink-faint/50">:</span>;
const Unit = ({ children }: { children: React.ReactNode }) => (
  <span className="pr-1.5 text-[20px] font-semibold text-ink-faint sm:text-[24px]">{children}</span>
);

/** A wall-clock time in the reader's own zone and clock preference. */
function Clock({ iso }: { iso: string | null }) {
  const { time } = useLocale();
  const d = useMemo(() => (iso ? new Date(iso) : null), [iso]);
  if (!d || !Number.isFinite(d.getTime())) return null;
  return <span className="tabular-nums">{time(d)}</span>;
}

/* -------------------------------------------------------------------------- */
/* The weekend as a rail: every session, with the one being counted down       */
/* marked and the ones already run dimmed. Wraps rather than scrolls, because  */
/* a horizontal scroller on a phone hides exactly the sessions at the end of   */
/* the weekend that a reader most wants to see.                                */
/* -------------------------------------------------------------------------- */
function SessionRail({ event, nextName }: { event: ScheduleEvent; nextName: string }) {
  return (
    <ul className="mt-5 flex flex-wrap items-center gap-1.5">
      {event.sessions.map((s) => (
        <SessionChip key={s.name} session={s} isNext={s.name === nextName} />
      ))}
    </ul>
  );
}

function SessionChip({ session, isNext }: { session: ScheduledSession; isNext: boolean }) {
  const { time } = useLocale();
  const d = session.start ? new Date(session.start) : null;
  const when = d && Number.isFinite(d.getTime())
    ? `${sessionDay(session.start)} ${time(d)}` : "";
  return (
    <li>
      <span title={when}
        className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]",
          isNext ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30"
            : session.available ? "bg-white/[0.04] text-ink-faint line-through decoration-white/20"
              : "bg-white/[0.03] text-ink-muted")}>
        {sessionAbbr(session.name)}
      </span>
    </li>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("panel h-[188px] animate-pulse", className)} aria-hidden />
  );
}

/* -------------------------------------------------------------------------- */
/* The compact form, for a page that already has a subject — one line, no      */
/* lights, no rail. Used on the Explorer, where the countdown is context       */
/* rather than the headline.                                                   */
/* -------------------------------------------------------------------------- */
export function NextSessionStrip({ className }: { className?: string }) {
  const { schedule, failed } = useSchedule(4);
  const { prefs } = usePrefs();
  const now = useNow(!!schedule);
  const next = useNextUp(schedule ?? null, now);
  const still = prefs.motion === "reduced";

  if (failed || !schedule || !next) return null;
  const { event, session, msLeft } = next;
  const t = splitDuration(msLeft);

  return (
    <Link href="/schedule"
      className={cx("group/next flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/[0.07] bg-base-850/50 px-3.5 py-2.5 transition-colors hover:border-accent/25 hover:bg-base-850/80",
        className)}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Next</span>
      <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{event.name}</span>
      <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-soft">
        {sessionAbbr(session.name)}
      </span>
      <span className={cx("ml-auto font-mono text-[13.5px] font-semibold tabular-nums text-ink",
        !still && "cd-tick")} key={t.ss}>
        {t.days > 0 ? `${t.days}d ` : ""}{t.hh}:{t.mm}:{t.ss}
      </span>
      <ArrowRight size={14}
        className="text-ink-faint transition-transform duration-[--dur-2] group-hover/next:translate-x-0.5" />
    </Link>
  );
}
