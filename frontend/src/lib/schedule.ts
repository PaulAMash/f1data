"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type {
  LiveSession, Schedule, ScheduleEvent, ScheduledSession, SessionState,
} from "./types";

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

/** How long a fetched calendar may be reused before it is asked for again.
 *  A published schedule changes on the timescale of a press release; what
 *  changes minute to minute is the clock, and the clock is local. */
const SCHEDULE_TTL_MS = 5 * 60 * 1000;

const inflight = new Map<number, { at: number; promise: Promise<Schedule> }>();

/** One request per calendar, however many components want it.
 *
 * The Schedule page mounts three readers of the same endpoint — the live
 * panel, the countdown and the list — and each used to fetch for itself. They
 * ask the same question and are entitled to the same answer. */
function loadSchedule(limit: number, force = false): Promise<Schedule> {
  const hit = inflight.get(limit);
  if (!force && hit && Date.now() - hit.at < SCHEDULE_TTL_MS) return hit.promise;
  const promise = api.schedule(limit);
  inflight.set(limit, { at: Date.now(), promise });
  // A failure must not be cached, or one bad moment costs the page five
  // minutes of nothing.
  promise.catch(() => {
    if (inflight.get(limit)?.promise === promise) inflight.delete(limit);
  });
  return promise;
}

/** Fetch the upcoming calendar. Failure is quiet: the countdown is an
 *  enhancement, and a dead schedule endpoint must not take a page with it.
 *
 *  It re-asks on a slow timer so a tab left open across a session boundary
 *  eventually sees the new calendar. It does not need to for the *states* to
 *  move — every instant that decides them is already in the payload, and
 *  `stateAt` reads them against the local clock every tick. */
export function useSchedule(limit = 6) {
  const [data, setData] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const ask = (force = false) => {
      loadSchedule(limit, force)
        .then((d) => { if (live) { setData(d); setFailed(false); } })
        .catch(() => { if (live && !data) setFailed(true); });
    };
    ask();
    const id = setInterval(() => ask(true), SCHEDULE_TTL_MS);
    return () => { live = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  return { schedule: data, failed, loading: !data && !failed };
}

/**
 * Where a session is right now, from the instants the server sent.
 *
 * THE SERVER'S `state` IS A PHOTOGRAPH; this is the film. `state` was true at
 * the moment the response was written, and a page open across the start of
 * Practice 1 would have kept showing "upcoming" until it next happened to
 * ask. Both boundaries are published as instants — `start` and `available_at`
 * — so the page can move through them on the exact second against the reader's
 * own clock, with no request and no rule of its own.
 */
export function stateAt(s: ScheduledSession, now: number): SessionState {
  const start = s.start ? new Date(s.start).getTime() : NaN;
  const opens = s.available_at ? new Date(s.available_at).getTime() : NaN;
  if (!Number.isFinite(start)) {
    // No published start: the server's answer is the only one available, and
    // a session with no instant is never called live (see backend schedule.py).
    return s.state ?? (s.available ? "available" : "upcoming");
  }
  if (now < start) return "upcoming";
  if (!Number.isFinite(opens)) return s.state === "available" ? "available" : "live";
  return now >= opens ? "available" : "live";
}

/**
 * The session on track right now, assembled from the calendar the page
 * already has.
 *
 * Derived rather than taken from `schedule.live` for the reason above: this
 * turns over the instant the clock does. `schedule.live` remains the server's
 * own answer to the same question, and the two agree by construction because
 * they read the same instants.
 */
export function useLiveNow(schedule: Schedule | null, now: number): LiveSession | null {
  return useMemo(() => {
    if (!schedule?.events?.length) return null;
    for (const event of schedule.events) {
      const running = event.sessions.find((s) => stateAt(s, now) === "live");
      if (!running) continue;
      const next = event.sessions
        .filter((s) => s.start && new Date(s.start).getTime() > now)
        .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())[0];
      return {
        year: event.year, round: event.round, name: event.name,
        location: event.location, country: event.country, circuit: event.circuit,
        date: event.date,
        session: running.name,
        start: running.start ?? null,
        end: running.end ?? null,
        available_at: running.available_at ?? null,
        next_session: next?.start ? { name: next.name, start: next.start } : null,
        sessions: event.sessions,
      };
    }
    return null;
  }, [schedule, now]);
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

/**
 * How far the clock has run into a session, 0…1 — or null when the schedule
 * does not give both ends of it.
 *
 * IT IS THE CLOCK, NOT THE SESSION. This measures scheduled minutes elapsing;
 * it does not know the lap count, a red flag, or a session that ran long, and
 * the label beside it says "expected" for exactly that reason. Presenting it
 * as session progress would be the first fabricated number on the page.
 */
export function elapsedFraction(start: string | null | undefined,
                                end: string | null | undefined,
                                now: number): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** Milliseconds since a session started; never negative, null if unknown. */
export function msSince(start: string | null | undefined, now: number): number | null {
  if (!start) return null;
  const a = new Date(start).getTime();
  return Number.isFinite(a) ? Math.max(0, now - a) : null;
}

/** "1h 04m" / "42 min" — how long something has been running, in words a
 *  person would use. Deliberately coarser than the countdown: this number is
 *  context, and a second-by-second clock here would compete with the one that
 *  is actually counting down to something. */
export function runningFor(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

/** The live session, fetched and derived in one call — for callers that only
 *  need to know whether anything is on track, such as a section heading that
 *  must not say "hasn't happened yet" above a session that is happening. */
export function useLiveSession(limit = 6): LiveSession | null {
  const { schedule } = useSchedule(limit);
  const now = useNow(true);
  return useLiveNow(schedule, now);
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
