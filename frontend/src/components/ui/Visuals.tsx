"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { GLOSSARY, Term } from "./Term";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The product's visual vocabulary.                                           */
/*                                                                            */
/* Track Conditions proved the point: a temperature you can SEE lands before a */
/* temperature you have to read. These are the reusable pieces of that idea —  */
/* a meter, a two-sided delta, a tally, a shift, a sparkline — so any panel     */
/* anywhere in the app can show its number instead of describing it, and every  */
/* one of them looks like it came from the same set.                           */
/* -------------------------------------------------------------------------- */

export const TONE_COLOR = {
  accent: "#ff6a5a",
  speed: "#00e0c6",
  amber: "#ffb020",
  good: "#34d399",
  bad: "#fb7185",
  violet: "#c4b5fd",
  sky: "#7dd3fc",
  neutral: "#9aa6be",
} as const;
export type VisualTone = keyof typeof TONE_COLOR;

export const toneText: Record<VisualTone, string> = {
  accent: "text-accent-soft", speed: "text-speed", amber: "text-amber",
  good: "text-emerald-300", bad: "text-rose-300", violet: "text-violet-300",
  sky: "text-sky-300", neutral: "text-ink-muted",
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/* -------------------------------------------------------------------------- */
/* Progressive disclosure, enforced by the system.                            */
/*                                                                            */
/* Every visual carries two kinds of text: the SCALE (what the two ends of the */
/* bar mean — a handful of characters, and without it the graphic is           */
/* decoration) and the EXPLANATION (a sentence of why it matters). The scale   */
/* is always visible. The explanation appears only once the reader asks for it.*/
/*                                                                            */
/* Doing this with a context rather than a prop at every call site means a new */
/* card cannot accidentally ship a wall of text at rest: a Meter dropped into  */
/* a collapsed card hides its own hint without the author thinking about it.   */
/* -------------------------------------------------------------------------- */
export const DisclosureContext = createContext<{ inPanel: boolean; expanded: boolean }>({
  inPanel: false, expanded: true,
});
export const useDisclosure = () => useContext(DisclosureContext);
/** True when explanatory prose should render right now. */
function useShowProse() {
  const { inPanel, expanded } = useDisclosure();
  return !inPanel || expanded;
}

/**
 * Flips true one frame after mount, so a CSS transition has something to animate
 * from. Used by every bar in the product: the fill grows into place, which makes
 * the dashboard feel like it is reading the data rather than reciting it.
 */
export function useGrowIn() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** Width of an element, for visuals that should fill whatever column they land in. */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Micro-learning, applied automatically.
 *
 * Any label that happens to be a Formula 1 term picks up the dotted underline
 * and its definition on hover — so the education is a property of the design
 * system rather than something each call site has to remember. Wrapping is
 * opt-out (`plain`) rather than opt-in, because the failure mode we care about
 * is a jargon term shipping *without* an explanation.
 */
export function Explain({
  children, term, plain = false,
}: { children: React.ReactNode; term?: string; plain?: boolean }) {
  if (plain) return <>{children}</>;
  const key = term ?? (typeof children === "string" ? children : null);
  if (!key || !GLOSSARY[key.toLowerCase()]) return <>{children}</>;
  return <Term term={key}>{children}</Term>;
}

/** The one micro-label used above every visual, so they all read as siblings. */
export function VisualLabel({
  children, term, plain,
}: { children: React.ReactNode; term?: string; plain?: boolean }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
      <Explain term={term} plain={plain}>{children}</Explain>
    </span>
  );
}

/** The endpoints of a bar, so a filled track is a measurement and not a mood. */
function Scale({ min, max }: { min?: React.ReactNode; max?: React.ReactNode }) {
  if (min == null && max == null) return null;
  return (
    <div className="mt-1 flex justify-between text-[11px] leading-none tabular-nums text-ink-faint/80">
      <span>{min}</span><span>{max}</span>
    </div>
  );
}

/**
 * A value on a track. The single most reused shape in the product: temperature,
 * consistency, gap to pole, improvement, humidity — all the same object, so a
 * filled bar always means the same thing wherever you meet it.
 */
