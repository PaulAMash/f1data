"use client";
import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { RaceSession } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_SHORT } from "@/lib/compounds";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtSec } from "@/lib/format";

type Preset = "top5" | "podium" | "all";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "top5", label: "Top 5" },
  { id: "podium", label: "Podium battle" },
  { id: "all", label: "Everyone" },
];

const WINDOW_FILL: Record<string, string> = {
  VSC: "rgba(255,176,32,0.10)",
  SAFETY_CAR: "rgba(255,140,0,0.14)",
  RED: "rgba(255,59,59,0.14)",
  YELLOW: "rgba(255,220,80,0.07)",
};

interface LapInfo {
  position?: number | null; compound: string; tyre_age?: number | null;
  gap?: number | null; pit_in: boolean; pit_out: boolean; status: string;
}

export function PositionChart({
  session, selected, onSelect,
}: {
  session: RaceSession;
  selected: string[];
  onSelect: (codes: string[]) => void;
}) {
  const drivers = session.drivers;
  const finishOrder = useMemo(
    () => [...session.classification].sort(
      (a, b) => (a.position ?? 99) - (b.position ?? 99),
    ),
    [session],
  );

  const simple = useIsSimple();
  const [preset, setPreset] = useState<Preset>("top5");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  // wide-format data + per-(driver,lap) info lookup for the tooltip
  const { data, info } = useMemo(() => {
    const byLap = new Map<number, any>();
    for (let l = 1; l <= session.total_laps; l++) byLap.set(l, { lap: l });
    for (const p of session.positions) {
      const row = byLap.get(p.lap);
      if (row) row[p.driver] = p.position;
    }
    const info = new Map<string, LapInfo>();
    for (const lp of session.laps) {
      info.set(`${lp.driver}:${lp.lap}`, {
        position: lp.position, compound: lp.compound, tyre_age: lp.tyre_age,
        gap: lp.gap_to_leader, pit_in: lp.pit_in, pit_out: lp.pit_out, status: lp.track_status,
      });
    }
    return { data: Array.from(byLap.values()), info };
  }, [session]);

  const teamOrdinal = useMemo(() => {
    const seen: Record<string, number> = {};
    const map: Record<string, number> = {};
    for (const d of drivers) {
      seen[d.team] = (seen[d.team] ?? 0) + 1;
      map[d.code] = seen[d.team];
    }
    return map;
  }, [drivers]);

  // Simple mode swaps the 20-chip toggle cloud for three presets; highlighted
  // drivers are always kept visible. Advanced keeps full per-driver control.
  const visible = useMemo(() => {
    if (!simple) return drivers.filter((d) => !hidden.has(d.code));
    if (preset === "all") return drivers;
    const keep = new Set(
      finishOrder.slice(0, preset === "podium" ? 3 : 5).map((c) => c.driver));
    for (const s of selected) keep.add(s);
    return drivers.filter((d) => keep.has(d.code));
  }, [simple, preset, drivers, hidden, finishOrder, selected]);
  const nSel = selected.length;

  function toggle(code: string) {
    setHidden((h) => {
      const n = new Set(h);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  function onMouseUp() {
    if (dragStart !== null && dragEnd !== null && dragStart !== dragEnd) {
      setZoom([Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd)]);
    }
    setDragStart(null);
    setDragEnd(null);
  }

  const xDomain: [number, number] = zoom ?? [1, session.total_laps];

  // no running order in the data (qualifying/practice, or a source gap) —
  // say so plainly instead of rendering an empty grid
  if (!session.positions.length) {
    return (
      <p className="py-8 text-center text-sm text-ink-faint">
        Position order isn&apos;t tracked in this session (practice and qualifying have no running order).
      </p>
    );
  }

  return (
    <div>
      {/* simple: presets · advanced: per-driver toggles */}
      {simple ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={cx("chip transition-colors",
                preset === p.id ? "border-accent/40 bg-accent/10 text-accent-soft" : "hover:text-ink")}>
              {p.label}
            </button>
          ))}
          <span className="ml-1 hidden text-[11px] text-ink-faint sm:inline">
            Click a line&apos;s label to highlight · drag to zoom
          </span>
          <div className="ml-auto flex items-center gap-2">
            {zoom && <button className="chip hover:text-ink" onClick={() => setZoom(null)}>Reset view</button>}
            {nSel > 0 && <button className="chip hover:text-ink" onClick={() => onSelect([])}>Clear highlight</button>}
          </div>
        </div>
      ) : (
      <div className="mb-3 flex flex-wrap gap-1.5">
        {finishOrder.map((c) => {
          const d = drivers.find((x) => x.code === c.driver)!;
          const off = hidden.has(c.driver);
          const sel = selected.includes(c.driver);
          return (
            <button
              key={c.driver}
              onClick={() => toggle(c.driver)}
              onDoubleClick={() => onSelect(sel ? selected.filter((x) => x !== c.driver) : [...selected, c.driver])}
              onMouseEnter={() => setHover(c.driver)}
              onMouseLeave={() => setHover(null)}
              title="Click to show/hide · double-click to highlight"
              className={cx(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-all",
                off ? "border-white/5 bg-transparent text-ink-faint opacity-50"
                    : "border-white/10 bg-white/[0.03] text-ink",
                sel && "ring-1 ring-accent/50",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: d?.team_color }} />
              {c.driver}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {zoom && (
            <button className="chip hover:text-ink" onClick={() => setZoom(null)}>Reset view</button>
          )}
          {nSel > 0 && (
            <button className="chip hover:text-ink" onClick={() => onSelect([])}>Clear highlight</button>
          )}
        </div>
      </div>
      )}

      <div className="h-[420px] w-full select-none">
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{ top: 8, right: 44, bottom: 6, left: 0 }}
            onMouseDown={(e: any) => e && setDragStart(Number(e.activeLabel))}
            onMouseMove={(e: any) => dragStart !== null && e && setDragEnd(Number(e.activeLabel))}
            onMouseUp={onMouseUp}
          >
            <CartesianGrid strokeDasharray="2 4" />
            {session.track_status_windows.map((w, i) => (
              <ReferenceArea
                key={i} x1={w.start_lap} x2={w.end_lap}
                fill={WINDOW_FILL[w.status] ?? "rgba(255,255,255,0.05)"} stroke="none"
              />
            ))}
            <XAxis
              dataKey="lap" type="number" domain={xDomain} allowDataOverflow
              tick={{ fill: "#5f6b84", fontSize: 11 }} tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              label={{ value: "Lap", position: "insideBottom", offset: -2, fill: "#5f6b84", fontSize: 11 }}
            />
            <YAxis
              type="number" reversed domain={[1, drivers.length]}
              ticks={Array.from({ length: drivers.length }, (_, i) => i + 1)}
              tick={{ fill: "#5f6b84", fontSize: 11 }} tickLine={false}
              width={34} axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              label={{ value: "Position", angle: -90, position: "insideLeft", fill: "#5f6b84", fontSize: 11 }}
            />
            <Tooltip
              isAnimationActive={false}
              content={(p: any) => (
                <PosTooltip active={p.active} label={p.label} info={info} drivers={drivers} hidden={hidden} />
              )}
            />
            {visible.map((d) => {
              const isSel = selected.includes(d.code);
              const isHover = hover === d.code;
              const dim = (nSel > 0 && !isSel) || (hover && !isHover && !isSel);
              return (
                <Line
                  key={d.code} dataKey={d.code} type="monotone"
                  stroke={d.team_color}
                  strokeWidth={isSel || isHover ? 3 : 1.6}
                  strokeOpacity={dim ? 0.16 : 1}
                  strokeDasharray={teamOrdinal[d.code] === 2 ? "5 3" : undefined}
                  dot={false} connectNulls isAnimationActive={false}
                  label={(props: any) =>
                    props.index === data.length - 1 && !dim ? (
                      <text
                        x={props.x + 6} y={props.y} dy={3} fontSize={10} fontWeight={700}
                        fill={d.team_color}
                      >
                        {d.code}
                      </text>
                    ) : <g />
                  }
                />
              );
            })}
            {dragStart !== null && dragEnd !== null && (
              <ReferenceArea x1={dragStart} x2={dragEnd} fill="rgba(255,255,255,0.06)" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {simple
          ? "Drag across the chart to zoom. Shaded bands are VSC / safety-car windows."
          : "Click a driver to show/hide · double-click to highlight · drag across the chart to zoom. Shaded bands are VSC / safety-car windows."}
      </p>
    </div>
  );
}

function PosTooltip({
  active, label, info, drivers, hidden,
}: { active?: boolean; label?: any; info: Map<string, LapInfo>; drivers: any[]; hidden: Set<string> }) {
  if (!active || label == null) return null;
  const lap = Number(label);
  const rows = drivers
    .filter((d) => !hidden.has(d.code))
    .map((d) => ({ d, i: info.get(`${d.code}:${lap}`) }))
    .filter((r) => r.i && r.i.position != null)
    .sort((a, b) => (a.i!.position ?? 99) - (b.i!.position ?? 99))
    .slice(0, 12);
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-base-900/95 p-3 text-xs shadow-glow">
      <div className="mb-1.5 font-semibold text-ink">Lap {lap}</div>
      <div className="space-y-1">
        {rows.map(({ d, i }) => (
          <div key={d.code} className="flex items-center gap-2">
            <span className="w-4 text-right tabular-nums text-ink-faint">P{i!.position}</span>
            <span className="h-2 w-2 rounded-full" style={{ background: d.team_color }} />
            <span className="w-8 font-semibold">{d.code}</span>
            <span
              className="rounded px-1 text-[10px] font-bold"
              style={{ background: COMPOUND_COLOR[i!.compound as keyof typeof COMPOUND_COLOR], color: "#0b0e16" }}
            >
              {COMPOUND_SHORT[i!.compound as keyof typeof COMPOUND_SHORT]}{i!.tyre_age ?? ""}
            </span>
            <span className="tabular-nums text-ink-muted">
              {i!.position === 1 ? "leader" : fmtSec(i!.gap)}
            </span>
            {i!.pit_in && <span className="text-accent-soft">PIT</span>}
            {i!.status !== "GREEN" && <span className="text-amber">{i!.status}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
