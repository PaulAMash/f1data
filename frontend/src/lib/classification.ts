/* -------------------------------------------------------------------------- */
/* ONE PRESENTATION STANDARD FOR A CLASSIFICATION.                            */
/*                                                                            */
/* The product draws a results table in two places — the Race Explorer's Final */
/* classification and the Historical Explorer's session results — and they had */
/* drifted into two different tables of the same thing:                        */
/*                                                                            */
/*   * one printed the literal word "DNF" in the POSITION column when a row    */
/*     had no position; the other printed an em dash. Both then repeated the   */
/*     status again in the badge beside the driver and a third time in the     */
/*     Status column. A position column that sometimes contains a status is    */
/*     not a position column.                                                  */
/*   * one showed "—" in Grid→Finish for every retirement, which threw away    */
/*     the classified position the FIA had actually awarded; the other showed  */
/*     it. So the same car read as P18 in one table and as nothing in the      */
/*     other.                                                                  */
/*   * neither sorted, so the row order was whatever the source happened to    */
/*     return, and a classified finisher could appear in the middle of a run   */
/*     of retirements for no reason a reader could see.                        */
/*                                                                            */
/* The rules, and they are the FIA's rather than ours:                         */
/*                                                                            */
/*   ORDER IS CLASSIFIED POSITION. A car that retires having completed 90% of  */
/*   the distance is still CLASSIFIED, and it is classified in the order it    */
/*   completed — so a retirement legitimately sits above a car that finished   */
/*   further back. What is not legitimate is an unsorted table, so anything    */
/*   with a position comes first in position order and anything without comes  */
/*   last, in the order the source gave.                                       */
/*                                                                            */
/*   THE POSITION COLUMN HOLDS A POSITION. When the source awarded one it is   */
/*   shown, retired or not. When it did not, the row reads "NC" — not          */
/*   classified — which is the sport's own word for it and is a fact about the */
/*   RESULT. "DNF" is a fact about the CAR, it is already carried by the badge */
/*   beside the driver and by the time column, and it does not need a third    */
/*   place to live.                                                            */
/*                                                                            */
/*   A RETIREMENT RECEDES. Dimmed, in both tables, because a car that did not  */
/*   finish is not a result at the same level as one that did — which is how a */
/*   timing screen has always said so.                                         */
/* -------------------------------------------------------------------------- */

/** The shape both tables share. Deliberately structural: the Historical
    Explorer's rows come from a different endpoint with different field names,
    and adapting two rows to one interface is cheaper than two tables. */
export interface Classified {
  position?: number | null;
  /** True when the car did not reach the flag, whatever the source calls it. */
  retired?: boolean;
}

/** Did this car reach the end? Written once, because "not finished" is spelled
    a dozen ways across three sources — "Retired", "Accident", "+2 Laps",
    "Finished", "" — and only one of those patterns is a finish. */
export function didNotFinish(status?: string | null, retired?: boolean | null): boolean {
  if (retired != null) return !!retired;
  const s = (status ?? "").trim();
  if (!s) return false;
  return !/^(finished|classified)$/i.test(s) && !/^\+\d+\s*lap/i.test(s);
}

/**
 * The finishing order, as it should be read.
 *
 * Stable: rows without a position keep the source's own order rather than being
 * shuffled by a comparator that has nothing to compare.
 */
export function inFinishingOrder<T extends Classified>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const pa = a.row.position ?? null, pb = b.row.position ?? null;
      if (pa == null && pb == null) return a.i - b.i;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb || a.i - b.i;
    })
    .map((x) => x.row);
}

/** What goes in the position column. Never a status. */
export function positionLabel(position?: number | null): string {
  return position == null ? "NC" : String(position);
}

/** A tooltip for the one label a reader might not know. */
export const NOT_CLASSIFIED_HINT =
  "Not classified — this car did not complete enough of the race distance to be given a finishing position.";
