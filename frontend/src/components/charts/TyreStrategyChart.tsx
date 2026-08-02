"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RaceSession, Stint, UndercutEvent, Driver } from "@/lib/types";
import {
  COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_MISSING_HINT, COMPOUND_SHORT, compoundKnown,
} from "@/lib/compounds";
import { EVENT, MOMENT, deriveWindows, undercutStory, type Win } from "@/lib/raceEvents";
import { cx, fmtLap } from "@/lib/format";
import { FocusCardShell, type FocusTile } from "./FocusCardShell";

/* -------------------------------------------------------------------------- */
/* Neutralisations, on a chart made of opaque bars.                            */
/*                                                                            */
/* The safety-car band used to be a tint painted BEHIND the stint bars, which  */
/* is the same as not painting it: twenty rows of full-saturation yellow, red  */
/* and white cover the plot almost edge to edge, so the only place the tint    */
/* ever showed was the 4px gaps between rows. The obvious fix — move the tint  */
/* in front — is worse, because it recolours every compound it crosses, and    */
/* compound colour is the one thing this chart exists to encode.               */
/*                                                                            */
/* So the neutralisation is stated in three registers instead of one:          */
/*                                                                            */
/*   THE RAIL   a track-state strip above the plot, on the same lap scale.     */
/*              Green where the race is racing, a solid SC/VSC/RED capsule     */
/*              where it isn't. This is the part you can read from across the  */
/*              room, and it costs the plot nothing because it isn't in it.    */
/*   THE HATCH  diagonal stripes over the bars, in the event's colour. Stripes */
/*              have gaps, so the compound underneath still reads — the same   */
/*              trick the "tyre not recorded" bars already use, which means    */
/*              the reader has met this texture before.                        */
/*   THE EDGES  a hard rule at the first and last lap of the window, above     */
/*              everything, so "when exactly" is answerable to the lap.        */
/*                                                                            */
/* Hovering a capsule raises the hatch, lights both edges and says what the    */
/* window did to the race — including how many cars took a cheap stop in it,   */
/* which is the only reason a tyre chart draws safety cars at all.             */
/* -------------------------------------------------------------------------- */

