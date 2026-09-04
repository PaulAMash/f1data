"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Radio, RefreshCw } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useMode } from "@/lib/mode";
import {
  analysisAt, sessionAbbr, sessionDay, stateAt, useNow, useSchedule,
} from "@/lib/schedule";
import type { ScheduleEvent, ScheduledSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* THE SESSION IS OVER. THE TIMING HAS NOT ARRIVED.                           */
/*                                                                            */
/* THE STATE THIS EXISTS FOR, AND THE TWO WRONG ANSWERS IT REPLACES. A reader */
/* watched the Italian Grand Prix's Practice 2 finish. For twenty minutes     */
/* Pitwall IQ said it was still running — because "live" had been defined as  */
/* "not yet readable", so a slow archive looked like a car on track. Then the */
/* window elapsed, the data still had not come, and the same session dropped  */
/* straight to a bare failure screen. Neither sentence was true. The true one */
/* was never available to say: the session finished, and its official record  */
/* has not reached us yet.                                                    */
/*                                                                            */
/* SO THIS IS A STATE, NOT AN ERROR — the same argument the live panel makes, */
/* one step later in the weekend. It says what happened (the session is over, */
/* and when), what Pitwall IQ knows (the sources have been asked and have not */
/* published it), why there is no analysis, and what to do (wait, or try      */
/* again). The provider detail stays where it already lives, in the source    */
/* status below; a reader should not have to read an HTTP category to learn   */
/* that a practice session ended.                                             */
/*                                                                            */
/* IT PROMISES NOTHING. No countdown to the data, no "should be ready in ten  */
/* minutes", because we do not know and a number here would be the first      */
/* fabricated thing on the page. And it invents no lap, position or time —    */
/* everything below comes from the calendar, which is the same rule the live  */
/* panel follows.                                                             */
/* -------------------------------------------------------------------------- */

export function AwaitingData({ year, gp, session, onRetry, retrying, className }: {
  year: number; gp: string; session: string;
  onRetry?: () => void; retrying?: boolean; className?: string;
}) {
  const { schedule } = useSchedule();
  const now = useNow(true);
  const { time } = useLocale();
  const { mode } = useMode();
  const isAdvanced = mode === "advanced";

  /* Everything printed here is read off the calendar the rest of the site
     reads. If it has not arrived, the panel says less rather than guessing. */
  const event: ScheduleEvent | undefined = schedule?.events?.find(
    (e) => e.name === gp && e.year === year);
  const ran: ScheduledSession | undefined = event?.sessions?.find((s) => s.name === session);
  const endsAt = ran?.end ? new Date(ran.end) : null;
  const finishedAt = endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : null;
  const place = event ? [event.circuit, event.location].filter(Boolean)[0] : null;

  /* What comes next in the weekend — a reader whose session has finished is
     usually asking that too, and it costs nothing to answer. */
  const next = event?.sessions?.find((s) => stateAt(s, now) === "upcoming");
  const readable = (event?.sessions ?? []).filter((s) => analysisAt(s, now) === "available");

  return (
    <section aria-live="polite"
      className={cx("panel-hero relative overflow-hidden", className)}>
      <span aria-hidden className="cd-sweep" />

      <div className="relative px-6 py-7 sm:px-8 sm:py-8">
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted ring-1 ring-white/[0.09]">
                <CheckCircle2 size={12} className="shrink-0" />
                Completed
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                {sessionAbbr(session)}
              </span>
            </p>

            <h2 className="mt-3 text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">
              {gp}
            </h2>

            {/* THE SENTENCE THAT WAS MISSING. Past tense, and certain. */}
            <p className="mt-2 text-[15px] font-medium text-ink">
              {session} has finished.
            </p>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              {place && <span>{place}</span>}
              {finishedAt && (
                <span className="tabular-nums">
                  Ended {sessionDay(ran!.end!)} {time(finishedAt)}
                </span>
              )}
              <span className="text-ink-faint tabular-nums">{year}</span>
            </p>
          </div>

          {/* The one honest control. It genuinely re-asks the sources — the
              guard no longer refuses a finished session, so this is a button
              that can actually succeed. */}
          {onRetry && (
            <div className="lg:justify-self-end">
              <button onClick={onRetry} disabled={retrying}
                className="pill-btn h-[38px] justify-center">
                <RefreshCw size={14} className={cx(retrying && "animate-spin")} />
                Check again
              </button>
            </div>
          )}
        </div>

        <div className="mt-7 grid gap-5 border-t border-white/[0.07] pt-6 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:gap-8">
          <div>
            <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-faint">
              <Radio size={13} className="text-ink-muted" />
              Waiting for the official timing
            </h3>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-muted">
              Pitwall IQ reads completed sessions rather than the broadcast feed,
              which is what lets it be certain about every number it shows. The
              analysis appears here as soon as this session&rsquo;s official record
              reaches the open providers we read from. Nothing is wrong with the
              session — it simply has not been published to them yet.
            </p>
            {isAdvanced && (
              <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink-faint">
                We do not know how long that takes, and would rather say so than
                guess. What each provider answered is below.
              </p>
            )}
          </div>

          <div className="sm:justify-self-end sm:text-right">
            {next ? (
              <>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-faint">
                  Next up
                </h3>
                <p className="mt-2 text-[14px] text-ink">
                  <span className="font-semibold">{sessionAbbr(next.name)}</span>
                  {next.start && (
                    <span className="ml-2 tabular-nums text-ink-muted">
                      {sessionDay(next.start)} {time(new Date(next.start))}
                    </span>
                  )}
                </p>
              </>
            ) : readable.length > 0 && (
              <>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-faint">
                  Ready to read
                </h3>
                <p className="mt-2 text-[14px] text-ink-muted">
                  {readable.map((s) => sessionAbbr(s.name)).join(" · ")}
                </p>
              </>
            )}
            <Link href="/schedule"
              className="group/aw mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink">
              The full weekend
              <ArrowRight size={13}
                className="transition-transform duration-[--dur-2] group-hover/aw:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
