"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";

// Plain-English glossary for F1 jargon. A <Term> renders the word with a dotted
// underline and shows the definition on hover — so a new fan can learn as they go.
export const GLOSSARY: Record<string, string> = {
  stint: "A run on one set of tyres, between pit stops.",
  undercut: "Pitting for fresh tyres before a rival, using the extra grip to jump ahead when they stop.",
  overcut: "Staying out on older tyres longer than a rival, then pitting later and coming out ahead.",
  degradation: "How much slower a tyre gets as it wears through a stint.",
  delta: "The time difference between two cars or two laps.",
  "pit loss": "The total time a stop costs — driving through the pit lane plus the stationary time.",
  "out lap": "The first lap after leaving the pits, on cold tyres.",
  "in lap": "The lap coming into the pits, usually slower.",
  "clean air": "Running with no car directly ahead, so no disturbed airflow slowing you down.",
  traffic: "Being stuck behind slower cars, losing time in their dirty air.",
  vsc: "Virtual Safety Car — the whole field slows to a set delta after an incident; a cheap time to pit.",
  "safety car": "A real car leads the bunched-up field slowly after a serious incident.",
  interval: "The time gap to the car directly ahead.",
  gap: "The time behind the leader.",
  "tyre age": "How many laps a set of tyres has completed.",
  "clean-air pace": "A car's true one-lap speed once fuel load and tyre type are accounted for.",
  "representative pace": "Lap times that reflect real speed, ignoring laps distorted by traffic, pits or fuel.",
  compound: "The tyre type — Soft (fastest, wears quickest), Medium, or Hard (slowest, most durable).",
  "long run": "A longer practice stint used to gauge race pace rather than one-lap speed.",
  grid: "The starting order, set by qualifying.",
  "tyre-limited": "Lap times fell away noticeably through their stints — pace was capped by tyre wear rather than outright car speed.",
  // qualifying glossary
  "track evolution": "As more cars run, rubber builds up on the racing line and increases grip. This usually makes the circuit faster later in the session.",
  "pole margin": "How much faster the pole lap was than the second-quickest car's best lap.",
  "theoretical lap": "The lap you'd get by adding a driver's (or the session's) best individual sectors together — the perfect lap nobody quite drove.",
  "deleted lap": "A lap time removed by race control, usually for running beyond track limits. A deleted lap can knock a driver out of a segment.",
  sector: "Circuits are split into three timed chunks (Sectors 1, 2, 3). Comparing sectors shows exactly where a lap was won or lost.",
  q1: "The first knockout segment of qualifying — every car runs, and the slowest five are eliminated.",
  q2: "The middle knockout segment — the next five slowest are eliminated, leaving ten to fight for pole.",
  q3: "The final top-ten shootout that decides pole position and the front of the grid.",
  "out in q1": "Eliminated in the first qualifying segment — they'll start near the back.",
  "out in q2": "Eliminated in the middle qualifying segment — they'll start between P11 and P15.",
  "push lap": "A flat-out timed lap, as opposed to warming up or cooling the tyres.",
  "flying lap": "A lap started at full speed (not from the pits) — the laps that actually count in qualifying.",
  "cool-down lap": "A slow lap between push laps to bring tyre temperatures back into their ideal window.",
  "track limits": "The white lines defining the edge of the circuit. Put all four wheels beyond them and the lap time is deleted.",
  "representative lap": "A lap time that reflects genuine pace — not spoiled by traffic, weather or a mistake.",
  "teammate delta": "The gap between two drivers in identical cars — the cleanest measure of driver performance.",
  "session progression": "How the benchmark time falls from Q1 to Q3 as fuel comes down, softer tyres go on and the track gains grip.",
};

export function Term({ children, term }: { children: React.ReactNode; term?: string }) {
  const key = (term ?? String(children)).toLowerCase();
  const def = GLOSSARY[key];
  // rendered via a body portal at a fixed position — an absolutely positioned
  // popup gets clipped invisible inside any overflow-hidden card
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (!def) return <>{children}</>;
  return (
    <span className="relative inline"
      onMouseEnter={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: r.left, y: r.top });
      }}
      onMouseLeave={() => setPos(null)}>
      <span className={cx("cursor-help underline decoration-dotted decoration-ink-faint underline-offset-2")}>
        {children}
      </span>
      {pos && typeof document !== "undefined" && createPortal(
        <span className="pointer-events-none fixed z-[70] block w-60 rounded-lg border border-white/10 bg-base-900 p-2.5 text-xs font-normal leading-relaxed text-ink-muted shadow-glow"
          style={{
            left: Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 260),
            top: Math.max(8, pos.y - 8),
            transform: "translateY(-100%)",
          }}>
          <span className="mb-0.5 block font-semibold capitalize text-ink">{key}</span>
          {def}
        </span>,
        document.body,
      )}
    </span>
  );
}
