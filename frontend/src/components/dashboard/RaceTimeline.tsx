"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MousePointerClick } from "lucide-react";
import type { RaceBundle } from "@/lib/types";
import { useIsAdvanced } from "@/lib/mode";
import { fmtLap } from "@/lib/format";

interface Tip { x: number; y: number; title: string; lines: string[] }

// One fixed short code per neutralization type, keyed off the status so the
// same event always renders identically in every session's timeline (the full
// name lives in the hover tooltip). Falls back to the label's initials.
function windowCode(w: { status?: string | null; label?: string | null }): string {
  switch (w.status) {
    case "VSC": return "VSC";
    case "SAFETY_CAR": return "SC";
    case "RED": return "RED";
    case "YELLOW": return "YELLOW";
    default:
      return (w.label ?? "SC").split(" ").map((t) => t[0]).join("").toUpperCase();
  }
}

/**
 * Key moments at a glance: one horizontal lap strip with neutralization
 * windows (VSC / Safety Car), the turning point, and pit stops — the podium's
 * in Simple, the whole points-scoring top 10 in Advanced. Hover anything for
 * the detail; deep analysis lives in the Charts tab.
 */
export function RaceTimeline({ bundle }: { bundle: RaceBundle }) {
  const { session, strategy } = bundle;
  const advanced = useIsAdvanced();
  const [tip, setTip] = useState<Tip | null>(null);
  const total = Math.max(1, session.total_laps);
  // Three reserved vertical bands so nothing can ever cover anything else:
  //   labels (window names) → markers (flags/diamond) → track + ticks.
  // The translucent window pill sits on the track and may be crossed by dots —
  // that's intentional; text and markers never share a band.
  const W = 1000, H = 78, PAD = 18, Y = 46, LABEL_Y = 14;
  const x = (lap: number) => PAD + ((lap - 1) / Math.max(1, total - 1)) * (W - 2 * PAD);

  const maxPos = advanced ? 10 : 3;
  const podium = useMemo(
    () => [...session.classification]
      .filter((c) => c.position && c.position <= maxPos)
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    [session, maxPos],
  );
  const pits = useMemo(
    () => session.pit_stops.filter((p) => podium.some((c) => c.driver === p.driver)),
    [session, podium],
  );
  const tp = strategy.turning_points[0];
  const tpLap = tp?.lap_range?.[0];

  // fastest lap + lead changes: guaranteed content for every race and sprint,
  // even a clean one with no safety cars and no top-10 stops
  const fastest = useMemo(() => {
    let best: { driver: string; lap: number; time: number } | null = null;
    for (const l of session.laps) {
      if (l.lap_time && !l.is_outlier && (!best || l.lap_time < best.time)) {
        best = { driver: l.driver, lap: l.lap, time: l.lap_time };
      }
    }
    return best;
  }, [session]);
  const leadChanges = useMemo(() => {
    const leaders = new Map<number, string>();
    for (const p of session.positions) if (p.position === 1) leaders.set(p.lap, p.driver);
    const laps = [...leaders.keys()].sort((a, b) => a - b);
    const out: { lap: number; to: string; from: string }[] = [];
    for (let i = 1; i < laps.length; i++) {
      const prev = leaders.get(laps[i - 1])!, cur = leaders.get(laps[i])!;
      if (prev !== cur) out.push({ lap: laps[i], to: cur, from: prev });
    }
    return out.slice(0, 8);
  }, [session]);
  const nameOf = (code: string) =>
    session.drivers.find((d) => d.code === code)?.name ?? code;

  const ticks = useMemo(() => {
    const step = total > 50 ? 10 : 5;
    const out: number[] = [];
    for (let l = step; l < total; l += step) {
      if (l / total > 0.06 && l / total < 0.94) out.push(l);
    }
    return out;
  }, [total]);

  // Races and sprints only — qualifying/practice pit entries are runs, not
  // strategy, and used to render as a meaningless wall of dots.
  if (bundle.category !== "race" && bundle.category !== "sprint") return null;
  // render whenever there's anything at all to mark — a clean sprint with no
  // stops or safety cars still gets its fastest lap and lead changes
  if (!session.positions.length && !session.pit_stops.length && !session.laps.length) return null;
  // If any podium car shows an implausible stop count the pit feed is suspect.
  const pitsReliable = session.pit_data_reliable !== false &&
    podium.every((c) => pits.filter((p) => p.driver === c.driver).length <= 5);

  const show = (e: React.MouseEvent, title: string, lines: string[]) =>
    setTip({ x: e.clientX, y: e.clientY, title, lines });

  const windowTip = (w: any) => {
    const inWindow = Array.from(new Set(
      session.pit_stops.filter((p) => p.lap >= w.start_lap && p.lap <= w.end_lap).map((p) => p.driver)));
    return [
      `Laps ${w.start_lap}–${w.end_lap}`,
      ...(w.cause ? [`Brought out when ${w.cause}`] : []),
      inWindow.length
        ? `Pitted cheap in this window: ${inWindow.slice(0, 8).join(", ")}`
        : "No cars pitted in this window",
    ];
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <span className="label">Key moments</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.08] px-2.5 py-1 text-[11px] font-medium text-accent-soft">
            <MousePointerClick size={12} /> Hover the timeline for details
          </span>
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {session.track_status_windows.length > 0 &&
            <span><span className="mr-1.5 inline-block h-2.5 w-4 rounded-[3px] bg-amber/30 ring-1 ring-amber/50 align-middle" />VSC / Safety Car</span>}
          {pitsReliable && pits.length > 0 &&
            <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-ink-muted align-middle" />{advanced ? "Top-10 pit stop" : "Podium pit stop"}</span>}
          {leadChanges.length > 0 &&
            <span><span className="mr-1.5 inline-block h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-emerald-400 align-middle" />Lead change</span>}
          {fastest &&
            <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-violet-400 align-middle" />Fastest lap</span>}
          {tpLap && <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rotate-45 bg-accent-soft align-middle" />Turning point</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Race timeline with safety-car windows and podium pit stops"
        onMouseLeave={() => setTip(null)}>
        <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} stroke="rgba(255,255,255,0.12)" strokeWidth={4} strokeLinecap="round" />

        {/* neutralization windows — label lives in its own top band (LABEL_Y),
            above the marker band, so it can never be covered by or cover the
            flags/diamond. The label text is a fixed short code per status, so
            the SAME event always reads the same across every session (never
            "SC" here and "Safety Car" there), and x is clamped so it never
            clips at the edges. */}
        {session.track_status_windows.map((w, i) => {
          const x1 = x(w.start_lap), x2 = x(w.end_lap);
          const labelX = Math.min(Math.max((x1 + x2) / 2, PAD + 24), W - PAD - 24);
          return (
            <g key={i} className="cursor-help"
              onMouseMove={(e) => show(e, w.label ?? "Neutralization", windowTip(w))}
              onMouseLeave={() => setTip(null)}>
              <rect x={x1} y={Y - 8} width={Math.max(5, x2 - x1)} height={16} rx={8}
                fill="rgba(255,176,32,0.30)" stroke="rgba(255,176,32,0.55)" strokeWidth={1} />
              <text x={labelX} y={LABEL_Y} textAnchor="middle" pointerEvents="none"
                fill="#ffb020" fontSize={11} fontWeight={600}>
                {windowCode(w)}
              </text>
            </g>
          );
        })}

        {/* podium pit stops */}
        {pitsReliable && pits.map((p, i) => {
          const c = podium.find((r) => r.driver === p.driver);
          return (
            <g key={i} className="cursor-help"
              onMouseMove={(e) => show(e, `${c?.name ?? p.driver} — pit stop`,
                [`Lap ${p.lap}`, `Finished P${c?.position}`])}
              onMouseLeave={() => setTip(null)}>
              {/* generous invisible hit area */}
              <circle cx={x(p.lap)} cy={Y} r={11} fill="transparent" />
              <circle cx={x(p.lap)} cy={Y} r={5} pointerEvents="none"
                fill={c?.team_color ?? "#888"} stroke="#0b0e16" strokeWidth={2} />
            </g>
          );
        })}

        {/* lead changes — small green flags above the strip */}
        {leadChanges.map((lc, i) => (
          <g key={`lc${i}`} className="cursor-help"
            onMouseMove={(e) => show(e, "Lead change",
              [`Lap ${lc.lap}: ${nameOf(lc.to)} takes P1 from ${nameOf(lc.from)}`])}
            onMouseLeave={() => setTip(null)}>
            <rect x={x(lc.lap) - 9} y={Y - 24} width={18} height={18} fill="transparent" />
            <polygon pointerEvents="none"
              points={`${x(lc.lap)},${Y - 20} ${x(lc.lap) - 5},${Y - 11} ${x(lc.lap) + 5},${Y - 11}`}
              fill="#34d399" />
          </g>
        ))}

        {/* fastest lap of the race — the violet dot */}
        {fastest && (
          <g className="cursor-help"
            onMouseMove={(e) => show(e, "Fastest lap",
              [`${nameOf(fastest.driver)} — ${fmtLap(fastest.time)}`, `Lap ${fastest.lap}`])}
            onMouseLeave={() => setTip(null)}>
            <circle cx={x(fastest.lap)} cy={Y} r={11} fill="transparent" />
            <circle cx={x(fastest.lap)} cy={Y} r={5} pointerEvents="none"
              fill="#a78bfa" stroke="#0b0e16" strokeWidth={2} />
          </g>
        )}

        {/* turning point — hover for the story; no static label to collide with ticks */}
        {tpLap && (
          <g className="cursor-help"
            onMouseMove={(e) => show(e, "Turning point",
              [tp!.title, ...(tp!.detail ? [tp!.detail] : [])])}
            onMouseLeave={() => setTip(null)}>
            <rect x={x(tpLap) - 10} y={Y - 28} width={20} height={20} fill="transparent" />
            <rect x={x(tpLap) - 5} y={Y - 25} width={10} height={10} rx={2} pointerEvents="none"
              transform={`rotate(45 ${x(tpLap)} ${Y - 20})`} fill="#ff6b6b" />
            <line x1={x(tpLap)} y1={Y - 13} x2={x(tpLap)} y2={Y - 8} pointerEvents="none"
              stroke="rgba(255,107,107,0.8)" strokeWidth={1.5} />
          </g>
        )}

        {/* lap ticks */}
        {ticks.map((l) => (
          <g key={l} pointerEvents="none">
            <line x1={x(l)} y1={Y + 8} x2={x(l)} y2={Y + 12} stroke="rgba(255,255,255,0.18)" />
            <text x={x(l)} y={Y + 24} textAnchor="middle" fill="#5f6b84" fontSize={10}>{l}</text>
          </g>
        ))}
        <text x={PAD} y={Y + 24} textAnchor="start" fill="#5f6b84" fontSize={10}>L1</text>
        <text x={W - PAD} y={Y + 24} textAnchor="end" fill="#5f6b84" fontSize={10}>L{total}</text>
      </svg>

      {tip && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed z-50 w-64 rounded-xl border border-white/10 bg-base-900/95 p-3 text-xs shadow-glow"
          style={{
            left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 272),
            top: Math.min(tip.y + 14, (typeof window !== "undefined" ? window.innerHeight : 9999) - 140),
          }}>
          <div className="mb-1 font-semibold text-ink">{tip.title}</div>
          {tip.lines.map((l, i) => (
            <div key={i} className="leading-relaxed text-ink-muted">{l}</div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
