"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Schedule, ScheduleEvent, ScheduledSession } from "./types";

/* -------------------------------------------------------------------------- */
/* THE UPCOMING CALENDAR, ONCE.                                               */
/*                                                                            */
/* The countdown and the schedule are two views of one fact — what is next —   */
/* so they share a fetch and a clock rather than each keeping dates of their   */
/* own. The dates themselves are never written here: they come from            */
/* /api/schedule, which reads the same session times the availability rules    */
/* read (backend app/schedule.py), so nothing can be counted down to and       */
/* simultaneously offered as loadable.                                        */
/*                                                                            */
/* EVERY COMPARISON IS BETWEEN INSTANTS. `new Date(iso).getTime()` on an ISO   */
/* string carrying Z or an offset is an absolute moment, so a session at       */
/* 22:00-08:00 counts down correctly from a browser in Tokyo, and a daylight-  */
/* saving change moves nothing. No local date strings are compared anywhere.   */
/* -------------------------------------------------------------------------- */

/** One tick per second while something is being counted down. */
const TICK_MS = 1000;

export interface NextUp {
  event: ScheduleEvent;
  session: ScheduledSession;
  /** Absolute start, in epoch milliseconds. */
  startsAt: number;
  /** Milliseconds remaining; never negative. */
  msLeft: number;
}

/** Fetch the upcoming calendar once. Failure is quiet: the countdown is an
 *  enhancement, and a dead schedule endpoint must not take a page with it. */
export function useSchedule(limit = 6) {
  const [data, setData] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.schedule(limit)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [limit]);

  return { schedule: data, failed, loading: !data && !failed };
}

/**
 * A clock that ticks only while it is needed.
 *
 * `active` false parks it entirely — a page with no upcoming session, or a
 * reader who has asked for reduced motion, should not be running a timer per
 * second for a number that is not moving on screen.
 */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The next session anywhere on the schedule, walked forward as time passes.
 *
 * It transitions on its own: when a session starts it drops out of the
 * upcoming list and the next one takes its place, and when a weekend runs out
 * of sessions the following Grand Prix takes over — no state to reset, no
 * date to maintain, because "next" is recomputed from the same list every
 * tick rather than latched at mount.
 */
export function useNextUp(schedule: Schedule | null, now: number): NextUp | null {
  return useMemo(() => {
    if (!schedule?.events?.length) return null;
    let best: NextUp | null = null;
    for (const event of schedule.events) {
      for (const session of event.sessions) {
        if (!session.start) continue;
        const startsAt = new Date(session.start).getTime();
        if (!Number.isFinite(startsAt) || startsAt <= now) continue;
        if (!best || startsAt < best.startsAt) {
          best = { event, session, startsAt, msLeft: startsAt - now };
        }
      }
    }
    return best ? { ...best, msLeft: Math.max(0, best.startsAt - now) } : null;
  }, [schedule, now]);
}

/** Days / hours / minutes / seconds, already padded for display. */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { days, hours, minutes, seconds,
           hh: pad(hours), mm: pad(minutes), ss: pad(seconds) };
}

/** "FP1", "Q", "RACE" — the shorthand a pit wall would actually use. */
export function sessionAbbr(name: string): string {
  const map: Record<string, string> = {
    "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3",
    "Qualifying": "QUALI", "Sprint Qualifying": "SQ", "Sprint Shootout": "SQ",
    "Sprint": "SPRINT", "Race": "RACE",
  };
  return map[name] ?? name.toUpperCase();
}

/** The weekend's span — "Sep 4–6" — from the sessions themselves, so it is
 *  right even when the calendar's own `date` field means different things to
 *  different upstream sources. */
export function weekendSpan(event: ScheduleEvent): string {
  const stamps = event.sessions
    .map((s) => (s.start ? new Date(s.start).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  if (!stamps.length) return "";
  const first = new Date(Math.min(...stamps));
  const last = new Date(Math.max(...stamps));
  const month = first.toLocaleDateString(undefined, { month: "short" });
  if (first.getMonth() === last.getMonth()) {
    return first.getDate() === last.getDate()
      ? `${month} ${first.getDate()}`
      : `${month} ${first.getDate()}–${last.getDate()}`;
  }
  const lastMonth = last.toLocaleDateString(undefined, { month: "short" });
  return `${month} ${first.getDate()} – ${lastMonth} ${last.getDate()}`;
}

/** A short weekday for a session row: "Fri", "Sat", "Sun". */
export function sessionDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { weekday: "short" }) : "";
}

/**
 * Whether a value changed since the previous render, for the digit flip.
 * Kept here rather than in the component so the countdown and any future
 * readout animate identically.
 */
export function useChanged<T>(value: T): boolean {
  const prev = useRef(value);
  const changed = prev.current !== value;
  useEffect(() => { prev.current = value; });
  return changed;
}
