"use client";
import { useMemo, useState } from "react";
import type { RaceControlEvent, RaceSession } from "@/lib/types";
import { EVENT, deriveWindows, flagKindOf, sessionInterruptions, type Win } from "@/lib/raceEvents";
import { useLivery } from "@/lib/liveryColor";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Race control, as an operations console.                                     */
/*                                                                            */
/* It was a stack of rounded cards: every neutralisation dumped at the top in  */
/* a box, then every message underneath in another box, each one padded like a */
/* notification. Two things were wrong with that, and neither was decoration.  */
/*                                                                            */
/*   IT WAS OUT OF ORDER. Windows first, messages second, so the safety car    */
/*   sat above the green flag that preceded it. A log whose rows are not in    */
/*   time order is not a log.                                                  */
/*   IT WAS UNSCANNABLE. Twenty-four rounded cards of proportional text, no    */
/*   column for the lap, no way to see only the flags. The FIA feed is a       */
/*   fixed-width instrument and reads like one; dressing it as chat throws     */
/*   away the alignment that makes it fast.                                    */
/*                                                                            */
/* So: one chronological feed, a lap column that actually forms a column, a    */
/* three-letter status tag with the broadcast colour, neutralisations inlined  */
/* as banners where they happened, and filters so the reader can drop to just  */
/* the flags. Dense on purpose. The room this belongs to is a pit wall, not an */
/* inbox.                                                                     */
/* -------------------------------------------------------------------------- */

type Row =
  | { t: "msg"; lap: number; e: RaceControlEvent; group: Group }
  | { t: "win"; lap: number; w: Win; stops: number };

type Group = "flag" | "neutral" | "car" | "drs" | "info";

const GROUP_LABEL: Record<Group, string> = {
  flag: "Flags", neutral: "Neutralisations", car: "Cars", drs: "DRS", info: "Notes",
};

/**
 * Three letters and a colour — the tag column, which is what makes it scan.
 *
 * The colours are the broadcast ones, and here they are used as TEXT, which is
 * the case they were never designed for: safety-car amber and VSC yellow are
 * legible as a band across a dark plot and illegible as 9px type on white. They
 * go through the same lightness clamp the liveries do — hue untouched, so a
 * yellow flag is still yellow, just dark enough to read on paper.
 */
function tagOf(e: RaceControlEvent): { code: string; color: string; group: Group; invert?: boolean } {
  const up = (e.message || "").toUpperCase();
  const fl = (e.flag || "").toUpperCase();
  const k = flagKindOf(e.flag);
  if (k === "red") return { code: "RED", color: EVENT.red.color, group: "flag" };
  if (k === "double_yellow") return { code: "2YL", color: EVENT.sc.color, group: "flag" };
  if (k === "yellow") return { code: "YEL", color: EVENT.vsc.color, group: "flag" };
  // the chequered flag has no colour of its own — it is black on white, so it
  // is drawn as the inverse of whichever room the reader is in
  if (k === "chequered") return { code: "CHQ", color: "rgb(var(--ink))", group: "flag", invert: true };
  if (k === "blue") return { code: "BLU", color: "#3aa0ff", group: "flag" };
  if (k === "green") return { code: "GRN", color: "rgb(var(--good))", group: "flag" };
  if (k === "clear") return { code: "CLR", color: "rgb(var(--good))", group: "flag" };
  /* The black-and-white flag is a real signal with a real meaning — a formal
     warning for unsporting driving — and it arrives in the FLAG field, not the
     message, which is why looking only at the message classified it as a note.
     A driver who has been shown one is on a knife edge; the log should say so. */
  if (fl.includes("BLACK AND WHITE") || up.includes("BLACK AND WHITE"))
    return { code: "B/W", color: EVENT.sc.color, group: "flag" };
  if (fl === "BLACK" || up.includes("BLACK FLAG"))
    return { code: "BLK", color: EVENT.red.color, group: "flag" };
  if (/safety/i.test(e.category) || /SAFETY CAR/.test(up))
    return { code: /VIRTUAL/.test(up) ? "VSC" : "SC", color: EVENT.sc.color, group: "neutral" };
  if (/drs/i.test(e.category)) return { code: "DRS", color: "rgb(var(--speed))", group: "drs" };
  if (/car/i.test(e.category)) return { code: "CAR", color: "rgb(var(--best))", group: "car" };
  return { code: "INF", color: "rgb(var(--ink-faint))", group: "info" };
}

