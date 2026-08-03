"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { COMPOUND_COLOR } from "@/lib/compounds";
import { useLivery } from "@/lib/liveryColor";
import { LAYOUTS } from "@/lib/miniTrack";
import { POOL } from "@/lib/raceEngine";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The instruments.                                                            */
/*                                                                            */
/* Seven small panels around the edge of the welcome screen, at about a third  */
/* of full contrast, doing what the instruments in a pit-wall garage do when   */
/* nobody is looking at them: sitting there being current.                     */
/*                                                                            */
/* THE LINE THIS PRODUCT DOES NOT CROSS. A readout that makes a CLAIM has to   */
/* be true. "CONNECTED", "SYNC 100%", "1,149 RACES" are claims about this      */
/* system, so the SYSTEM panel is answered by the real API — it genuinely      */
/* probes on mount, it genuinely counts the archive, and when the fetch fails  */
/* it says OFFLINE rather than inventing a green light. That handshake is also */
/* the most convincing thing on the screen, because it is the only part a      */
/* reader can catch being honest.                                              */
/*                                                                            */
/* Everything else — the trace, the lap clock, the tyre window, the pace       */
/* delta — is ATMOSPHERE, in exactly the category the landing hero has always  */
/* occupied: the shape of a session, not a claim about one. None of it names a */
/* real Grand Prix, a real time or a real driver's result.                     */
/*                                                                            */
/* AND THEY ARE ALL OPTIONAL. Below 1280px they are simply not rendered — an   */
/* instrument you have to squint past is furniture, and the middle of the      */
/* screen is the part that has a job.                                          */
/* -------------------------------------------------------------------------- */

