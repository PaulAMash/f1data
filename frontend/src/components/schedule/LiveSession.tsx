"use client";
import Link from "next/link";
import { ArrowRight, MapPin, Radio } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useMode } from "@/lib/mode";
import { usePrefs } from "@/lib/prefs";
import {
  elapsedFraction, msSince, runningFor, sessionAbbr, sessionDay, useLiveNow,
  useNow, useSchedule,
} from "@/lib/schedule";
import { SessionPill } from "./SessionLink";
import { NextSession, NextSessionStrip } from "./NextSession";
import type { LiveSession as Live, ScheduledSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* A SESSION THAT IS HAPPENING RIGHT NOW.                                     */
/*                                                                            */
/* THE STATE THIS PAGE EXISTS FOR. Between the moment the lights go out and   */
/* the moment the official timing is published, Pitwall IQ has nothing to     */
/* analyse — and until now it said so in the only vocabulary it had, which    */
/* was the vocabulary of failure: "this session has not been run". A reader    */
/* who had the television on knew that was false, and a product caught being   */
/* wrong about the thing it is named after does not get the benefit of the     */
/* doubt on the numbers either.                                                */
/*                                                                            */
/* So the live state is a STATE, not an error. It says the true thing loudly   */
/* — the Grand Prix is running — and the honest thing plainly: the analysis    */
/* arrives when the data does.                                                 */
/*                                                                            */
/* NOTHING HERE IS INVENTED. Every value on this panel comes from the          */
/* schedule: the Grand Prix, the circuit, which session, when it started,      */
/* when it is expected to end, and what follows it. There is no position, no   */
/* lap, no gap and no tyre, because we do not have them — and a live view      */
/* that guessed at them would be worth less than this one. The only moving     */
/* number is the clock, which we do know.                                      */
/*                                                                            */
/* The motion is real but small: the dot, the panel's edge, the bar filling    */
/* against the scheduled length. All of it collapses under Reduced motion      */
/* while the state itself survives — see the live block in globals.css.        */
/* -------------------------------------------------------------------------- */

/** The panel. Pass `live` when the caller already has it (the Explorer knows
 *  which session it asked for); otherwise it reads the shared schedule. */
export function LiveSessionPanel({ live, className, onOpenSchedule }: {
  live?: Live | null; className?: string; onOpenSchedule?: boolean;
}) {
  const { schedule } = useSchedule();
  const now = useNow(true);
  const derived = useLiveNow(schedule, now);
  const session = live ?? derived;
  const { time } = useLocale();
  const { mode } = useMode();
  const isAdvanced = mode === "advanced";

  if (!session) return null;

  const since = msSince(session.start, now);
  const fraction = elapsedFraction(session.start, session.end, now);
  const place = [session.circuit, session.location].filter(Boolean)[0] ?? session.country;
  const startsAt = session.start ? new Date(session.start) : null;
  const endsAt = session.end ? new Date(session.end) : null;

  return (
    <section aria-live="polite"
      className={cx("panel-hero live-panel relative overflow-hidden", className)}>
      <span aria-hidden className="cd-sweep" />

      <div className="relative px-6 py-7 sm:px-8 sm:py-8">
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          {/* ---- what is happening ---- */}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="inline-flex items-center gap-2 rounded-md bg-accent/15 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent-soft ring-1 ring-accent/30">
                <span aria-hidden className="live-dot" />
                Live
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                {sessionAbbr(session.session)}
              </span>
            </p>

            <h2 className="mt-3 text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">
              {session.name}
            </h2>

            <p className="mt-2 text-[15px] font-medium text-ink">
              {session.session} is underway.
            </p>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              {place && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} className="shrink-0 text-ink-faint" />
                  {place}
                </span>
              )}
              {startsAt && Number.isFinite(startsAt.getTime()) && (
                <span className="tabular-nums">Started {time(startsAt)}</span>
              )}
              {/* The expected end is a scheduled length, not an observed one —
                  a red flag moves it and we would not know. Advanced readers
                  get it labelled for what it is; Simple does not need it. */}
              {isAdvanced && endsAt && Number.isFinite(endsAt.getTime()) && (
                <span className="tabular-nums text-ink-faint">
                  expected to end {time(endsAt)}
                </span>
              )}
            </p>
          </div>

          {/* ---- how long it has been running ---- */}
          {since !== null && (
            <div className="lg:justify-self-end lg:text-right">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                Running for
              </p>
              <p key={Math.floor(since / 60000)}
                className="live-elapsed mt-1.5 font-mono text-[34px] font-bold leading-none tracking-[-0.04em] text-ink sm:text-[42px]">
                {runningFor(since)}
              </p>
            </div>
          )}
        </div>

        {/* ---- the clock against the scheduled length ---- */}
        {fraction !== null && (
          <div className="mt-6">
            <div className="live-bar" role="presentation">
              <span className="live-bar-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
            </div>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Against the scheduled session length — the clock, not the timing sheet.
            </p>
          </div>
        )}

        {/* ---- what we can and cannot do, said plainly ---- */}
        <div className="mt-7 grid gap-5 border-t border-white/[0.07] pt-6 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:gap-8">
          <div>
            <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-faint">
              <Radio size={13} className="text-accent-soft" />
              Pitwall IQ analysis
            </h3>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-muted">
              Pace, strategy, stints and the full lap-by-lap read appear here once
              the session has finished and its official timing is published — a
              few minutes after the flag. Pitwall IQ works from the completed
              record rather than the broadcast feed, which is what lets it be
              certain about every number it shows.
            </p>
            {isAdvanced && (
              <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink-faint">
                Nothing on this page is estimated: the Grand Prix, the circuit,
                the session and its times all come from the same calendar the
                countdown reads.
              </p>
            )}
          </div>

          <div className="sm:justify-self-end sm:text-right">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-faint">
              Next up
            </h3>
            {session.next_session ? (
              <p className="mt-2 text-[14px] text-ink">
                <span className="font-semibold">{sessionAbbr(session.next_session.name)}</span>
                <span className="ml-2 tabular-nums text-ink-muted">
                  {sessionDay(session.next_session.start)}{" "}
                  {time(new Date(session.next_session.start))}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-muted">
                The last session of the weekend.
              </p>
            )}
            {onOpenSchedule && (
              <Link href="/schedule"
                className="group/live mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink">
                The full weekend
                <ArrowRight size={13}
                  className="transition-transform duration-[--dur-2] group-hover/live:translate-x-0.5" />
              </Link>
            )}
          </div>
        </div>

        {/* ---- where in the weekend this is ---- */}
        {isAdvanced && session.sessions?.length > 0 && (
          <WeekendRail where={{ year: session.year, gp: session.name }}
            sessions={session.sessions} liveName={session.session} now={now} />
        )}
      </div>
    </section>
  );
}