export function RaceControlLog({ session }: { session: RaceSession }) {
  const [only, setOnly] = useState<Group | null>(null);
  const paint = useLivery();

  const windows = useMemo(() => deriveWindows(session), [session]);

  /* One feed, in lap order.
     Messages without a lap keep the lap of the message before them — the FIA
     feed is chronological, so "no lap stamped" means "still on that lap", not
     "unknown". Sorting is stable and falls back to issue order, so two
     messages on the same lap stay in the order race control sent them. */
  const rows = useMemo<Row[]>(() => {
    let carried = 0;
    const msgs = session.race_control.map((e, i) => {
      const lap = e.lap ?? carried;
      carried = lap;
      return { t: "msg" as const, lap, e, group: tagOf(e).group, i };
    });
    const wins = windows.map((w) => ({
      t: "win" as const, lap: w.start, w,
      stops: session.pit_stops.filter((p) => p.lap >= w.start && p.lap <= w.end).length,
      i: -0.5, // a banner opens its lap, before the messages issued on it
    }));
    return [...msgs, ...wins]
      .sort((a, b) => a.lap - b.lap || a.i - b.i)
      .map(({ i: _i, ...r }) => r as Row);
  }, [session.race_control, session.pit_stops, windows]);

  const counts = useMemo(() => {
    const c = { flag: 0, neutral: 0, car: 0, drs: 0, info: 0 } as Record<Group, number>;
    for (const r of rows) c[r.t === "win" ? "neutral" : r.group] += 1;
    return c;
  }, [rows]);

  const stats = useMemo(
    () => sessionInterruptions(session.race_control, windows),
    [session.race_control, windows],
  );

  // the last state race control put the track in — the readout a console leads
  // with, and for a finished race it is the chequered flag
  const state = useMemo(() => {
    for (let i = session.race_control.length - 1; i >= 0; i--) {
      const t = tagOf(session.race_control[i]);
      if (t.group === "flag" || t.group === "neutral") return t;
    }
    return { code: "GRN", color: "rgb(var(--good))", group: "flag" as Group };
  }, [session.race_control]);

  const shown = only ? rows.filter((r) => (r.t === "win" ? "neutral" : r.group) === only) : rows;
  const groups = (Object.keys(GROUP_LABEL) as Group[]).filter((g) => counts[g] > 0);

  if (!rows.length) {
    return (
      <div className="rc-console p-4 text-[12.5px] text-ink-faint">
        No race-control messages were published for this session.
      </div>
    );
  }

  return (
    <div className="rc-console">
      {/* ---- the head: what state the track ended in, and what it took ---- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.07] px-3 py-2">
        <span className="rc-led" style={{ ["--led" as string]: paint(state.color) } as React.CSSProperties} />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink">
          Race control
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">
          {session.total_laps} LAPS · {rows.length} ENTRIES
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] tabular-nums text-ink-faint">
          {stats.safetyCars > 0 && <span>SC {stats.safetyCars}</span>}
          {stats.virtualSafetyCars > 0 && <span>VSC {stats.virtualSafetyCars}</span>}
          {stats.stoppages > 0 && <span className="text-accent-soft">RED {stats.stoppages}</span>}
          {stats.localYellows > 0 && <span>YEL {stats.localYellows}</span>}
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: paint(state.color), color: state.invert ? "rgb(var(--base-900))" : "#0b0e16" }}>
            {state.code}
          </span>
        </span>
      </div>

      {/* ---- filters. Only offered when there is something to filter ---- */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-white/[0.055] px-2.5 py-1.5">
          <FilterChip active={only === null} onClick={() => setOnly(null)} label="All" n={rows.length} />
          {groups.map((g) => (
            <FilterChip key={g} active={only === g} onClick={() => setOnly(only === g ? null : g)}
              label={GROUP_LABEL[g]} n={counts[g]} />
          ))}
        </div>
      )}

      {/* ---- the feed ---- */}
      <div className="max-h-[440px] overflow-y-auto">
        {shown.map((r, i) => r.t === "win" ? (
          <div key={i} className="rc-band" style={{ ["--nc" as string]: paint(EVENT[r.w.kind].color) } as React.CSSProperties}>
            <span className="rc-band-code">{EVENT[r.w.kind].code}</span>
            <span className="truncate font-mono text-[11.5px] font-semibold uppercase tracking-wide text-ink">
              {EVENT[r.w.kind].label}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
              L{r.w.start}–{r.w.end}
              {r.stops > 0 && ` · ${r.stops} STOP${r.stops === 1 ? "" : "S"}`}
            </span>
          </div>
        ) : (
          <RcRow key={i} row={r} paint={paint} />
        ))}

        {shown.length === 0 && (
          <p className="px-3 py-4 font-mono text-[11.5px] text-ink-faint">No entries in this filter.</p>
        )}

        {/* the log ends, and says so — a console that just stops leaves the
            reader wondering whether it is still loading */}
        {shown.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">
            <span className="rc-caret" aria-hidden="true" /> End of log
          </div>
        )}
      </div>
    </div>
  );
}

function RcRow({ row, paint }: { row: Extract<Row, { t: "msg" }>; paint: (c: string) => string }) {
  const tag = tagOf(row.e);
  return (
    <div className="rc-row">
      <span className="rc-lap">{row.e.lap != null ? `L${row.e.lap}` : "·"}</span>
      <span className="rc-tag" style={{ ["--tc" as string]: paint(tag.color) } as React.CSSProperties}>{tag.code}</span>
      <span className="rc-msg">{row.e.message}</span>
      {row.e.scope && row.e.scope !== "Track" && (
        <span className="rc-scope">{row.e.scope}</span>
      )}
    </div>
  );
}

function FilterChip({ label, n, active, onClick }: {
  label: string; n: number; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cx("rc-chip", active && "is-on")}>
      {label} <span className="tabular-nums opacity-60">{n}</span>
    </button>
  );
}