export function Meter({
  label, value, pct, tone = "speed", color, hint, className,
  scaleMin, scaleMax, marker, markerLabel, labelTerm, plainLabel,
}: {
  label?: React.ReactNode; value?: React.ReactNode; pct: number;
  tone?: VisualTone; color?: string; hint?: React.ReactNode; className?: string;
  /** What the two ends of the track mean. Without these a bar is decoration. */
  scaleMin?: React.ReactNode; scaleMax?: React.ReactNode;
  /** A reference tick (0–100) — usually the field average, so the fill has a benchmark. */
  marker?: number; markerLabel?: string;
  /** Explicit glossary key when the label reads differently from the term. */
  labelTerm?: string;
  plainLabel?: boolean;
}) {
  const c = color ?? TONE_COLOR[tone];
  const showProse = useShowProse();
  // a bar that grows into place reads as a measurement being taken; one that is
  // simply *there* reads as a static graphic
  const grown = useGrowIn();
  return (
    <div className={cx("min-w-0", className)}>
      {(label || value) && (
        <div className="mb-1 flex items-baseline gap-2">
          {label && <VisualLabel term={labelTerm} plain={plainLabel}>{label}</VisualLabel>}
          {value != null && (
            <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: c }}>{value}</span>
          )}
        </div>
      )}
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: grown ? `${Math.max(3, clamp(pct))}%` : "0%",
                   background: `linear-gradient(90deg, ${c}59, ${c})` }} />
        {marker != null && (
          <span title={markerLabel}
            className="absolute top-0 h-full w-px bg-white/45"
            style={{ left: `${clamp(marker)}%` }} />
        )}
      </div>
      <Scale min={scaleMin} max={scaleMax} />
      {markerLabel && marker != null && (
        <div className="mt-1 flex items-center gap-1 text-[11px] leading-none text-ink-faint/80">
          <span className="inline-block h-2 w-px bg-white/45" />{markerLabel}
        </div>
      )}
      {hint && showProse && (
        <div className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">{hint}</div>
      )}
    </div>
  );
}

/**
 * Two names, one bar, leaning to whoever won it. Used for teammate deltas,
 * closest margins and any head-to-head — the lean IS the story, the number
 * confirms it.
 */
export function DeltaBar({
  left, right, leftColor = TONE_COLOR.speed, rightColor = TONE_COLOR.neutral,
  lean, value, caption, leftSub, rightSub, unit,
}: {
  left: React.ReactNode; right: React.ReactNode;
  leftColor?: string; rightColor?: string;
  /** 0–1: how much of the bar the left side owns. 0.5 = dead even. */
  lean: number; value?: React.ReactNode; caption?: React.ReactNode;
  /** What each side actually achieved — the bar means little without it. */
  leftSub?: React.ReactNode; rightSub?: React.ReactNode;
  /** What the gap between them is measured in, e.g. "quicker". */
  unit?: React.ReactNode;
}) {
  const pct = clamp(lean * 100);
  const showProse = useShowProse();
  const grown = useGrowIn();
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="truncate text-xs font-bold" style={{ color: leftColor }}>{left}</span>
        {value != null && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink">
            {value}{unit ? <span className="ml-1 font-normal text-ink-faint">{unit}</span> : null}
          </span>
        )}
        <span className="ml-auto truncate text-xs font-semibold text-ink-faint">{right}</span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <span className="rounded-full transition-[width] duration-700 ease-out"
          style={{ width: grown ? `${pct}%` : "50%", background: leftColor }} />
        <span className="flex-1 rounded-full" style={{ background: `${rightColor}40` }} />
      </div>
      {(leftSub || rightSub) && (
        <div className="mt-1 flex justify-between gap-2 text-[11px] leading-none tabular-nums text-ink-faint/80">
          <span className="truncate">{leftSub}</span>
          <span className="truncate text-right">{rightSub}</span>
        </div>
      )}
      {caption && showProse && (
        <div className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">{caption}</div>
      )}
    </div>
  );
}

/**
 * A count you can take in without reading it. Five red flags is five marks —
 * the eye counts them faster than it parses "5 red flags".
 */
export function Tally({
  count, tone = "amber", label, max = 14, emptyLabel = "None", meaning,
}: {
  count: number; tone?: VisualTone; label?: React.ReactNode; max?: number; emptyLabel?: string;
  /** What one mark represents — a tally without this is just stripes. */
  meaning?: React.ReactNode;
}) {
  const c = TONE_COLOR[tone];
  const showProse = useShowProse();
  if (!count) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-white/[0.08]" />
          <span className="text-[12px] font-medium text-ink-muted">{emptyLabel}</span>
        </div>
        {meaning && showProse && (
          <div className="mt-1 text-[11.5px] leading-snug text-ink-faint">{meaning}</div>
        )}
      </div>
    );
  }
  const shown = Math.min(count, max);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-bold tabular-nums" style={{ color: c }}>{count}</span>
        {Array.from({ length: shown }).map((_, i) => (
          <span key={i} className="h-3.5 w-1.5 rounded-full"
            style={{ background: c, opacity: 0.45 + (0.55 * (i + 1)) / shown }} />
        ))}
        {count > max && <span className="text-[11px] font-semibold tabular-nums" style={{ color: c }}>+{count - max}</span>}
        {label && <span className="ml-1 text-[12px] text-ink-muted"><Explain>{label}</Explain></span>}
      </div>
      {meaning && showProse && (
        <div className="mt-1 text-[11.5px] leading-snug text-ink-faint">{meaning}</div>
      )}
    </div>
  );
}

