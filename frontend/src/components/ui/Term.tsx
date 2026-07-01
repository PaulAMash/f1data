"use client";
import { useState } from "react";
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
};

export function Term({ children, term }: { children: React.ReactNode; term?: string }) {
  const key = (term ?? String(children)).toLowerCase();
  const def = GLOSSARY[key];
  const [open, setOpen] = useState(false);
  if (!def) return <>{children}</>;
  return (
    <span className="relative inline"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className={cx("cursor-help underline decoration-dotted decoration-ink-faint underline-offset-2")}>
        {children}
      </span>
      {open && (
        <span className="absolute bottom-5 left-0 z-50 w-60 rounded-lg border border-white/10 bg-base-900 p-2.5 text-xs font-normal leading-relaxed text-ink-muted shadow-glow">
          <span className="mb-0.5 block font-semibold capitalize text-ink">{key}</span>
          {def}
        </span>
      )}
    </span>
  );
}
