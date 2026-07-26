"use client";
import { useState } from "react";
import { Gavel } from "lucide-react";
import { PENALTY_META, type Penalty } from "@/lib/penalties";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One penalty identity for the whole app: a compact badge beside the driver,  */
/* hover/tap for the official wording. Red = affects the result or the next    */
/* grid; amber = session events (deleted laps, investigations).                */
/* -------------------------------------------------------------------------- */

/* Status colour identity, kept distinct across the whole app:
     rose   = the car stopped (DNF / DSQ — an ending)
     violet = a steward penalty (grid drop, time penalty, drive-through)
     amber  = a session note (deleted lap, investigation)
   DNF and penalties previously shared rose and were hard to tell apart. */
const TONE: Record<string, string> = {
  penalty: "border-violet-400/45 bg-violet-400/12 text-violet-300",
  ended: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  amber: "border-amber/40 bg-amber/10 text-amber",
  neutral: "border-white/15 bg-white/[0.05] text-ink-muted",
};

export function PenaltyBadge({ penalty }: { penalty: Penalty }) {
  const [open, setOpen] = useState(false);
  const meta = PENALTY_META[penalty.kind];
  return (
    <span className="relative inline-flex"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={`${meta.title}: ${penalty.detail}`}
        className={cx("inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide", TONE[meta.tone])}>
        <Gavel size={10} /> {penalty.label}
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[16rem] -translate-x-1/2 rounded-lg border border-white/10 bg-base-900 px-2.5 py-1.5 text-left text-xs shadow-glow">
          <span className="block font-semibold text-ink">{meta.title}</span>
          <span className="mt-0.5 block leading-snug text-ink-muted">{penalty.detail}</span>
        </span>
      )}
    </span>
  );
}

/** All of a driver's penalty badges in a row (deduped by label). */
export function PenaltyBadges({ penalties }: { penalties?: Penalty[] }) {
  if (!penalties?.length) return null;
  const seen = new Set<string>();
  const unique = penalties.filter((p) => !seen.has(p.label) && seen.add(p.label));
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {unique.map((p, i) => <PenaltyBadge key={i} penalty={p} />)}
    </span>
  );
}
