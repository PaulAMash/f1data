"use client";
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

/** The one micro-label used above every visual, so they all read as siblings. */
export function VisualLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
    </span>
  );
}

/**
 * A value on a track. The single most reused shape in the product: temperature,
 * consistency, gap to pole, improvement, humidity — all the same object, so a
 * filled bar always means the same thing wherever you meet it.
 */
export function Meter({
  label, value, pct, tone = "speed", color, hint, className,
}: {
  label?: React.ReactNode; value?: React.ReactNode; pct: number;
  tone?: VisualTone; color?: string; hint?: React.ReactNode; className?: string;
}) {
  const c = color ?? TONE_COLOR[tone];
  return (
    <div className={cx("min-w-0", className)}>
      {(label || value) && (
        <div className="mb-1 flex items-baseline gap-2">
          {label && <VisualLabel>{label}</VisualLabel>}
          {value != null && (
            <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: c }}>{value}</span>
          )}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(3, clamp(pct))}%`, background: `linear-gradient(90deg, ${c}59, ${c})` }} />
      </div>
      {hint && <div className="mt-1 text-[10px] leading-snug text-ink-faint">{hint}</div>}
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
  lean, value, caption,
}: {
  left: React.ReactNode; right: React.ReactNode;
  leftColor?: string; rightColor?: string;
  /** 0–1: how much of the bar the left side owns. 0.5 = dead even. */
  lean: number; value?: React.ReactNode; caption?: React.ReactNode;
}) {
  const pct = clamp(lean * 100);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="truncate text-xs font-bold" style={{ color: leftColor }}>{left}</span>
        {value != null && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-muted">{value}</span>
        )}
        <span className="ml-auto truncate text-xs font-semibold text-ink-faint">{right}</span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <span className="rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: leftColor }} />
        <span className="flex-1 rounded-full" style={{ background: `${rightColor}40` }} />
      </div>
      {caption && <div className="mt-1 text-[10px] leading-snug text-ink-faint">{caption}</div>}
    </div>
  );
}

/**
 * A count you can take in without reading it. Five red flags is five marks —
 * the eye counts them faster than it parses "5 red flags".
 */
export function Tally({
  count, tone = "amber", label, max = 14, emptyLabel = "None",
}: {
  count: number; tone?: VisualTone; label?: React.ReactNode; max?: number; emptyLabel?: string;
}) {
  const c = TONE_COLOR[tone];
  if (!count) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-6 rounded-full bg-white/[0.08]" />
        <span className="text-[11px] font-medium text-ink-faint">{emptyLabel}</span>
      </div>
    );
  }
  const shown = Math.min(count, max);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="h-3.5 w-1.5 rounded-full"
          style={{ background: c, opacity: 0.45 + (0.55 * (i + 1)) / shown }} />
      ))}
      {count > max && <span className="text-[11px] font-semibold tabular-nums" style={{ color: c }}>+{count - max}</span>}
      {label && <span className="ml-1 text-[11px] text-ink-faint">{label}</span>}
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

/** A trend, small enough to live inside a card. Lower-is-better inverts the tone. */
export function Sparkline({
  points, tone = "speed", width = 96, height = 24, lowerIsBetter = true,
}: { points: number[]; tone?: VisualTone; width?: number; height?: number; lowerIsBetter?: boolean }) {
  if (points.length < 2) return null;
  const lo = Math.min(...points), hi = Math.max(...points);
  const span = hi - lo || 1;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((p - lo) / span) * (height - 4) - 2).toFixed(1)}`).join(" ");
  const improving = lowerIsBetter ? points[points.length - 1] < points[0] : points[points.length - 1] > points[0];
  const c = improving ? TONE_COLOR.good : TONE_COLOR[tone];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={c} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - ((points[points.length - 1] - lo) / span) * (height - 4) - 2} r={2.5} fill={c} />
    </svg>
  );
}

/** Sector ownership — three chips, lit where they were the session's best. */
export function SectorChips({ owned, total = 3 }: { owned: boolean[]; total?: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i}
          className={cx("flex-1 rounded-md border px-1.5 py-1 text-center text-[10px] font-bold tabular-nums",
            owned[i]
              ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
              : "border-white/[0.06] bg-white/[0.02] text-ink-faint")}>
          S{i + 1}
        </span>
      ))}
    </div>
  );
}

/**
 * A compact horizontal stat strip. The Bloomberg move: three or four numbers,
 * evenly weighted, no sentence needed.
 */
export function StatStrip({
  items, className,
}: { items: { label: React.ReactNode; value: React.ReactNode; tone?: VisualTone }[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cx("flex flex-wrap gap-x-6 gap-y-3", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <VisualLabel>{it.label}</VisualLabel>
          <div className={cx("mt-0.5 text-lg font-bold leading-none tabular-nums tracking-tight",
            it.tone ? toneText[it.tone] : "text-ink")}>
            {it.value}
          </div>
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
