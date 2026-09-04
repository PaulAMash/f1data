"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { SessionHero } from "@/components/schedule/LiveSession";
import { UpcomingSchedule } from "@/components/schedule/UpcomingSchedule";
import { trackPageView } from "@/lib/analytics";

/* -------------------------------------------------------------------------- */
/* THE SCHEDULE.                                                              */
/*                                                                            */
/* One page answering one question — when is the next one — at two distances:  */
/* the countdown for the session about to happen, and the weekends after it.   */
/*                                                                            */
/* IT IS ITS OWN PAGE because "when is the race" is a question people arrive   */
/* with, not one they discover while reading a race. The Explorer answers      */
/* "what happened"; this answers "what is about to". Both read the same        */
/* /api/schedule, which reads the same session times that decide what the      */
/* Explorer may load — so the two pages can never contradict each other.       */
/*                                                                            */
/* Nothing here is maintained by hand: no dates in the source, no season       */
/* pinned in the UI. When the calendar moves, this moves.                      */
/* -------------------------------------------------------------------------- */

export default function SchedulePage() {
  useEffect(() => { trackPageView("/schedule"); }, []);

  return (
    <div className="min-h-screen">
      <NavBar active="schedule" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            <span className="font-mono text-accent-soft">F1</span>
            <span className="h-px w-6 bg-white/[0.14]" />
            Schedule
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-white to-ink-muted bg-clip-text text-3xl font-bold tracking-[-0.03em] text-transparent sm:text-4xl">
            What happens next
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Every session of the weekend ahead, and the Grands Prix after it —
            in your own time zone. While a session is on track this page says
            so. Once it has run,{" "}
            <Link href="/explorer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
              Explore
            </Link>{" "}
            can tell you what happened in it.
          </p>
        </header>

        {/* The countdown, or the session it was counting down to — see
            SessionHero. One place on the page, whichever is true. */}
        <SessionHero />

        <section className="mt-9">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
                The weekends ahead
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                Session times are shown in your device&rsquo;s time zone.
              </p>
            </div>
            <Link href="/history"
              className="group/hist inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink">
              Past seasons
              <ArrowRight size={13}
                className="transition-transform duration-[--dur-2] group-hover/hist:translate-x-0.5" />
            </Link>
          </div>
          <UpcomingSchedule className="mt-4" limit={8} />
        </section>
      </main>

      <Footer />
    </div>
  );
}