export function TyreStrategyChart({
  session, undercuts = [], highlight = [], onSelect,
}: {
  session: RaceSession; undercuts?: UndercutEvent[]; highlight?: string[];
  onSelect?: (codes: string[]) => void;
}) {
  const total = session.total_laps;
  const [tip, setTip] = useState<{ s: Stint; name: string; x: number; y: number } | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const [winTip, setWinTip] = useState<{ w: Win; stops: number; x: number; y: number } | null>(null);
  const [ucTip, setUcTip] = useState<{ u: UndercutEvent; x: number; y: number } | null>(null);

  const order = useMemo(() => [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)), [session]);
  const stintsByDriver = useMemo(() => {
    const m = new Map<string, Stint[]>();
    for (const s of session.stints) { if (!m.has(s.driver)) m.set(s.driver, []); m.get(s.driver)!.push(s); }
    for (const arr of m.values()) arr.sort((a, b) => a.stint - b.stint);
    return m;
  }, [session]);
  const windows = useMemo(() => deriveWindows(session), [session]);
  const driverByCode = useMemo(() => Object.fromEntries(session.drivers.map((d) => [d.code, d])) as Record<string, Driver>, [session.drivers]);

  // every undercut, not just the first — a driver who attacked twice used to
  // get one marker and the second move simply vanished from the chart
  const ucByDriver = useMemo(() => {
    const m = new Map<string, UndercutEvent[]>();
    for (const u of undercuts) {
      if (!m.has(u.attacker)) m.set(u.attacker, []);
      m.get(u.attacker)!.push(u);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.pit_lap - b.pit_lap);
    return m;
  }, [undercuts]);

  const nameOf = useCallback((code: string) => driverByCode[code]?.name ?? code, [driverByCode]);
  const finishPos = useCallback(
    (code: string) => session.classification.find((c) => c.driver === code)?.position ?? null,
    [session.classification],
  );
  // how many cars took the cheap stop — the reason a neutralisation belongs on
  // a tyre chart in the first place
  const stopsIn = useCallback(
    (w: Win) => session.pit_stops.filter((p) => p.lap >= w.start && p.lap <= w.end).length,
    [session.pit_stops],
  );

  const axisTicks = tickLaps(total);
  const focusCode = highlight.length === 1 ? highlight[0] : null;
  const focusable = !!onSelect;
  const pick = (code: string) => onSelect?.(highlight.includes(code) ? [] : [code]);

  return (
    <div className="space-y-4">
      {focusCode && driverByCode[focusCode] && (
        <TyreFocusCard driver={driverByCode[focusCode]} stints={stintsByDriver.get(focusCode) ?? []}
          row={session.classification.find((c) => c.driver === focusCode)} onClear={() => onSelect?.([])} />
      )}

      <div className="relative">
        <div className="mb-1 flex pl-14 pr-2">
          <div className="relative h-4 flex-1">
            {axisTicks.map((l) => (
              <span key={l} className="absolute -translate-x-1/2 text-[11px] tabular-nums text-ink-faint" style={{ left: `${(l / total) * 100}%` }}>{l}</span>
            ))}
          </div>
        </div>

        <TrackStateRail windows={windows} total={total} hot={hot}
          onEnter={(i, w, x, y) => { setHot(i); setWinTip({ w, stops: stopsIn(w), x, y }); }}
          onLeave={() => { setHot(null); setWinTip(null); }} />

        <div className="relative">
          {/* soft wash, behind the bars — it only shows in the gaps between rows,
              which is exactly what it is for: continuity down the column */}
          <div className="pointer-events-none absolute inset-0 left-14 right-2">
            {windows.map((w, i) => (
              <div key={i} className="absolute top-0 bottom-0 rounded-sm"
                style={{ ...spanOf(w, total), background: `${EVENT[w.kind].color}1f` }} />
            ))}
          </div>

          <div className="space-y-1">
            {order.map((c) => {
              const stints = stintsByDriver.get(c.driver) ?? [];
              const isFocus = highlight.includes(c.driver);
              const dim = highlight.length > 0 && !isFocus;
              const RowTag = focusable ? "button" : "div";
              return (
                <RowTag key={c.driver} {...(focusable ? { onClick: () => pick(c.driver), type: "button" as const } : {})}
                  className={cx("group flex w-full items-center gap-2 rounded-md text-left transition-all",
                    focusable && "cursor-pointer hover:-translate-y-px hover:bg-white/[0.04] hover:ring-1 hover:ring-white/12",
                    dim && "opacity-30", isFocus && "bg-white/[0.05] ring-1 ring-white/15")}
                  style={isFocus ? { boxShadow: `inset 3px 0 0 0 ${c.team_color}` } : undefined}>
                  <div className="flex w-12 shrink-0 items-center gap-1.5 pl-1">
                    <span className="h-2 w-2 rounded-full transition-transform duration-200 group-hover:scale-125"
                      style={{ background: c.team_color }} />
                    <span className={cx("text-xs font-semibold transition-colors", isFocus ? "text-ink" : focusable ? "text-ink-muted group-hover:text-ink" : "")}>{c.driver}</span>
                  </div>
                  <div className="relative h-6 flex-1">
                    {stints.map((s) => {
                      const left = ((s.start_lap - 1) / total) * 100, width = (s.laps / total) * 100;
                      const named = compoundKnown(s.compound);
                      const track = (e: React.MouseEvent) =>
                        setTip({ s, name: c.name ?? c.driver, x: e.clientX, y: e.clientY });
                      return (
                        <div key={s.stint}
                          onMouseEnter={track} onMouseMove={track} onMouseLeave={() => setTip(null)}
                          className={cx("absolute top-0 flex h-6 items-center justify-center overflow-hidden rounded-[3px] text-[11px] font-bold ring-1 ring-black/20",
                            "transition-transform duration-200 hover:z-10 hover:scale-y-[1.14]",
                            // a stint whose tyre was never published is drawn as a
                            // hatched placeholder rather than a solid grey block —
                            // it looks like the gap in the data that it is
                            !named && "tyre-unrecorded")}
                          style={{
                            left: `${left}%`, width: `${width}%`,
                            background: COMPOUND_COLOR[s.compound],
                            color: named ? "#0b0e16" : "rgb(var(--ink))",
                          }}>
                          {width > 5 ? `${COMPOUND_SHORT[s.compound]}${s.laps}` : ""}
                        </div>
                      );
                    })}
                    {(ucByDriver.get(c.driver) ?? []).map((u, i) => (
                      <UndercutMark key={i} u={u} total={total}
                        label={`${nameOf(u.attacker)} ${u.kind === "overcut" ? "overcut" : "undercut"} ${nameOf(u.victim)} on lap ${u.pit_lap}`}
                        onEnter={(x, y) => setUcTip({ u, x, y })} onLeave={() => setUcTip(null)} />
                    ))}
                  </div>
                  {/* the row teaches itself: an explicit affordance appears on hover */}
                  {focusable && !isFocus && (
                    <span className="mr-1 shrink-0 whitespace-nowrap text-[11px] font-semibold text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
                      Focus →
                    </span>
                  )}
                </RowTag>
              );
            })}
          </div>

          {/* hatch and edges, over the bars — see the note at the top of the file */}
          <div className="pointer-events-none absolute inset-0 left-14 right-2 z-20">
            {windows.map((w, i) => (
              <div key={i} className={cx("neut-band", hot === i && "is-hot")}
                style={{ ...spanOf(w, total), ["--nc" as string]: EVENT[w.kind].color } as React.CSSProperties} />
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2 pl-14 text-[11.5px] text-ink-muted">
          {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COMPOUND_COLOR[c] }} /> {COMPOUND_LABEL[c]}</span>
          ))}
          {/* only offered when the session actually contains one */}
          {session.stints.some((s) => !compoundKnown(s.compound)) && (
            <span className="inline-flex items-center gap-1.5" title={COMPOUND_MISSING_HINT}>
              <span className="tyre-unrecorded h-2.5 w-2.5 rounded-sm" style={{ background: COMPOUND_COLOR.UNKNOWN }} />
              {COMPOUND_LABEL.UNKNOWN}
            </span>
          )}
          {undercuts.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <LegendMark color={MOMENT.gain.color} /> Undercut worked
              </span>
              {undercuts.some((u) => !u.gained) && (
                <span className="inline-flex items-center gap-1.5">
                  <LegendMark color={MOMENT.loss.color} /> Undercut failed
                </span>
              )}
            </>
          )}
          {Array.from(new Set(windows.map((w) => w.kind))).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-[2px]" style={{ background: EVENT[k].color }} /> {EVENT[k].label}
            </span>
          ))}
        </div>

        {tip && <StintTooltip {...tip} />}
        {winTip && <WindowTooltip {...winTip} />}
        {ucTip && <UndercutTooltip u={ucTip.u} x={ucTip.x} y={ucTip.y} nameOf={nameOf} finishPos={finishPos} />}
      </div>
    </div>
  );
}

