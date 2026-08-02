"use client";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Flag } from "@/components/ui/MotionIcon";
import type { RaceInsight, RaceSession, StrategySummary } from "@/lib/types";
import { KIND_LABEL, MOMENT, momentClassOf } from "@/lib/raceEvents";
import { decisiveContext, mechanismsFor, type DecisiveContext } from "@/lib/decisive";
import { cx } from "@/lib/format";

/* Every card used to be styled by SEVERITY, and "info" — which is most of them
   — resolved to a grey border, a grey glyph and a grey badge. A page of grey
   cards says none of this is important, which is the opposite of what a
   strategy debrief is for.
   Cards are now coloured by WHAT THE CALL DID (the shared taxonomy in
   lib/raceEvents): teal won time, rose cost it, amber turned the race, violet
   is worth knowing. Same colours, same words, same meaning as the Key Moments
   on the Position chart and the Race Story timeline. */

export function StrategyExplainer({
  strategy, session, onFocusDrivers,
}: { strategy: StrategySummary; session: RaceSession; onFocusDrivers?: (codes: string[]) => void }) {
  const [filter, setFilter] = useState<"all" | "key">("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // built once for the whole page: every card asks the same session the same
  // questions, and rebuilding the position trace per card would be twenty
  // passes over a thousand points to answer eight questions
  const ctx = useMemo(() => decisiveContext(session, strategy), [session, strategy]);
  const insights = filter === "key"
    ? strategy.insights.filter((i) => i.severity === "key" || i.severity === "bad" || i.severity === "good")
    : strategy.insights;

  // Two *independent* column stacks (not grid rows): expanding a card only
  // pushes down its own column, so the layout never tears open a gap next to
  // it. Split sequentially so the single-column mobile order stays ranked.
  const mid = Math.ceil(insights.length / 2);
  const columns = [insights.slice(0, mid), insights.slice(mid)];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-faint">Tap a card for the full explanation</span>
        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-base-850/60 p-1 text-xs">
          {(["all", "key"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setOpenKey(null); }}
              className={cx("rounded-md px-2.5 py-1 font-medium",
                filter === f ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
              {f === "all" ? "All" : "Decisive only"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2">
        {columns.map((col, ci) => (
          <div key={ci} className="min-w-0 space-y-3">
            {col.map((ins) => {
              const key = `${ins.kind}|${ins.title}`;
              return (
                <StrategyCard key={key} ins={ins} ctx={ctx} onFocus={onFocusDrivers}
                  open={openKey === key}
                  onToggle={() => setOpenKey((k) => (k === key ? null : key))} />
              );
            })}
          </div>
        ))}
      </div>
      {!insights.length && <p className="text-sm text-ink-faint">No insights generated for this session.</p>}
    </div>
  );
}

/**
 * Collapsed by default: title + tag + a clear chevron affordance. Clicking
 * expands to the what (detail), the WHY (explanation), and the focus actions —
 * so the page scans clean but the depth is one click away. Only one card is
 * open at a time (true accordion), keeping the layout compact.
 */
function StrategyCard({ ins, ctx, open, onToggle, onFocus }: {
  ins: RaceInsight; ctx: DecisiveContext; open: boolean; onToggle: () => void;
  onFocus?: (c: string[]) => void;
}) {
  const cls = momentClassOf(ins.kind, ins.severity);
  const meta = MOMENT[cls];
  const Icon = meta.icon;
  const c = meta.color;
  // only computed for the card the reader actually opened
  const mechanisms = useMemo(() => (open ? mechanismsFor(ins, ctx) : []), [open, ins, ctx]);
  return (
    <div className={cx("group/ins relative overflow-hidden rounded-xl border bg-base-850/50",
      "transition-all duration-200 ease-out hover:-translate-y-px",
      open && "bg-base-800/60")}
      style={{ borderColor: open ? `${c}77` : `${c}33` }}>
      {/* a wash of the card's own colour — the category is legible before a
          single word is read, and it strengthens when you reach for the card */}
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-55 transition-opacity duration-300 group-hover/ins:opacity-100"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${c}16, transparent 58%)` }} />
      <button onClick={onToggle} aria-expanded={open}
        className="relative flex w-full items-center justify-between gap-2 p-4 text-left transition-colors hover:bg-white/[0.02]">
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-ink">
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg transition-transform duration-300 ease-out group-hover/ins:scale-110"
            style={{ background: `${c}22`, color: c, boxShadow: `inset 0 0 0 1px ${c}3a` }}>
            <Icon size={14} />
          </span>
          <span className="truncate">{ins.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: `${c}1c`, color: c, boxShadow: `inset 0 0 0 1px ${c}3a` }}>
            {KIND_LABEL[ins.kind] ?? ins.kind}
          </span>
          <ChevronDown size={15}
            className={cx("text-ink-faint transition-all duration-300 ease-out group-hover/ins:text-ink",
              open && "rotate-180 text-ink")} />
        </span>
      </button>

      {/* the panel slides to its own height, so the cards below it move once and
          smoothly rather than jumping the moment the click lands */}
      <div className={cx("relative grid transition-[grid-template-rows] duration-300 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
        <div className={cx("border-t border-white/[0.05] p-4 pt-3 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0")}>
          <p className="text-sm leading-relaxed text-ink-muted">{ins.detail}</p>
          {/* ONE "why" block, not two. The backend's context leads it when there
              is any, and the named mechanisms — each one checked against this
              session — follow. See lib/decisive.ts. */}
          {(ins.explanation || mechanisms.length > 0) && (
            <div className="mt-2.5 rounded-lg border border-white/[0.05] bg-base-900/40 p-3">
              <div className="label mb-1.5">Why it was decisive</div>
              {ins.explanation && (
                <p className="text-sm leading-relaxed text-ink-muted">{ins.explanation}</p>
              )}
              {mechanisms.length > 0 && (
                <ul className={cx("space-y-2.5", ins.explanation && "mt-3 border-t border-white/[0.06] pt-3")}>
                  {mechanisms.map((m) => {
                    const mc = MOMENT[m.tone].color;
                    return (
                      <li key={m.key} className="flex gap-2.5">
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: mc, boxShadow: `0 0 0 3px ${mc}22` }} />
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold" style={{ color: mc }}>{m.label}</div>
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{m.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ins.lap_range && ins.lap_range.length > 0 && (
              <span className="chip"><Flag size={11} /> Lap {ins.lap_range.join("–")}</span>
            )}
            {ins.drivers.length > 0 && onFocus && (
              <button className="chip hover:text-ink" onClick={() => onFocus(ins.drivers.slice(0, 6))}>
                Show on position chart
              </button>
            )}
            <span className="ml-auto text-[11px] uppercase tracking-wider text-ink-faint">
              {ins.confidence} confidence
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
