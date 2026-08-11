"use client";
import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* THE DASHBOARD'S OWN SMALL DESIGN SYSTEM.                                   */
/*                                                                            */
/* Everything on the admin page is built from the pieces below so that one     */
/* decision — what "warning" looks like, how a number is set, where a          */
/* definition lives — is made once. The old page had none of this and it       */
/* showed: three ways of writing a count, two of drawing a bar, and a metric   */
/* ("unresolved") whose meaning existed only inside a SQL string.              */
/*                                                                            */
/* CHARTS ARE HAND-DRAWN SVG/CSS, not recharts. Not an aversion — recharts     */
/* renders the product's own charts — but these are bar groups and proportion  */
/* bars over at most ninety points. The part of a library you would use here   */
/* is the axis; the part you would pay for is a render path that took four     */
/* releases to stop returning blank in production (see charts/ChartBox.tsx).   */
/* -------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   COLOUR.

   The product palette (accent red, speed turquoise, amber) carries STATUS and
   nothing else here — good, warning, problem — because that is what it means
   everywhere else in Pitwall IQ, and a dashboard redefining it would be
   teaching a second language.

   The six OUTCOME colours are a categorical scale of their own, validated for
   colour-vision separation rather than chosen by eye: adjacent-pair ΔE 10.9
   (deuteranopia) and 19.8 (normal vision) in dark, 10.0 / 19.8 in light, all
   six above 3:1 contrast on their surface. The neutral slot for "not about F1"
   is deliberately achromatic — it is the one outcome that should recede rather
   than compete — and it sits at the END of the scale so it is never adjacent to
   the blue, which is where a grey and a blue collapse for protanopes. Every
   segment is direct-labelled too, so identity never rests on colour alone.
--------------------------------------------------------------------------- */
export const OUTCOME_COLOR: Record<string, string> = {
  answered: "var(--adm-teal)",
  partial: "var(--adm-amber)",
  unsupported: "var(--adm-violet)",
  no_data: "var(--adm-sky)",
  failed: "var(--adm-rose)",
  off_topic: "var(--adm-grey)",
};

export const OUTCOME_ORDER = [
  "answered", "partial", "unsupported", "no_data", "failed", "off_topic",
] as const;

/** Injected once by the page. Two full sets — a dark palette is chosen, not
 *  derived by lightening (the same principle as the product's own light mode). */
export const PALETTE_CSS = `
  .adm {
    --adm-teal:#0d9488; --adm-amber:#d97706; --adm-violet:#8b5cf6;
    --adm-sky:#0ea5e9;  --adm-rose:#e11d48;  --adm-grey:#9ca3af;
  }
  :root[data-theme="light"] .adm {
    --adm-teal:#0d9488; --adm-amber:#b45309; --adm-violet:#7c3aed;
    --adm-sky:#0369a1;  --adm-rose:#be123c;  --adm-grey:#6b7280;
  }
`;

export type Tone = "good" | "warn" | "bad" | "info" | "opportunity" | "muted" | "unknown";

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-speed", warn: "text-amber", bad: "text-accent",
  info: "text-ink-muted", opportunity: "text-ink", muted: "text-ink-faint",
  unknown: "text-ink-faint",
};

const TONE_BORDER: Record<Tone, string> = {
  good: "border-speed/30 bg-speed/[0.06]",
  warn: "border-amber/30 bg-amber/[0.06]",
  bad: "border-accent/35 bg-accent/[0.07]",
  info: "border-white/[0.08] bg-base-850/40",
  opportunity: "border-white/[0.08] bg-base-850/40",
  muted: "border-white/[0.06] bg-base-850/30",
  unknown: "border-white/[0.06] bg-base-850/30",
};

const TONE_FILL: Record<Tone, string> = {
  good: "var(--adm-teal)", warn: "var(--adm-amber)", bad: "var(--adm-rose)",
  info: "var(--adm-sky)", opportunity: "var(--adm-violet)",
  muted: "var(--adm-grey)", unknown: "var(--adm-grey)",
};