/**
 * A position change, drawn the way a broadcast draws it: where you were, where
 * you ended, and the direction in colour.
 */
export function PositionShift({
  from, to, fromLabel = "P", toLabel = "P", size = "md",
}: { from?: number | null; to?: number | null; fromLabel?: string; toLabel?: string; size?: "sm" | "md" }) {
  if (from == null || to == null) return <span className="text-ink-faint">—</span>;
  const net = from - to;
  const tone = net > 0 ? "text-emerald-300" : net < 0 ? "text-rose-300" : "text-ink-muted";
  const glyph = net > 0 ? "▲" : net < 0 ? "▼" : "—";
  const t = size === "sm" ? "text-[11px]" : "text-xs";
  return (
    <span className={cx("inline-flex items-center gap-1.5 tabular-nums", t)}>
      <span className="text-ink-faint">{fromLabel}{from}</span>
      <span className="text-ink-faint">→</span>
      <span className="font-bold text-ink">{toLabel}{to}</span>
      <span className={cx("font-semibold", tone)}>{glyph}{net !== 0 ? ` ${Math.abs(net)}` : ""}</span>
    </span>
  );
}

/**
 * A trend with its axis — and, on hover, its data.
 *
 * These small charts sit beside the big ones, so they are held to the same
 * standard: a guide line follows the cursor, the nearest point lifts, and a
 * floating card names what you are pointing at. A miniature of the primary
 * analytics, not a decorative graphic.
 */
export interface SparkPoint {
  /** Heading of the hover card, e.g. "Lap 34" or "Q2". */
  label: string;
  /** Rows of the hover card. */
  rows?: { k: string; v: string }[];
}

export function Sparkline({
  points, labels, tone = "speed", width, height = 28, lowerIsBetter = true, valueFmt,
  fluid = false, meta, unit,
}: {
  points: number[];
  labels?: [string, string];
  tone?: VisualTone; width?: number; height?: number; lowerIsBetter?: boolean;
  valueFmt?: (v: number) => string;
  /** Grow to fill the container — for a trend that is the point of its panel. */
  fluid?: boolean;
  /** Per-point detail for the hover card. Without it the chart isn't inspectable. */
  meta?: SparkPoint[];
  unit?: string;
}) {
  // measured rather than percentage-scaled, so the dots stay round and the
  // stroke keeps its weight however wide the column happens to be
  const [boxRef, boxWidth] = useMeasuredWidth<HTMLDivElement>();
  const w = fluid ? Math.max(80, boxWidth || 120) : (width ?? 120);
  return (
    <div ref={boxRef} className={fluid ? "w-full min-w-0" : undefined}>
      <SparkBody points={points} labels={labels} tone={tone} width={w} height={height}
        lowerIsBetter={lowerIsBetter} valueFmt={valueFmt} meta={meta} unit={unit} />
    </div>
  );
}

