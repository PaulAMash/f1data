"use client";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* WHAT A DRIVER DID TO THEIR GRID SLOT, AS ONE SHARED COMPONENT.             */
/*                                                                            */
/* This was rendered inline in the results table as `P{grid}→P{position}`      */
/* followed by a separate ▲/▼ token, which produced three different problems   */
/* at once:                                                                   */
/*                                                                            */
/*   * `P14→P14 —` spends three tokens and an arrow saying that nothing        */
/*     happened. The arrow is the loudest glyph in the cell and it is pointing */
/*     at a number identical to the one it came from. A row where nothing      */
/*     happened should be the QUIETEST row in the column, not one of the       */
/*     busiest.                                                               */
/*   * Where something DID happen, the interesting figure — "up eight" — was   */
/*     the smallest, faintest part of the cell, tucked behind the two position */
/*     numbers it was derived from. The evidence was outranking the finding.   */
/*   * Nothing was shared, so every surface that wanted the same idea rebuilt  */
/*     it slightly differently.                                               */
/*                                                                            */
/* The rule here: THE DELTA IS THE STORY, THE TWO POSITIONS ARE THE EVIDENCE.  */
/* A change leads with the signed number, in the colour of its direction, with */
/* the grid→finish pair kept underneath it as small, quiet support. No change  */
/* prints the position once with a neutral hold mark, and nothing else — there */
/* is no story to tell, so the cell says so by getting out of the way.         */
/*                                                                            */
/* Used by the Final Classification and by the gainers/losers lists, so the    */
/* same idea reads identically wherever it appears, in every session type.     */
/* -------------------------------------------------------------------------- */

export type DeltaTone = "up" | "down" | "flat";

export function gridDelta(grid?: number | null, position?: number | null) {
  if (grid == null || position == null) return { tone: "flat" as DeltaTone, net: null };
  const net = grid - position;
  return { tone: (net > 0 ? "up" : net < 0 ? "down" : "flat") as DeltaTone, net };
}

const TONE_TEXT: Record<DeltaTone, string> = {
  up: "text-emerald-300",
  down: "text-rose-300",
  flat: "text-ink-faint",
};

/**
 * `size="sm"` is the results-table density; `md` is for the standalone
 * gainers/losers cards where the delta is the headline of its own row.
 */
export function GridDelta({
  grid, position, size = "sm", className,
}: {
  grid?: number | null; position?: number | null;
  size?: "sm" | "md"; className?: string;
}) {
  // Nothing to compare against: print the position and stop. A car with no
  // recorded grid slot has not "held station", it simply has no start to
  // measure from, and inventing a neutral verdict for it would be a claim.
  if (position == null) return <span className="text-ink-faint">—</span>;
  if (grid == null) {
    return (
      <span className={cx("tabular-nums text-ink-muted", size === "md" && "text-sm", className)}>
        P{position}
      </span>
    );
  }

  const { tone, net } = gridDelta(grid, position);

  // HELD. One number, one hairline. The hairline is what distinguishes "we
  // know they held station" from "we have no idea", which the bare position
  // alone could not say.
  if (tone === "flat" || net === 0) {
    return (
      <span className={cx("inline-flex items-center gap-1.5 tabular-nums", className)}
        title={`Started and finished P${position}`}>
        <span aria-hidden className="h-px w-2.5 rounded bg-white/20" />
        <span className={cx("text-ink-muted", size === "md" && "text-sm")}>P{position}</span>
      </span>
    );
  }

  const up = tone === "up";
  return (
    <span className={cx("inline-flex items-baseline gap-1.5", className)}
      title={`Started P${grid}, finished P${position} — ${Math.abs(net!)} place${Math.abs(net!) === 1 ? "" : "s"} ${up ? "gained" : "lost"}`}>
      <span className={cx("inline-flex items-baseline gap-0.5 font-semibold tabular-nums",
        TONE_TEXT[tone], size === "md" ? "text-sm" : "text-[12.5px]")}>
        <span aria-hidden className="text-[9px] leading-none">{up ? "▲" : "▼"}</span>
        {Math.abs(net!)}
      </span>
      <span className="text-[11px] tabular-nums text-ink-faint">
        P{grid}<span className="px-px opacity-50">→</span>P{position}
      </span>
    </span>
  );
}
