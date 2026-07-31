"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The hero field — a race that is actually running.                          */
/*                                                                            */
/* The previous hero was a fixed drawing inside a card: five hand-written      */
/* bezier paths that drew themselves once and then held still forever. It      */
/* looked good for about fifteen seconds, which is exactly as long as it takes */
/* to notice that nothing is ever going to change.                            */
/*                                                                            */
/* This is a small race simulation instead. It keeps a running order, drifts   */
/* it, and every few seconds advances one lap: the whole field flows leftward, */
/* a new column of positions is generated on the right, cars occasionally      */
/* trade places, lap times move, and race-control events appear and expire.    */
/* Leave the page open for five minutes and the order will genuinely be        */
/* different — because it is not a loop, it is a state machine.                */
/*                                                                            */
/* DEPTH OF FIELD. It spans the full width behind the copy, and a single       */
/* backdrop-blurred pane sits between the two, masked so it is opaque behind   */
/* the headline and gone by the right-hand edge. The result is one continuous  */
/* focal falloff — text floating in front of a living visualisation — rather   */
/* than a card with a border around it.                                        */
/* -------------------------------------------------------------------------- */

const LANES = 8;          // cars we draw
const COLS = 15;          // laps visible across the field
const TICK = 3400;        // ms per lap — slow enough to read, quick enough to feel live

interface Car {
  code: string;
  name: string;
  color: string;
  /** position per visible lap, index 0 = oldest (left edge) */
  lane: number[];
  base: number;           // the pace this car tends toward
  lap: string;
}

const GRID: { code: string; name: string; color: string }[] = [
  { code: "NOR", name: "Norris", color: "#ff8000" },
  { code: "VER", name: "Verstappen", color: "#3671c6" },
  { code: "PIA", name: "Piastri", color: "#ff9e3d" },
  { code: "LEC", name: "Leclerc", color: "#e8002d" },
  { code: "RUS", name: "Russell", color: "#27f4d2" },
  { code: "HAM", name: "Hamilton", color: "#8ef7e4" },
  { code: "ANT", name: "Antonelli", color: "#60b2ff" },
  { code: "ALO", name: "Alonso", color: "#229971" },
];

const EVENT_POOL = [
  { label: "DRS DETECTION", tone: "#27f4d2" },
  { label: "DRS ENABLED", tone: "#27f4d2" },
  { label: "SAFETY CAR", tone: "#ffb020" },
  { label: "VIRTUAL SC", tone: "#ffd21e" },
  { label: "YELLOW SECTOR 2", tone: "#ffb020" },
  { label: "FASTEST LAP", tone: "#a78bfa" },
  { label: "PIT WINDOW OPEN", tone: "#60b2ff" },
  { label: "TRACK LIMITS", tone: "#ff6a5a" },
];

interface Marker { id: number; label: string; tone: string; x: number; y: number; born: number; }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lapTime = (base: number) =>
  `1:${String(22 + Math.floor(base)).padStart(2, "0")}.${String(Math.floor(rand(0, 999))).padStart(3, "0")}`;

/**
 * The opening grid — deterministic on purpose.
 *
 * Seeding this with Math.random() meant the server rendered one set of lap
 * times and the client rendered another, which React reports as a hydration
 * mismatch and repairs by throwing the server's markup away. Every value here
 * is a pure function of the car's index, so both renders agree; the simulation
 * introduces all its variation from the first tick onward, which is after
 * hydration and therefore safe.
 */
function seedCars(): Car[] {
  return GRID.map((g, i) => ({
    ...g,
    base: 1.6 + ((i * 7) % 13) * 0.2,
    lap: `1:2${(2 + (i % 5))}.${String(180 + i * 97).slice(0, 3)}`,
    // a plausible opening spread, already varied so the first frame isn't a fan
    lane: Array.from({ length: COLS }, (_, c) => i + Math.sin((c + i) * 0.7) * 0.55),
  }));
}