/** Every session of the weekend, with the one on track marked, the ones
 *  already read struck through — and each of those a link to its own analysis.
 *  Advanced only: in Simple the three lines above already answer "what is
 *  happening and what is next". */
function WeekendRail({ where, sessions, liveName, now }: {
  where: { year: number; gp: string };
  sessions: ScheduledSession[]; liveName: string; now: number;
}) {
  return (
    <ul className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-white/[0.07] pt-5">
      {sessions.map((s) => (
        <SessionPill key={s.name} where={where} session={s} now={now}
          isLive={s.name === liveName} />
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* ONE HERO, WHICHEVER IS TRUE.                                               */
/*                                                                            */
/* A session on track and a session being counted down to are the same fact   */
/* at two moments, so they take the same place on the page rather than         */
/* stacking two full-width panels and asking the reader which one is the       */
/* headline. The live panel carries its own "next up", so nothing is lost in   */
/* the swap — and because both read the calendar against the local clock, the  */
/* changeover happens on the second, without a reload.                         */
/* -------------------------------------------------------------------------- */
export function SessionHero({ className }: { className?: string }) {
  const { schedule } = useSchedule();
  const now = useNow(true);
  const live = useLiveNow(schedule, now);
  return live
    ? <LiveSessionPanel live={live} className={className} />
    : <NextSession className={className} />;
}

/* -------------------------------------------------------------------------- */
/* The one-line form, for a page that already has a subject. Sits where the    */
/* countdown strip sits and replaces it while a session is on track, because   */
/* counting down to FP2 while FP1 is running buries the more interesting fact. */
/* -------------------------------------------------------------------------- */
export function LiveStrip({ live, className }: { live?: Live | null; className?: string }) {
  const { schedule } = useSchedule();
  const { prefs } = usePrefs();
  const now = useNow(true);
  const derived = useLiveNow(schedule, now);
  const session = live ?? derived;
  const { time } = useLocale();

  if (!session) return null;
  const since = msSince(session.start, now);
  const startsAt = session.start ? new Date(session.start) : null;

  return (
    <Link href="/schedule"
      className={cx("group/live flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2.5 transition-colors hover:border-accent/40 hover:bg-accent/[0.11]",
        prefs.motion !== "reduced" && "live-panel", className)}>
      <span className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-accent-soft">
        <span aria-hidden className="live-dot" />
        Live
      </span>
      <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{session.name}</span>
      <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-soft">
        {sessionAbbr(session.session)}
      </span>
      <span className="ml-auto text-[12.5px] tabular-nums text-ink-muted">
        {since !== null ? `running ${runningFor(since)}`
          : startsAt && Number.isFinite(startsAt.getTime()) ? `from ${time(startsAt)}` : ""}
      </span>
      <ArrowRight size={14}
        className="text-ink-faint transition-transform duration-[--dur-2] group-hover/live:translate-x-0.5" />
    </Link>
  );
}

/** The strip form of the same choice: what is on track, else what is next.
 *  Used where the page already has a subject — the Explorer, the landing
 *  page's band — and the session is context rather than the headline. */
export function SessionStrip({ className }: { className?: string }) {
  const { schedule } = useSchedule();
  const now = useNow(true);
  const live = useLiveNow(schedule, now);
  return live
    ? <LiveStrip live={live} className={className} />
    : <NextSessionStrip className={className} />;
}