/* -------------------------------------------------------------------------- */
/* A DEFINITION, ATTACHED TO THE NUMBER IT DEFINES.                           */
/*                                                                            */
/* Half the old dashboard's problem was not the numbers but that several of    */
/* them ("unresolved", "returning", p95) needed a sentence nobody had written.  */
/* Rather than a legend at the bottom that nobody reads, the explanation hangs  */
/* off the metric itself. Click rather than hover: a tooltip you must keep the  */
/* pointer inside cannot be read on a phone.                                   */
/* -------------------------------------------------------------------------- */
export function Explain({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button type="button" onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)} aria-expanded={open} aria-label="What this means"
        className="inline-flex h-4 w-4 items-center justify-center rounded text-ink-faint
                   transition-colors hover:text-ink-muted focus-visible:outline
                   focus-visible:outline-1 focus-visible:outline-accent/50">
        <Info size={12} />
      </button>
      {open && (
        <span role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg border
                     border-white/10 bg-base-900 px-3 py-2 text-[12px] font-normal
                     leading-relaxed text-ink-muted shadow-xl">
          {children}
        </span>
      )}
    </span>
  );
}

export function Section({ title, icon, note, action, children }: {
  title: string; icon?: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-base-850/40 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          {icon}{title}
        </h2>
        {note && <span className="text-[12px] text-ink-faint">{note}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

export function Sub({ title, help, children }: {
  title: string; help?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
          {title}
        </h3>
        {help && <Explain>{help}</Explain>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[13px] italic text-ink-faint">{children}</p>;
}

/* -------------------------------------------------------------------------- */
/* THE HEADLINE VERDICT.                                                      */
/*                                                                            */
/* Three of these sit at the top and they are why this is a dashboard rather   */
/* than a report: each is a JUDGEMENT ("backend is fine") with the measurement  */
/* beneath it, so the first thing read is a conclusion. A top row of six bare   */
/* counts asks the reader to remember last week's six counts to know whether to */
/* care.                                                                       */
/* -------------------------------------------------------------------------- */
export function Verdict({ label, state, note }: {
  label: string; state: Tone; note: string;
}) {
  const dot = { good: "bg-speed", warn: "bg-amber", bad: "bg-accent",
                info: "bg-ink-faint", opportunity: "bg-ink-faint",
                muted: "bg-ink-faint", unknown: "bg-ink-faint" }[state];
  return (
    <div className={cx("rounded-xl border px-3.5 py-3", TONE_BORDER[state])}>
      <div className="flex items-center gap-2">
        <span className={cx("h-2 w-2 shrink-0 rounded-full", dot)} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
          {label}
        </span>
        <span className={cx("ml-auto text-[10.5px] font-bold uppercase tracking-wider",
                            TONE_TEXT[state])}>
          {state === "unknown" ? "no data" : state}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-muted">{note}</p>
    </div>
  );
}

export function Stat({ label, value, prev, hint, help, tone, invert }: {
  label: string; value: number | string; prev?: number | null; hint?: string;
  help?: ReactNode; tone?: Tone;
  /** true when a RISE is bad (errors), so the delta colours the other way. */
  invert?: boolean;
}) {
  const numeric = typeof value === "number";
  const delta = prev === undefined || prev === null || !numeric ? null : value - prev;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-base-850/50 px-3 py-2.5">
      <div className="flex items-center gap-1">
        <p className="text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">{label}</p>
        {help && <Explain>{help}</Explain>}
      </div>
      <p className={cx("mt-0.5 text-[26px] font-bold leading-tight tabular-nums",
                       tone ? TONE_TEXT[tone] : "text-ink")}>{value}</p>
      {hint && <p className="text-[11px] leading-tight text-ink-faint">{hint}</p>}
      {!hint && delta !== null && (
        <p className={cx("text-[11px] tabular-nums",
          delta === 0 ? "text-ink-faint"
            : (delta > 0) !== !!invert ? "text-speed" : "text-amber")}>
          {delta > 0 ? "+" : ""}{delta} vs previous
        </p>
      )}
      {!hint && delta === null && <p className="text-[11px] text-transparent">–</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ranked list with a proportion bar.                                          */
/*                                                                            */
/* A bar rather than a bare number, because the question these lists answer is  */
/* always comparative ("which race is the popular one") and a column of         */
/* right-aligned integers makes the reader do the division. Bars are drawn      */
/* against the LARGEST value in the list, not the total, so second place is     */
/* legible when first place has 80% of the traffic.                             */
/*                                                                            */
/* The default fill is a DATA colour, not the brand red: accent means "wrong"   */
/* everywhere else in this product, and six ranked lists painted in it turn     */
/* "which race is popular" into a wall that reads as six alarms.                */
/* -------------------------------------------------------------------------- */
export function RankedList({ rows, label, value, format, suffix, tone, limit = 10, empty }: {
  rows: any[] | undefined;
  label: (r: any) => string;
  value: (r: any) => number;
  /** How to PRINT the value. The bar always uses the raw number, so a list of
   *  seconds can read "132s" without the proportions going wrong. Without this
   *  a dwell column printed a bare "132" under a heading that said "time". */
  format?: (n: number, r: any) => string;
  suffix?: (r: any) => string;
  tone?: (r: any) => Tone;
  limit?: number;
  empty?: string;
}) {
  const items = (rows ?? []).slice(0, limit);
  if (!items.length) return <Empty>{empty ?? "Nothing recorded yet."}</Empty>;
  const peak = Math.max(1, ...items.map(value));
  return (
    <ul className="space-y-1.5">
      {items.map((r, i) => {
        const n = value(r);
        const text = label(r);
        return (
          <li key={i}>
            <div className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-ink" title={text}>{text}</span>
              {suffix && <span className="shrink-0 text-[11.5px] text-ink-faint">{suffix(r)}</span>}
              <span className="w-12 shrink-0 text-right font-medium tabular-nums text-ink">
                {format ? format(n, r) : n}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, (n / peak) * 100)}%`,
                         background: tone ? TONE_FILL[tone(r)] : "var(--adm-sky)" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A proportion split into labelled segments — one row, several parts of a
 *  whole. Every segment carries its own text, so colour is a second encoding
 *  rather than the only one. */
export function SplitBar({ parts, total, legend = true }: {
  parts: { label: string; n: number; color: string }[]; total: number;
  /** Off when a fuller list of the same segments follows immediately — two
   *  legends for one bar is the reader checking whether they differ. */
  legend?: boolean;
}) {
  if (!total) return <Empty>Nothing in this window.</Empty>;
  const shown = parts.filter((p) => p.n > 0);
  return (
    <div>
      {/* 2px gaps: without them two adjacent fills read as one longer segment
          of the first colour. */}
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-white/[0.05]">
        {shown.map((p) => (
          <div key={p.label} title={`${p.label}: ${p.n}`}
            style={{ width: `${(p.n / total) * 100}%`, background: p.color }}
            className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      {legend && <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="text-ink-muted">{p.label}</span>
            <span className="font-medium tabular-nums text-ink">{p.n}</span>
          </li>
        ))}
      </ul>}
    </div>
  );
}

/** Proportion of a whole as one bar, with an ordinal one-hue ramp — used for
 *  engagement depth and repeat visits, where the SHAPE of the distribution is
 *  the finding and an average would hide it. */
export function Distribution({ buckets, colorFrom = "var(--adm-teal)" }: {
  buckets: { bucket: string; pct: number }[];
  colorFrom?: string;
}) {
  const total = buckets.reduce((sum, b) => sum + b.pct, 0);
  if (!total) return <Empty>Not enough activity to measure.</Empty>;
  const shades = [0.9, 0.68, 0.46, 0.28];
  const fill = (i: number) =>
    `color-mix(in srgb, ${colorFrom} ${shades[Math.min(i, 3)] * 100}%, transparent)`;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-white/[0.05]">
        {buckets.map((b, i) => b.pct > 0 && (
          <div key={b.bucket} title={`${b.bucket}: ${b.pct}%`}
            style={{ width: `${b.pct}%`, background: fill(i) }}
            className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
        {buckets.map((b, i) => (
          <li key={b.bucket} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: fill(i) }} />
            <span className="text-ink-muted">{b.bucket}</span>
            <span className="tabular-nums text-ink">{b.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cx(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
      TONE_BORDER[tone], TONE_TEXT[tone])}>
      {children}
    </span>
  );
}

/** Wide content scrolls inside itself — the page never scrolls sideways. */
export function Scroll({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : `${Math.round(ms)}ms`;
}

export function fmtWhen(ts: string | null | undefined): string {
  if (!ts) return "—";
  return String(ts).replace("T", " ").slice(0, 16);
}
