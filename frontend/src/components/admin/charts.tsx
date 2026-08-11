"use client";
import { useState } from "react";
import { cx } from "@/lib/format";
import { Empty, fmtMs } from "./kit";

/* -------------------------------------------------------------------------- */
/* EVERY CHART HERE ANSWERS ONE NAMED QUESTION. None is decorative, and where a */
/* list said it faster (top races, endpoints) it stayed a list.                 */
/* -------------------------------------------------------------------------- */

type TrafficRow = {
  day: string; visitors: number; views: number; visits: number;
  asks: number; sessions: number; errors: number;
};

/* ONE AXIS, THREE SERIES, ALL COUNTS.
   Page views, sessions opened and Ask questions are the same unit — a thing
   somebody did — so they share a scale honestly and their heights compare
   directly. A second y-axis would let asks look as tall as views and would be a
   lie in the shape of a chart. Errors ride as a marker above the group rather
   than a fourth bar, because their job is "was this day bad", not "how many
   relative to page views". */
export function TrafficChart({ rows }: { rows: TrafficRow[] | undefined }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = rows ?? [];
  if (!data.length) return <Empty>No traffic recorded in this window.</Empty>;

  const peak = Math.max(1, ...data.map((r) => Math.max(r.views, r.sessions, r.asks)));
  const H = 132;
  /* Bars grow when there are few days. A ninety-day range needs thin bars to
     fit; a seven-day range drawn with the same cap is a thumbnail marooned in a
     panel, and the shape of a week is the thing this chart exists to show. */
  const barMax = data.length <= 10 ? 74 : data.length <= 20 ? 58 : 46;
  const series = [
    { key: "views" as const, label: "Page views", color: "var(--adm-sky)" },
    { key: "sessions" as const, label: "Sessions opened", color: "var(--adm-teal)" },
    { key: "asks" as const, label: "Ask questions", color: "var(--adm-violet)" },
  ];
  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
          <span className="h-2 w-2 rotate-45 bg-accent" />Errors
        </span>
        <span className="ml-auto text-[11.5px] tabular-nums text-ink-faint">peak {peak}/day</span>
      </div>

      {/* THE AXIS HAS TO BE AS WIDE AS THE BARS AND NO WIDER.
          Bars cap at 46px each, so eight days occupy about a third of a desktop
          panel — and a `justify-between` axis underneath spread its first and
          last dates across the FULL width, putting "11 Aug" a screen away from
          the bar it labels. Capping the whole group at the width the bars can
          actually reach keeps the two in register at every range length. */}
      <div className="relative" style={{ maxWidth: data.length * (barMax + 3) }}>
        {/* A read-out replaces a per-bar label: a number on every bar of a
            ninety-day range is noise; one on the bar under the pointer is an
            answer. */}
        {active && (
          <div className="pointer-events-none absolute right-0 top-0 z-10 rounded-lg border
                          border-white/10 bg-base-900/95 px-2.5 py-1.5 text-[11.5px] shadow-lg">
            <div className="font-medium text-ink">{active.day}</div>
            <div className="mt-0.5 space-y-0.5 text-ink-muted">
              <div>{active.visitors} visitors · {active.visits} visits</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-sm" style={{ background: s.color }} />
                  {s.label}: <span className="tabular-nums text-ink">{active[s.key]}</span>
                </div>
              ))}
              {active.errors > 0 && (
                <div className="text-accent">{active.errors} reader-facing errors</div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-end gap-[3px]" style={{ height: H }}>
          {data.map((r, i) => (
            <div key={r.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ maxWidth: barMax }}
              className={cx("relative flex h-full flex-1 items-end justify-center",
                            "gap-[2px] rounded-sm px-[1px] transition-colors",
                            hover === i && "bg-white/[0.04]")}>
              {r.errors > 0 && (
                <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rotate-45
                                 bg-accent" title={`${r.errors} errors`} />
              )}
              {series.map((s) => (
                <span key={s.key} title={`${r.day} — ${s.label}: ${r[s.key]}`}
                  className="w-full rounded-t-[2px]"
                  style={{ background: s.color,
                           height: `${Math.max(r[s.key] ? 2 : 0, (r[s.key] / peak) * (H - 10))}px` }} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between border-t border-white/[0.06] pt-1
                        text-[10.5px] tabular-nums text-ink-faint">
          <span>{data[0]?.day}</span>
          {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.day}</span>}
          <span>{data[data.length - 1]?.day}</span>
        </div>
      </div>
    </div>
  );
}

/* THE FUNNEL. Ordinal, so one hue in darkening steps rather than four
   identities — the reader should see the ORDER in the colour, and four
   categorical hues here would imply the stages are alternatives rather than a
   sequence. Each step shows its own drop-off, because the number worth acting
   on is not "18% reach Ask" but "we lose 60% at the step before". */
export function Funnel({ steps }: {
  steps: { step: string; visits: number; pct: number; help?: string }[] | undefined;
}) {
  const data = steps ?? [];
  if (!data.length || !data[0]?.visits) return <Empty>No visits in this window.</Empty>;
  const shades = [0.85, 0.62, 0.44, 0.30];
  return (
    <ol className="space-y-2">
      {data.map((s, i) => {
        const prev = i > 0 ? data[i - 1].visits : null;
        const dropped = prev !== null ? prev - s.visits : 0;
        return (
          <li key={s.step}>
            <div className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-ink" title={s.help}>{s.step}</span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">{s.pct}%</span>
              <span className="w-10 shrink-0 text-right font-medium tabular-nums text-ink">
                {s.visits}
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-md bg-white/[0.05]">
              <div className="h-full rounded-md"
                style={{ width: `${Math.max(1.5, s.pct)}%`,
                         background: `color-mix(in srgb, var(--adm-teal) ${
                           shades[Math.min(i, 3)] * 100}%, transparent)` }} />
            </div>
            {dropped > 0 && (
              <p className="mt-0.5 text-[11px] text-ink-faint">−{dropped} did not go further</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* THE TOPIC SCOREBOARD — the panel this whole redesign is for.
   Volume, success and sentiment on one row, because separately they are trivia
   and together they are a decision: "people ask about tyres constantly, we
   answer 40%, and half of what we do answer gets a thumbs down" is an
   instruction. Sorted by volume; the bar width IS the volume, so the eye ranks
   the subjects before reading a single number. */
export function TopicScoreboard({ topics, onPick, picked }: {
  topics: any[] | undefined;
  onPick?: (topic: string | null) => void;
  picked?: string | null;
}) {
  const rows = (topics ?? []).slice(0, 16);
  if (!rows.length) return <Empty>No questions asked in this window.</Empty>;
  const peak = Math.max(1, ...rows.map((t) => t.n));
  return (
    <div className="space-y-1.5">
      {rows.map((t) => {
        const active = picked === t.topic;
        return (
          <button key={t.topic} type="button"
            onClick={() => onPick?.(active ? null : t.topic)}
            className={cx("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3",
                          "rounded-lg px-2 py-1 text-left transition-colors",
                          active ? "bg-white/[0.07]" : "hover:bg-white/[0.03]")}>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.label}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                  {t.answered_pct}% answered
                </span>
              </div>
              <div className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded-full bg-white/[0.05]"
                style={{ width: `${Math.max(8, (t.n / peak) * 100)}%` }}
                title={`${t.n} questions · ${t.answered} answered · ${t.unresolved} unresolved`}>
                <span style={{ width: `${t.n ? (t.answered / t.n) * 100 : 0}%`,
                               background: "var(--adm-teal)" }} />
                <span style={{ width: `${t.n ? (t.unresolved / t.n) * 100 : 0}%`,
                               background: "var(--adm-violet)" }} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5 text-[11.5px] tabular-nums">
              {t.rated > 0 ? (
                <span className="flex items-center gap-1.5">
                  {t.helpful > 0 && <span className="text-speed">▲{t.helpful}</span>}
                  {t.unhelpful > 0 && <span className="text-amber">▼{t.unhelpful}</span>}
                </span>
              ) : <span className="text-ink-faint">—</span>}
              <span className="w-8 text-right font-medium text-ink">{t.n}</span>
            </div>
          </button>
        );
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2
                      text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--adm-teal)" }} />
          answered outright
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--adm-violet)" }} />
          unresolved
        </span>
        <span className="text-speed">▲ helpful</span>
        <span className="text-amber">▼ unhelpful</span>
        <span>Bar width is question volume · click a topic to filter the log</span>
      </div>
    </div>
  );
}

/* ENDPOINT HEALTH. Latency drawn against each endpoint's OWN budget rather than
   against the slowest row, because an honest ranking put /api/session at the top
   and made a nine-second third-party archive fetch look like the worst thing
   happening on the site. A bar past the budget line is the actual signal, and an
   upstream fetch has a budget that says so. */
export function EndpointHealth({ endpoints }: { endpoints: any[] | undefined }) {
  const rows = endpoints ?? [];
  if (!rows.length) return <Empty>No API traffic recorded in this window.</Empty>;
  return (
    <div className="space-y-2.5">
      {rows.map((e) => {
        const ratio = Math.min(1.6, (e.avg_ms || 0) / (e.budget_ms || 800));
        const fill = e.tone === "bad" ? "var(--adm-rose)"
                   : e.tone === "warn" ? "var(--adm-amber)" : "var(--adm-teal)";
        return (
          <div key={e.path}>
            <div className="flex items-baseline gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink"
                title={e.path}>{e.path}</span>
              {e.upstream && (
                <span className="shrink-0 rounded border border-white/10 px-1 text-[10px]
                                 uppercase tracking-wide text-ink-faint" title={e.note}>
                  upstream
                </span>
              )}
              {e.error_pct > 0 && (
                <span className="shrink-0 text-[11px] tabular-nums text-accent">
                  {e.error_pct}% err
                </span>
              )}
              <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">×{e.n}</span>
              <span className="w-14 shrink-0 text-right font-medium tabular-nums text-ink">
                {fmtMs(e.avg_ms)}
              </span>
            </div>
            <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full"
                style={{ width: `${Math.max(2, (ratio / 1.6) * 100)}%`, background: fill }} />
              {/* the budget line: everything left of it is fine by definition */}
              <span className="absolute top-0 h-full w-px bg-white/25"
                style={{ left: `${(1 / 1.6) * 100}%` }} title="expected budget" />
            </div>
            <p className="mt-0.5 text-[11px] text-ink-faint">{e.note} · max {fmtMs(e.max_ms)}</p>
          </div>
        );
      })}
    </div>
  );
}
