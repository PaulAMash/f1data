"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquareText } from "lucide-react";
import { api } from "@/lib/api";
import type { Featured } from "@/lib/types";
import { useLivery } from "@/lib/liveryColor";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The latest race.                                                           */
/*                                                                            */
/* This replaces Quick start, which was three cards explaining what the        */
/* product does — to a reader who had just read a headline explaining what the */
/* product does, above three doors explaining what the product does, on a page */
/* that now opens a guided tour of the product doing it. Four explanations and */
/* nothing to actually look at.                                                */
/*                                                                            */
/* So this is not an explanation. It is the thing itself: the most recent      */
/* Grand Prix that has actually been run, with its real winner, its real       */
/* margin and the sentence Pitwall IQ wrote about it, and one button that      */
/* opens it. A reader who arrived wanting to know about a race is one press    */
/* from the answer, and a reader who arrived sceptical has just been shown     */
/* the product's output rather than a description of it.                       */
/*                                                                            */
/* It fails to nothing. If the archive is unreachable the section is absent    */
/* rather than being a skeleton or an apology — a landing page that opens with */
/* an error about its own data has made the argument against itself.           */
/* -------------------------------------------------------------------------- */

/** Three questions the answer engine genuinely handles, as ways in. */
const ASKS = [
  "Why did the leader win?",
  "Who had the best strategy?",
  "Where were the places won?",
];

export function FeaturedRace() {
  const [race, setRace] = useState<Featured | null>(null);
  const [failed, setFailed] = useState(false);
  const paint = useLivery();

  useEffect(() => {
    let alive = true;
    api.featured()
      .then((f) => { if (alive) (f.available ? setRace(f) : setFailed(true)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null;

  const href = race
    ? `/explorer?year=${race.year}&gp=${encodeURIComponent(race.gp ?? "")}&session=Race`
    : "/explorer";
  const tint = paint(race?.winner?.team_color);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      {/* ---- the race ------------------------------------------------- */}
      <Link href={href}
        className={cx("group/feat panel-hero relative block overflow-hidden p-6 sm:p-7",
          race ? "pressable" : "pointer-events-none")}
        style={race ? { ["--pick" as string]: tint } : undefined}>
        {/* the winner's colour, thrown into the corner of the card */}
        <span aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-70 transition-opacity duration-[--dur-4] group-hover/feat:opacity-100"
          style={{ background: `radial-gradient(closest-side, ${tint}38, transparent)` }} />

        {race ? (
          <div className="relative">
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
              <span className="feat-live h-1.5 w-1.5 rounded-full bg-accent" />
              Latest Grand Prix
              <span className="font-normal tracking-normal text-ink-faint">
                · {race.circuit} · {race.laps} laps
              </span>
            </p>

            <h3 className="mt-2.5 text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[31px]">
              {race.gp}
            </h3>

            {race.story && (
              <p className="mt-2.5 max-w-xl text-[14.5px] leading-relaxed text-ink-muted">
                {race.story}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
              <Fact label="Winner">
                <span className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full" style={{ background: tint }} />
                  <span className="text-[17px] font-bold tracking-tight text-ink">
                    {race.winner?.name}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11.5px] text-ink-faint">{race.winner?.team}</span>
              </Fact>
              {race.margin && (
                <Fact label="Margin">
                  <span className="font-mono text-[17px] font-bold tabular-nums text-ink">
                    {race.margin}
                  </span>
                </Fact>
              )}
              {race.turning_point && (
                <Fact label="Turning point">
                  <span className="text-[15px] font-semibold text-ink">
                    {race.turning_point.title}
                  </span>
                </Fact>
              )}
              <Fact label="Classified">
                <span className="font-mono text-[17px] font-bold tabular-nums text-ink">
                  {race.finishers}<span className="text-ink-faint">/{race.entries}</span>
                </span>
              </Fact>
            </div>

            <span className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-accent-soft transition-colors group-hover/feat:text-accent">
              Read the full analysis
              <ArrowRight size={14}
                className="transition-transform duration-[--dur-2] group-hover/feat:translate-x-0.5" />
            </span>
          </div>
        ) : (
          <FeaturedSkeleton />
        )}
      </Link>

      {/* ---- and a way to interrogate it ------------------------------ */}
      <div className="panel flex flex-col p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          <MessageSquareText size={13} className="text-accent-soft" />
          Or just ask
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          Every answer is worked out from this session&rsquo;s own lap data. If the data
          cannot support one, it says so rather than inventing it.
        </p>
        <div className="mt-4 flex flex-1 flex-col justify-end gap-2">
          {ASKS.map((q, i) => (
            <Link key={q}
              href={`${href}${href.includes("?") ? "&" : "?"}tab=ask&q=${encodeURIComponent(q)}`}
              className="group/ask flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-base-900/50 px-3.5 py-2.5 text-[13px] text-ink-muted transition-all duration-[--dur-2] ease-[--ease-out] hover:-translate-y-0.5 hover:border-white/[0.16] hover:text-ink"
              style={{ transitionDelay: `${i * 20}ms` }}>
              <span aria-hidden className="text-ink-faint transition-colors group-hover/ask:text-accent-soft">
                &ldquo;
              </span>
              {q}
              <ArrowRight size={13}
                className="ml-auto shrink-0 text-ink-faint opacity-0 transition-all duration-[--dur-2] group-hover/ask:translate-x-0.5 group-hover/ask:opacity-100" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Shaped like the card, not like a loading spinner — the layout never jumps. */
function FeaturedSkeleton() {
  return (
    <div className="relative animate-pulse" aria-hidden>
      <span className="block h-2.5 w-40 rounded bg-white/[0.07]" />
      <span className="mt-4 block h-7 w-72 rounded bg-white/[0.07]" />
      <span className="mt-4 block h-3.5 w-full max-w-lg rounded bg-white/[0.05]" />
      <span className="mt-2 block h-3.5 w-2/3 max-w-sm rounded bg-white/[0.05]" />
      <span className="mt-8 flex gap-8">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block">
            <span className="block h-2 w-14 rounded bg-white/[0.05]" />
            <span className="mt-2 block h-4 w-24 rounded bg-white/[0.07]" />
          </span>
        ))}
      </span>
    </div>
  );
}