/** A readout that ticks, without a timer per value. One clock, many hands. */
function useTick(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    const id = setInterval(() => setN((k) => k + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

/* -------------------------------------------------------------------------- */

export function Instruments() {
  /* NOT SERVER-RENDERED, ON PURPOSE.
     Every readout here is a value that moves, so the markup the server produces
     is by definition not the markup the client produces one tick later — React
     reported it as a hydration mismatch and it was right to. They are decorative
     and `aria-hidden`, so there is nothing for the server to contribute: the
     subtree simply does not exist until the browser has it, and then it boots.
     `up` is a second frame later so the transition has a state to leave. */
  const [mounted, setMounted] = useState(false);
  const [up, setUp] = useState(false);
  useEffect(() => {
    setMounted(true);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setUp(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!mounted) return null;
  const boot = up;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      <Panel className="left-6 top-[13%]" delay={0}   boot={boot}><TelemetryFeed /></Panel>
      <Panel className="left-6 top-[38%]" delay={90}  boot={boot}><RaceControl /></Panel>
      <Panel className="left-6 top-[62%]" delay={180} boot={boot}><PaceDelta /></Panel>
      <Panel className="right-6 top-[13%]" delay={45}  boot={boot}><SystemStatus /></Panel>
      <Panel className="right-6 top-[41%]" delay={135} boot={boot}><TyreWindow /></Panel>
      <Panel className="right-6 bottom-[10%]" delay={225} boot={boot}><DataCache /></Panel>
      <Panel className="left-6 bottom-[10%]" delay={270} boot={boot}><FieldStrip /></Panel>
    </div>
  );
}

/** The glass. Every panel is the same object; only its contents differ. */
function Panel({ className, delay, boot, children }: {
  className: string; delay: number; boot: boolean; children: React.ReactNode;
}) {
  return (
    <div
      className={cx("wc-inst absolute", className, boot && "is-up")}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="wc-inst-label">{children}</p>;
}

function Val({ k, v, tone }: { k: string; v: string; tone?: "good" | "warn" | "accent" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="wc-inst-k">{k}</span>
      <span className={cx("wc-inst-v", tone && `is-${tone}`)}>{v}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- telemetry */

function TelemetryFeed() {
  const t = useTick(1000);
  const circuit = LAYOUTS[Math.floor(t / 24) % LAYOUTS.length];
  const lap = 8 + (t % 47);
  // a sector time that wanders around a plausible figure without ever settling
  const sector = (27.1 + Math.sin(t * 0.7) * 0.42).toFixed(3);

  /* The viewBox is DERIVED, not guessed. Every layout occupies a different
     part of its 0..1 box, and a fixed viewBox drew Monza as a small bean in the
     middle of a lot of nothing. A cubic never leaves the convex hull of its own
     control points, so their bounding box is a safe frame for the curve — and
     it re-fits itself for free when a layout changes or a new one is added. */
  const { d, box } = useMemo(() => {
    const pts: [number, number][] = [circuit.start];
    let out = `M ${circuit.start[0]} ${circuit.start[1]}`;
    for (const g of circuit.segs) {
      out += ` C ${g[0]} ${g[1]}, ${g[2]} ${g[3]}, ${g[4]} ${g[5]}`;
      pts.push([g[0], g[1]], [g[2], g[3]], [g[4], g[5]]);
    }
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const pad = 0.05;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    const x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
    return { d: out, box: `${x0} ${y0} ${x1 - x0} ${y1 - y0}` };
  }, [circuit]);

  return (
    <div className="w-[200px]">
      <Label>Live telemetry feed</Label>
      <svg viewBox={box} className="mt-2.5 h-[92px] w-full" fill="none" aria-hidden>
        <path d={d} stroke="rgb(var(--tint) / .26)" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={d} stroke="rgb(var(--speed))" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="wc-lap" />
      </svg>
      <div className="mt-1.5 space-y-1">
        <Val k={circuit.name} v={`LAP ${lap}`} />
        <Val k="Sector 2" v={sector} tone="accent" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- race control */

const CONTROL = [
  { s: "GREEN", tone: "good" as const },
  { s: "YELLOW S2", tone: "warn" as const },
  { s: "SAFETY CAR", tone: "warn" as const },
  { s: "GREEN", tone: "good" as const },
  { s: "DRS ENABLED", tone: "good" as const },
];

function RaceControl() {
  const t = useTick(4200);
  const c = CONTROL[t % CONTROL.length];
  const track = (31.4 + Math.sin(t * 0.6) * 1.9).toFixed(1);
  const air = (23.8 + Math.cos(t * 0.4) * 0.9).toFixed(1);
  return (
    <div className="w-[200px]">
      <Label>Race control</Label>
      <div className="mt-2 flex items-center gap-2">
        <span className={cx("wc-led", c.tone === "good" ? "is-good" : "is-warn")} />
        <span className={cx("wc-inst-v text-[11.5px]", c.tone === "good" ? "is-good" : "is-warn")}>
          {c.s}
        </span>
      </div>
      <div className="mt-2.5 space-y-1">
        <Val k="Track" v={`${track}°`} />
        <Val k="Air" v={`${air}°`} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- pace delta */

/* A STRIP CHART RUNS. IT DOES NOT REFRESH.
   This used to rebuild its three traces from a 1.6-second `setInterval`, so
   every one and a half seconds the whole picture jumped to a new shape and then
   sat perfectly still — a poll, drawn. Beside a canvas running at sixty frames
   a second it was the one thing on the screen that looked like a placeholder.

   So the trace is not recomputed at all. Each one is drawn once, twice as wide
   as the window it is seen through, out of sine components whose periods divide
   that window exactly — and then translated by exactly one window width, for
   ever. The wave leaving the left edge is the same wave arriving at the right,
   so the loop is seamless, and because the three run at different speeds over
   different periods the combination does not visibly repeat.

   It also costs nothing: three paths on the compositor, no timer, no React
   render, and it slows with the reader's tempo because the duration is stated
   in `--m` like every other loop in the product. */
const TRACES = [
  // colour,        cycles across the window,  amplitudes,   seconds per window
  { c: "rgb(var(--speed))", k: [2, 5], a: [8.0, 2.6], d: 7.2 },
  { c: "rgb(var(--accent))", k: [3, 7], a: [6.4, 2.1], d: 5.4 },
  { c: "rgb(var(--best))", k: [1, 4], a: [9.2, 3.0], d: 9.6 },
];

/** Two windows wide, sampled fine enough that the curve reads as a curve. */
function wave(k: number[], a: number[]): string {
  const N = 200;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * 200;
    const y = 26
      - a[0] * Math.sin((x / 100) * k[0] * Math.PI * 2)
      - a[1] * Math.sin((x / 100) * k[1] * Math.PI * 2 + 1.3);
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
}

function PaceDelta() {
  const paths = useMemo(() => TRACES.map((t) => wave(t.k, t.a)), []);
  return (
    <div className="w-[200px]">
      <Label>Pace delta · s</Label>
      <svg viewBox="0 0 100 52" className="mt-2 h-[52px] w-full" fill="none" aria-hidden
        preserveAspectRatio="none">
        <line x1="0" y1="26" x2="100" y2="26" stroke="rgb(var(--tint) / .12)" strokeWidth="0.6" />
        {paths.map((d, i) => (
          <path key={i} d={d} stroke={TRACES[i].c} strokeWidth="1.1" opacity={0.62}
            className="wc-run" style={{ ["--d" as string]: `${TRACES[i].d}s` }}
            vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- system status */

type Probe = "acquiring" | "ok" | "offline";

/**
 * The one panel that is allowed to make claims, and therefore the one panel
 * that goes and checks. It reports what actually happened: acquiring while the
 * request is in flight, the real archive figures when it lands, and OFFLINE —
 * not a green light — when it does not.
 */
function SystemStatus() {
  const [state, setState] = useState<Probe>("acquiring");
  const [scale, setScale] = useState<{ races: number; seasons: number; first: number } | null>(null);

  useEffect(() => {
    let alive = true;
    api.archiveScale()
      .then((s) => {
        if (!alive) return;
        setScale({ races: s.races, seasons: s.seasons, first: s.first_season });
        setState("ok");
      })
      .catch(() => { if (alive) setState("offline"); });
    return () => { alive = false; };
  }, []);

  const dots = useTick(520);
  return (
    <div className="w-[196px] text-right">
      <Label>System</Label>
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className={cx("wc-inst-v text-[11.5px]",
          state === "ok" ? "is-good" : state === "offline" ? "is-warn" : "")}>
          {state === "ok" ? "ARCHIVE READY" : state === "offline" ? "OFFLINE" : "ACQUIRING"}
          {state === "acquiring" ? ".".repeat(1 + (dots % 3)) : ""}
        </span>
        <span className={cx("wc-led", state === "ok" ? "is-good" : state === "offline" ? "is-warn" : "is-wait")} />
      </div>
      <div className="mt-2.5 space-y-1">
        <Val k="Races" v={scale ? scale.races.toLocaleString() : "—"} />
        <Val k="Seasons" v={scale ? `${scale.first}–${scale.first + scale.seasons - 1}` : "—"} />
        <Val k="Sources" v="3" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tyre window */

/* The broadcast tyre colours, from the one place that holds them. Hard is very
   nearly white, which is correct on a dark timing screen and invisible on
   paper — `useLivery` is the product's existing answer to exactly that, so the
   welcome screen uses it rather than inventing a second set of hexes. */
const COMPOUND = [
  { n: "SOFT" as const, lo: 0.10, hi: 0.42 },
  { n: "MEDIUM" as const, lo: 0.32, hi: 0.72 },
  { n: "HARD" as const, lo: 0.55, hi: 0.96 },
];

function TyreWindow() {
  const t = useTick(2400);
  const paint = useLivery();
  return (
    <div className="w-[196px] text-right">
      <Label>Tyre window</Label>
      <div className="mt-2 space-y-1.5">
        {COMPOUND.map((c, i) => {
          const shift = Math.sin(t * 0.5 + i) * 0.05;
          const lo = Math.max(0, c.lo + shift), hi = Math.min(1, c.hi + shift);
          return (
            <div key={c.n} className="flex items-center justify-end gap-2">
              <span className="wc-inst-k">{c.n}</span>
              <span className="relative block h-[5px] w-[96px] overflow-hidden rounded-full"
                style={{ background: "rgb(var(--tint) / .09)" }}>
                {/* the transition lasts exactly as long as the tick that feeds
                    it, and is linear, so the window is always drifting and
                    never arrives early and waits */}
                <span className="absolute inset-y-0 rounded-full transition-all duration-[2400ms] ease-linear"
                  style={{
                    left: `${lo * 100}%`, right: `${(1 - hi) * 100}%`,
                    background: paint(COMPOUND_COLOR[c.n]), opacity: 0.8,
                  }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- data cache */

/* Same argument as the pace delta: a stream that redraws on a timer is a poll.
   Each bar carries its own loop, offset by `--i` so the fourteen of them read
   as a level meter rather than as a row of identical things breathing together
   — and the counter beneath keeps its tick, because a packet count is a figure
   that genuinely arrives in whole numbers. */
function DataCache() {
  const t = useTick(900);
  return (
    <div className="w-[196px] text-right">
      <Label>Data stream</Label>
      <div className="mt-2 flex h-[26px] items-end justify-end gap-[3px]">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="wc-bar block h-full w-[4px] rounded-sm"
            style={{ ["--i" as string]: i, background: "rgb(var(--speed))" }} />
        ))}
      </div>
      <div className="mt-2">
        <Val k="Packets" v={`${(1200 + t * 37) % 9000}`} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the field */

function FieldStrip() {
  const t = useTick(2800);
  const codes = useMemo(() => POOL.slice(0, 7).map((d) => d.code), []);
  const leader = t % codes.length;
  return (
    <div className="w-[200px]">
      <Label>Field</Label>
      {/* justify-between rather than a gap: the strip then measures exactly the
          width of the rule above it whatever the field is, instead of wrapping
          one lonely code onto a second line the moment a name gets longer. */}
      <div className="mt-2 flex items-center justify-between">
        {codes.map((c, i) => (
          <span key={c} className={cx("wc-inst-code", i === leader && "is-lead")}>{c}</span>
        ))}
      </div>
    </div>
  );
}