export function HeroField({ className }: { className?: string }) {
  const [cars, setCars] = useState<Car[]>(seedCars);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const nextId = useRef(1);
  const [live, setLive] = useState(false);

  // don't simulate for a reader who asked for stillness
  const calm = useRef(false);
  useEffect(() => {
    calm.current =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.motion === "calm";
    setLive(!calm.current);
  }, []);

  /* --- the race ---------------------------------------------------------- */
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      setCars((prev) => {
        const next = prev.map((c) => ({ ...c, lane: c.lane.slice(1) }));

        // where each car is heading: its own pace, plus a slow wander
        const order = next.map((c, i) => ({ i, at: c.lane[c.lane.length - 1] }));
        order.sort((a, b) => a.at - b.at);

        // an overtake, sometimes: two adjacent cars trade the position they are
        // converging on. Rare enough to be an event rather than a shuffle.
        if (Math.random() < 0.45 && order.length > 2) {
          const k = Math.floor(rand(0, order.length - 1));
          const tmp = order[k].at; order[k].at = order[k + 1].at; order[k + 1].at = tmp;
        }

        for (const o of order) {
          const c = next[o.i];
          const drift = rand(-0.42, 0.42);
          const target = Math.max(0, Math.min(LANES - 1, o.at + drift));
          c.lane.push(target);
          if (Math.random() < 0.3) c.lap = lapTime(c.base);
        }
        return next;
      });

      // race control: markers are born, live a while, and expire
      setMarkers((prev) => {
        const now = Date.now();
        const alive = prev.filter((m) => now - m.born < 13000);
        if (alive.length < 3 && Math.random() < 0.7) {
          const e = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
          alive.push({
            id: nextId.current++, label: e.label, tone: e.tone,
            x: rand(46, 88), y: rand(14, 82), born: now,
          });
        }
        return alive;
      });
    }, TICK);
    return () => window.clearInterval(id);
  }, [live]);

  /* --- geometry ---------------------------------------------------------- */
  const W = 1600, H = 620;
  const stepX = W / (COLS - 2);
  const laneY = (v: number) => 80 + (v / (LANES - 1)) * (H - 190);

  const paths = useMemo(() => cars.map((c) => ({
    car: c,
    d: smooth(c.lane.map((v, i) => [(i - 1) * stepX, laneY(v)] as [number, number])),
    // the head of the trace is where this car is "now"
    head: [(c.lane.length - 2) * stepX, laneY(c.lane[c.lane.length - 1])] as [number, number],
  })), [cars, stepX]);

  return (
    <div className={cx("hero-field pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden>
      {/* ambient light, drifting on its own long cycle */}
      <span className="hero-glow absolute inset-0" />

      {/* THE FLOW. The group translates one column left over exactly one tick,
          and the data shifts by one column on the same beat — so the race
          streams continuously instead of stepping. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="hf-bloom" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <linearGradient id="hf-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="10%" stopColor="#fff" stopOpacity="1" />
            <stop offset="92%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="hf-edge-mask">
            <rect x="0" y="0" width={W} height={H} fill="url(#hf-edge)" />
          </mask>
        </defs>

        <g mask="url(#hf-edge-mask)">
          <g className={live ? "hf-flow" : undefined}
            style={{ ["--hf-step" as string]: `${stepX}px`, ["--hf-tick" as string]: `${TICK}ms` }}>
            {/* bloom underneath, so the strokes emit rather than sit on the page */}
            <g filter="url(#hf-bloom)" opacity="0.5">
              {paths.map((p) => (
                <path key={`b${p.car.code}`} d={p.d} stroke={p.car.color} strokeWidth={9}
                  fill="none" strokeLinecap="round" />
              ))}
            </g>
            {paths.map((p) => (
              <path key={p.car.code} d={p.d} stroke={p.car.color} strokeWidth={2.6}
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {/* the car itself, at the head of its trace */}
            {paths.map((p) => (
              <g key={`h${p.car.code}`}>
                <circle cx={p.head[0]} cy={p.head[1]} r={11} fill={p.car.color} opacity={0.18} />
                <circle cx={p.head[0]} cy={p.head[1]} r={4} fill={p.car.color} />
              </g>
            ))}
          </g>
        </g>
      </svg>

      {/* driver labels ride at the right-hand edge, where the picture is sharp */}
      <div className="absolute inset-y-0 right-0 hidden w-[26%] flex-col justify-center gap-1.5 pr-[3vw] lg:flex">
        {[...cars]
          .map((c, i) => ({ c, at: c.lane[c.lane.length - 1], i }))
          .sort((a, b) => a.at - b.at)
          .slice(0, 5)
          .map(({ c }, rank) => (
            <div key={c.code}
              className="hf-row flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-base-950/55 px-2.5 py-1.5 backdrop-blur-md">
              <span className="w-4 text-right font-mono text-[10.5px] tabular-nums text-ink-faint">
                {rank + 1}
              </span>
              <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="text-[11.5px] font-bold tracking-wide" style={{ color: c.color }}>
                {c.code}
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-muted">{c.lap}</span>
            </div>
          ))}
      </div>

      {/* race control, appearing and expiring over the sharp side */}
      {markers.map((m) => (
        <span key={m.id} className="hf-marker absolute"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}>
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/[0.10] bg-base-950/70 px-2 py-1 backdrop-blur-md">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.tone }} />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: m.tone }}>
              {m.label}
            </span>
          </span>
        </span>
      ))}

      {/* THE DEPTH OF FIELD. One backdrop-blurred pane between the race and the
          copy, masked so it is solid behind the headline and completely gone by
          the right edge — a focal falloff rather than a panel with an edge. */}
      <span className="hero-dof absolute inset-0" />
    </div>
  );
}

/* Catmull-Rom through the points, converted to cubic beziers. Straight line
   segments between lap positions would read as a bar chart on its side; a real
   position trace curves through its samples. */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