/** left/width of a lap window as percentages of the plot. */
function spanOf(w: Win, total: number) {
  return {
    left: `${((w.start - 1) / total) * 100}%`,
    width: `${((w.end - w.start + 1) / total) * 100}%`,
  };
}

/* -------------------------------------------------------------------------- */
/* The track-state rail.                                                       */
/*                                                                            */
/* One strip, the full race, on the plot's own lap scale: green where the race */
/* was racing, a capsule where it wasn't. It is the only part of the chart      */
/* that can afford to be loud, because it holds no other information.          */
/*                                                                            */
/* The capsule labels itself when there is room for the label — and "room" is  */
/* measured in pixels, not laps, because four laps of a 71-lap race is 30px on */
/* a laptop and 9px on a phone, and a code clipped to "S" is worse than none.  */
/* -------------------------------------------------------------------------- */
function TrackStateRail({ windows, total, hot, onEnter, onLeave }: {
  windows: Win[]; total: number; hot: number | null;
  onEnter: (i: number, w: Win, x: number, y: number) => void; onLeave: () => void;
}) {
  const rail = useRef<HTMLDivElement | null>(null);
  const [railW, setRailW] = useState(0);
  useLayoutEffect(() => {
    const el = rail.current;
    if (!el) return;
    const measure = () => setRailW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (windows.length === 0) return null;

  return (
    <div className="mb-1.5 flex items-center pr-2">
      <span className="w-14 shrink-0 pr-2 text-right text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-faint">
        Track
      </span>
      <div ref={rail} className="neut-rail relative h-[17px] flex-1">
        {windows.map((w, i) => {
          const laps = w.end - w.start + 1;
          const px = (laps / total) * railW;
          return (
            <span key={i} role="img" tabIndex={0}
              aria-label={`${EVENT[w.kind].label}, laps ${w.start} to ${w.end}`}
              className={cx("neut-chip", hot === i && "is-hot")}
              style={{ ...spanOf(w, total), ["--nc" as string]: EVENT[w.kind].color } as React.CSSProperties}
              onMouseEnter={(e) => onEnter(i, w, e.clientX, e.clientY)}
              onMouseMove={(e) => onEnter(i, w, e.clientX, e.clientY)}
              onMouseLeave={onLeave}
              onFocus={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onEnter(i, w, r.left + r.width / 2, r.bottom);
              }}
              onBlur={onLeave}>
              {px >= 92 ? `${EVENT[w.kind].code} · L${w.start}–${w.end}` : px >= 26 ? EVENT[w.kind].code : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The undercut mark.                                                          */
/*                                                                            */
/* It was an 11px "▲" in a text node with a `title`, which is to say it was    */
/* invisible on a wall of yellow and, when found, answered only "undercut       */
/* attempt". Now it is a stemmed marker on the exact lap of the stop, coloured */
/* by whether the move actually worked, and hovering it teaches the mechanism  */
/* AND what it was worth in THIS race. A chart that can explain itself is worth */
/* more than one that can only be read by someone who already knows.           */
/*                                                                            */
/* It is a span, not a button: the row it lives in is already a button, and a  */
/* button inside a button is invalid markup React will refuse to hydrate.      */
/* -------------------------------------------------------------------------- */
function UndercutMark({ u, total, label, onEnter, onLeave }: {
  u: UndercutEvent; total: number; label: string;
  onEnter: (x: number, y: number) => void; onLeave: () => void;
}) {
  const c = u.gained ? MOMENT.gain.color : MOMENT.loss.color;
  return (
    <span role="img" tabIndex={0} aria-label={label}
      className="tyre-uc" style={{ left: `${(u.pit_lap / total) * 100}%`, ["--uc" as string]: c } as React.CSSProperties}
      onMouseEnter={(e) => onEnter(e.clientX, e.clientY)}
      onMouseMove={(e) => onEnter(e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); onEnter(r.left + r.width / 2, r.bottom); }}
      onBlur={onLeave}>
      {/* stroked in the panel colour so the head cuts itself out of whatever
          compound it lands on — white, yellow and red all sit under it. The
          stroke is painted UNDER the fill, so it reads as a halo around a solid
          marker rather than eating half of a 12px triangle. */}
      <svg className="tyre-uc-head" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
        <path d="M2 1.8 H16 L9 10.4 Z" fill={c} stroke="rgb(var(--base-900))" strokeWidth="2.4"
          strokeLinejoin="round" style={{ paintOrder: "stroke" }} />
      </svg>
      <span className="tyre-uc-stem" />
    </span>
  );
}

function LegendMark({ color }: { color: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 18 12" aria-hidden="true">
      <path d="M2 1.8 H16 L9 10.4 Z" fill={color} stroke="rgb(var(--base-900))" strokeWidth="2.4"
        strokeLinejoin="round" style={{ paintOrder: "stroke" }} />
    </svg>
  );
}

function TyreFocusCard({ driver, stints, row, onClear }: {
  driver: Driver; stints: Stint[]; row?: RaceSession["classification"][number]; onClear: () => void;
}) {
  const ordered = [...stints].sort((a, b) => a.stint - b.stint);
  const stops = row?.pit_stops ?? Math.max(0, ordered.length - 1);
  const longest = ordered.reduce((mx, s) => Math.max(mx, s.laps), 0);
  const seq = ordered.map((s) => compoundKnown(s.compound) ? COMPOUND_LABEL[s.compound] : "?").join(" → ");
  // a stint with no published tyre isn't a compound the driver used, so it must
  // not inflate "how many different tyres did they run?"
  const named = ordered.filter((s) => compoundKnown(s.compound));
  const tiles: FocusTile[] = [
    { label: "Pit stops", value: String(stops) },
    { label: "Stints", value: String(ordered.length) },
    { label: "Longest stint", value: longest ? `${longest}L` : "—" },
    { label: "Compounds", value: named.length ? String(new Set(named.map((s) => s.compound)).size) : "—" },
  ];
  return (
    <FocusCardShell driver={driver} eyebrow="Focused strategy" tiles={tiles}
      takeaway={ordered.length ? `${stops === 0 ? "No-stopper" : `${stops}-stop`} · ${seq}` : undefined} onClear={onClear}>
      {ordered.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Compound progression · stint length</div>
          <div className="flex gap-1">
            {ordered.map((s, i) => (
              <div key={i} className="min-w-0 rounded-md px-2 py-1.5 text-center"
                style={{ flexGrow: s.laps, background: `${COMPOUND_COLOR[s.compound]}22`, boxShadow: `inset 0 -2px 0 0 ${COMPOUND_COLOR[s.compound]}` }}
                title={compoundKnown(s.compound)
                  ? `${COMPOUND_LABEL[s.compound]} · laps ${s.start_lap}-${s.end_lap}`
                  : `${COMPOUND_MISSING_HINT} Laps ${s.start_lap}-${s.end_lap}.`}>
                <div className="truncate text-[11px] font-bold" style={{ color: COMPOUND_COLOR[s.compound] }}>
                  {COMPOUND_LABEL[s.compound]}
                </div>
                <div className="text-[11px] tabular-nums text-ink-muted">{s.laps}L · {s.start_lap}-{s.end_lap}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </FocusCardShell>
  );
}

/**
 * The floating card every hover on this chart uses.
 *
 * It used to be `bg-base-900/97` + `backdrop-blur`, which is the frosted-glass
 * treatment the rest of the product uses — and everywhere else it works,
 * because everywhere else it floats over a dimmed plot. Here it floats over a
 * wall of full-saturation yellow, red and white tyre bars, and 3% of that is
 * enough to muddy every line of text on it.
 *
 * So: fully opaque, no blur, and a coloured top edge instead. The card still
 * belongs to the same family — same radius, same shadow, same type scale — it
 * just stops asking the background for permission to be legible.
 */
function Float({ x, y, accent, width = 248, children }: {
  x: number; y: number; accent: string; width?: number; children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ h: 0, vw: 0, vh: 0 });
  /* The card used to be placed against a HARD-CODED height, and every card that
     ran longer than the guess hung off the bottom of the window with its last
     paragraph unreachable — which, on the card whose whole job is to explain
     what an undercut is, meant the explanation was the part you couldn't read.
     It measures itself instead. This is a layout effect on purpose: it runs
     after the DOM is written and before the browser paints, so the corrected
     position is the first one anybody sees. */
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const next = { h: node.offsetHeight, vw: window.innerWidth, vh: window.innerHeight };
    setBox((b) => (b.h === next.h && b.vw === next.vw && b.vh === next.vh ? b : next));
    // remeasure when the anchor or the content changes; the equality guard above
    // is what stops the state write from feeding back into another measurement
  }, [x, y, width, children]);
  if (typeof document === "undefined") return null;
  const { h, vw, vh } = box;
  const left = vw ? Math.max(8, Math.min(x + 14, vw - width - 12)) : x + 14;
  // below the cursor by default; above it when below would run off the screen
  const top = h && vh && y + 14 + h > vh - 8 ? Math.max(8, y - 14 - h) : y + 14;
  return createPortal(
    <div ref={el} className="animate-tip-in pointer-events-none fixed z-[130] overflow-hidden rounded-xl border border-white/15 bg-base-900 text-xs shadow-glow"
      style={{ width, left, top }}>
      <span className="block h-[3px] w-full" style={{ background: accent }} />
      {children}
    </div>,
    document.body,
  );
}

function StintTooltip({ s, name, x, y }: { s: Stint; name: string; x: number; y: number }) {
  const named = compoundKnown(s.compound);
  const c = COMPOUND_COLOR[s.compound];
  return (
    <Float x={x} y={y} accent={named ? c : "rgb(var(--tint) / .22)"}>
      <div className="p-3">
        {/* the row this bar belongs to — in a twenty-row chart, "whose stint is
            this?" is the first question the tooltip should answer */}
        <div className="mb-1.5 truncate text-[13px] font-bold text-ink">{name}</div>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {named ? (
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold"
              style={{ background: c, color: "#0b0e16" }}>
              {COMPOUND_LABEL[s.compound]}
            </span>
          ) : (
            <span className="rounded border border-white/20 px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
              Tyre not recorded
            </span>
          )}
          <span className="text-[11.5px] text-ink-faint">
            {named ? `${s.is_new_tyre ? "New set" : "Used set"} · stint ${s.stint}` : `Stint ${s.stint}`}
          </span>
        </div>
        <Row k="Laps" v={`${s.start_lap}–${s.end_lap} (${s.laps})`} />
        <Row k="Avg lap" v={fmtLap(s.avg_lap)} />
        <Row k="Median lap" v={fmtLap(s.median_lap)} />
        <Row k="Best lap" v={fmtLap(s.best_lap)} />
        <Row k="Degradation" v={s.degradation != null ? `${s.degradation >= 0 ? "+" : ""}${s.degradation.toFixed(3)}s/lap` : "—"} />
        {!named && (
          <p className="mt-2 border-t border-white/[0.09] pt-2 text-[11.5px] leading-relaxed text-ink-muted">
            {COMPOUND_MISSING_HINT}
          </p>
        )}
      </div>
    </Float>
  );
}

function WindowTooltip({ w, stops, x, y }: { w: Win; stops: number; x: number; y: number }) {
  const meta = EVENT[w.kind];
  const Icon = meta.icon;
  const laps = w.end - w.start + 1;
  return (
    <Float x={x} y={y} accent={meta.color} width={264}>
      <div className="p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Icon size={13} style={{ color: meta.color }} />
          <span className="text-[13px] font-bold text-ink">{meta.label}</span>
        </div>
        <Row k="Laps" v={`${w.start}–${w.end} (${laps})`} />
        {/* the only fact that explains why a neutralisation is drawn on a tyre
            chart — and it is derived, so it is stated only when it is true */}
        {stops > 0 && <Row k="Stops in window" v={`${stops} car${stops === 1 ? "" : "s"}`} />}
        <p className="mt-2 border-t border-white/[0.09] pt-2 text-[11.5px] leading-relaxed text-ink-muted">
          {w.cause ? `Brought out when ${w.cause}. ` : ""}{meta.blurb}
        </p>
        {stops > 0 && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
            A stop under a neutralisation costs far less than a green-flag stop, because the
            rest of the field is slow too — so the strategy you see either side of this band
            is often a reaction to it.
          </p>
        )}
      </div>
    </Float>
  );
}

/** What the move is, in one sentence, for a reader who has never heard the word. */
const UC_DEFINITION: Record<"undercut" | "overcut", string> = {
  undercut:
    "An undercut is pitting BEFORE the car you are chasing. You lose a little on the "
    + "in-lap, then attack on fresh tyres while they are still out on old ones — and when "
    + "they finally stop, they rejoin behind you.",
  overcut:
    "An overcut is staying out AFTER the car ahead pits. You bank fast laps in clear air "
    + "while they are stuck warming new tyres, then stop later and rejoin in front.",
};

function UndercutTooltip({ u, x, y, nameOf, finishPos }: {
  u: UndercutEvent; x: number; y: number;
  nameOf: (c: string) => string; finishPos: (c: string) => number | null | undefined;
}) {
  const story = undercutStory(u, nameOf, finishPos);
  const cls = MOMENT[story.cls];
  const kind = u.kind === "overcut" ? "overcut" : "undercut";
  return (
    <Float x={x} y={y} accent={cls.color} width={292}>
      <div className="p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: cls.color, color: "#0b0e16" }}>
            {kind}
          </span>
          <span className="text-[11px] font-semibold" style={{ color: cls.color }}>
            {story.worked ? "It worked" : "It didn't work"}
          </span>
        </div>
        <div className="mb-1.5 text-[13px] font-bold leading-snug text-ink">{story.title}</div>
        <p className="text-[11.5px] leading-relaxed text-ink-muted">{story.outcome}</p>
        {/* what happened here, in this race, with this race's lap numbers */}
        <p className="mt-2 border-t border-white/[0.09] pt-2 text-[11.5px] leading-relaxed text-ink-muted">
          {story.detail}
        </p>
        {/* and the general rule, for a reader meeting the word for the first time */}
        <p className="mt-2 rounded-md bg-white/[0.05] p-2 text-[11px] leading-relaxed text-ink-faint">
          <span className="font-semibold text-ink-muted">What is an {kind}? </span>
          {UC_DEFINITION[kind]}
        </p>
      </div>
    </Float>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-[3px] text-[12.5px]">
      <span className="text-ink-muted">{k}</span>
      <span className="font-medium tabular-nums text-ink">{v}</span>
    </div>
  );
}

function tickLaps(total: number): number[] {
  const step = total > 60 ? 10 : total > 30 ? 5 : 2;
  const out: number[] = [];
  for (let l = step; l < total; l += step) out.push(l);
  // the final lap always gets a tick, but a 71-lap race put 70 and 71 on top of
  // each other — drop the regular tick when the flag is right beside it
  if (out.length && total - out[out.length - 1] < step * 0.55) out.pop();
  out.push(total);
  return out;
}
