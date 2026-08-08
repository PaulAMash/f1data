"use client";
import { Gavel, Timer, ArrowRightLeft, OctagonX, Flag, Ban, FileWarning } from "lucide-react";
import { PENALTY_META, type Penalty, type PenaltyKind } from "@/lib/penalties";
import { HoverCard } from "./HoverCard";
import { useHoverTip } from "@/lib/useHoverTip";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One penalty identity for the whole app: a compact badge beside the driver,  */
/* hover/tap for the official wording. Red = affects the result or the next    */
/* grid; amber = session events (deleted laps, investigations).                */
/*                                                                            */
/* THROUGH THE PORTAL, LIKE EVERY OTHER TOOLTIP IN THE PRODUCT. This was the   */
/* last hover card in the codebase still drawn as an absolutely-positioned     */
/* span inside its own row — which works until an ancestor has `overflow:      */
/* hidden`, and a results table has several. It vanished entirely in the Final */
/* Classification and clipped to a coloured stub elsewhere, which is the       */
/* "strange purple halo": the bottom edge of a card whose body had been sliced */
/* off. Rendered at fixed viewport coordinates, no ancestor can crop it.       */
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

const ACCENT: Record<string, string> = {
  penalty: "rgb(167 139 250)", ended: "rgb(251 113 133)",
  amber: "rgb(var(--amber))", neutral: "rgb(var(--ink-faint))",
};

/* One gavel on every badge meant the icon carried no information — it said
   "steward" on a row where the colour already said steward, and the reader had
   to parse the text to learn which penalty this was. A mark per kind lets the
   badge be recognised before it is read, which is the whole point of a badge on
   a dense results table. */
const ICON: Record<PenaltyKind, typeof Gavel> = {
  grid: Flag,
  time: Timer,
  drive_through: ArrowRightLeft,
  stop_go: OctagonX,
  disqualified: Ban,
  deleted_lap: FileWarning,
  investigation: FileWarning,
  reprimand: Gavel,
};

/** Anchor a card to the top edge of whatever was hovered. */
const anchor = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top - 2 };
};

export function PenaltyBadge({ penalty }: { penalty: Penalty }) {
  const { at, open, close, toggle } = useHoverTip<{ x: number; y: number }>();
  const meta = PENALTY_META[penalty.kind];
  const Icon = ICON[penalty.kind] ?? Gavel;
  return (
    <span className="relative inline-flex"
      onMouseEnter={(e) => open(anchor(e.currentTarget))} onMouseLeave={close}>
      {/* `tabular-nums` so "+5s" and "+10s" occupy the same width and a column
          of penalties stays a column. `leading-none` + a matched icon box keeps
          the pill the same height whatever glyph it holds. */}
      <button type="button" onClick={(e) => { e.stopPropagation(); toggle(anchor(e.currentTarget)); }}
        aria-expanded={at != null}
        aria-label={`${meta.title}: ${penalty.detail}`}
        className={cx("inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] tabular-nums transition-colors", TONE[meta.tone])}>
        <Icon size={10} className="shrink-0 opacity-80" /> {penalty.label}
      </button>
      {at && (
        <HoverCard x={at.x} y={at.y} width={248} title={meta.title} accent={ACCENT[meta.tone]}>
          <p className="whitespace-normal text-left text-[12px] leading-relaxed text-ink-muted">
            {penalty.detail}
          </p>
        </HoverCard>
      )}
    </span>
  );
}

/** All of a driver's penalty badges in a row (deduped by label). */
export function PenaltyBadges({ penalties }: { penalties?: Penalty[] }) {
  if (!penalties?.length) return null;
  const seen = new Set<string>();
  const unique = penalties.filter((p) => !seen.has(p.label) && seen.add(p.label));
  /* `flex-nowrap`: two penalties on one driver used to wrap onto a second line,
     which made that row taller than every other and broke the column the rest
     were aligned in. They sit on one track and the track can shrink. */
  return (
    <span className="inline-flex shrink items-center gap-1">
      {unique.map((p, i) => <PenaltyBadge key={i} penalty={p} />)}
    </span>
  );
}