function SparkBody({
  points, labels, tone, width, height, lowerIsBetter, valueFmt, meta, unit,
}: {
  points: number[]; labels?: [string, string]; tone: VisualTone;
  width: number; height: number; lowerIsBetter: boolean; valueFmt?: (v: number) => string;
  meta?: SparkPoint[]; unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const grown = useGrowIn();
  if (points.length < 2) return null;
  const lo = Math.min(...points), hi = Math.max(...points);
  const span = hi - lo || 1;
  const step = width / (points.length - 1);
  const y = (p: number) => height - ((p - lo) / span) * (height - 5) - 2.5;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const improving = lowerIsBetter ? last < points[0] : last > points[0];
  const c = improving ? TONE_COLOR.good : TONE_COLOR[tone];
  // a horizon line at the starting value turns "a wiggly line" into "it went
  // below where it began" — direction you can read without a legend
  const y0 = y(points[0]);
  const fmt = valueFmt ?? ((v: number) => v.toFixed(2));

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((e.clientX - r.left) / step))));
  };
  const hv = hover != null ? points[hover] : null;
  const hm = hover != null ? meta?.[hover] : undefined;

  return (
    <div className="min-w-0">
      <div className="relative cursor-crosshair" style={{ width, height }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible" aria-hidden>
          <line x1={0} y1={y0} x2={width} y2={y0} stroke="currentColor"
            className="text-ink-faint/35" strokeWidth={1} strokeDasharray="2 3" />
          <path d={`${d} L${width},${height} L0,${height} Z`} fill={c}
            opacity={grown ? 0.1 : 0} style={{ transition: "opacity .7s ease" }} />
          {/* the line draws itself in — the chart arrives rather than appearing */}
          <path d={d} fill="none" stroke={c} strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round"
            style={{
              strokeDasharray: width * 2.5, strokeDashoffset: grown ? 0 : width * 2.5,
              transition: "stroke-dashoffset 1.1s ease-out",
            }} />
          <circle cx={0} cy={y(points[0])} r={2} fill={c} opacity={0.6} />
          <circle cx={width} cy={y(last)} r={2.75} fill={c} />
          {hover != null && (
            <>
              <line x1={hover * step} y1={0} x2={hover * step} y2={height}
                stroke={c} strokeWidth={1} opacity={0.45} />
              <circle cx={hover * step} cy={y(points[hover])} r={3.5} fill="#0b0e16"
                stroke={c} strokeWidth={2} />
            </>
          )}
        </svg>

        {hover != null && hv != null && (
          <div className="pointer-events-none absolute bottom-full z-40 mb-2 w-max min-w-[7.5rem] max-w-[14rem] rounded-lg border border-white/10 bg-base-900/95 p-2.5 shadow-glow backdrop-blur-sm"
            style={{
              left: Math.min(Math.max(hover * step, 0), Math.max(0, width - 40)),
              transform: hover * step > width * 0.6 ? "translateX(-88%)" : "translateX(-12%)",
            }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {hm?.label ?? `Point ${hover + 1}`}
            </div>
            <div className="mt-0.5 text-base font-bold tabular-nums" style={{ color: c }}>
              {fmt(hv)}{unit ?? ""}
            </div>
            {hm?.rows?.length ? (
              <div className="mt-1.5 space-y-0.5 border-t border-white/[0.07] pt-1.5">
                {hm.rows.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3 text-[12px] leading-snug">
                    <span className="text-ink-faint">{r.k}</span>
                    <span className="tabular-nums text-ink">{r.v}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {labels && (
        <div className="mt-1 flex justify-between text-[11px] leading-none tabular-nums text-ink-faint/80"
          style={{ width }}>
          <span>{labels[0]}{valueFmt ? ` ${valueFmt(points[0])}` : ""}</span>
          <span>{labels[1]}{valueFmt ? ` ${valueFmt(last)}` : ""}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sector ownership. A lit chip alone only says "this one, not that one"; the
 * delta underneath says by how much, which is the difference between a legend
 * and a graphic that can be read on its own.
 */
export function SectorChips({
  owned, deltas, total = 3,
}: { owned: boolean[]; deltas?: (number | null)[]; total?: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const d = deltas?.[i];
        return (
          <div key={i} className="min-w-0 flex-1">
            <span
              title={owned[i] ? `Session best in sector ${i + 1}` : `Sector ${i + 1}`}
              className={cx("block rounded-md border px-1.5 py-1 text-center text-[10px] font-bold tabular-nums",
                owned[i]
                  ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
                  : "border-white/[0.06] bg-white/[0.02] text-ink-faint")}>
              S{i + 1}
            </span>
            <div className={cx("mt-1 text-center text-[11px] leading-none tabular-nums",
              owned[i] ? "text-emerald-300/80" : "text-ink-faint/70")}>
              {d == null ? "—" : d <= 0.0005 ? "best" : `+${d.toFixed(3)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A compact horizontal stat strip. The Bloomberg move: three or four numbers,
 * evenly weighted, no sentence needed.
 */
export function StatStrip({
  items, className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; tone?: VisualTone;
           sub?: React.ReactNode; term?: string }[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={cx("flex flex-wrap gap-x-6 gap-y-3", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <VisualLabel term={it.term}>{it.label}</VisualLabel>
          <div className={cx("mt-0.5 text-lg font-bold leading-none tabular-nums tracking-tight",
            it.tone ? toneText[it.tone] : "text-ink")}>
            {it.value}
          </div>
          {it.sub && <div className="mt-1 text-[10px] leading-none text-ink-faint">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** The tinted glyph tile every card, panel and hero leads with. */
export function IconTile({
  children, tone = "neutral", size = 28, className,
}: { children: React.ReactNode; tone?: VisualTone; size?: number; className?: string }) {
  const c = TONE_COLOR[tone];
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-lg", className)}
      style={{ width: size, height: size, background: `${c}1f`, color: c }}>
      {children}
    </span>
  );
}
