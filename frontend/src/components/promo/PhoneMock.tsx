"use client";
import { Radar } from "lucide-react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* THE iPHONE, DRAWN.                                                         */
/*                                                                            */
/* One device, used by the /app marketing page at full size and by the         */
/* landing page's promo band at `compact` size — extracted so the two can      */
/* never drift into two different phones.                                      */
/*                                                                            */
/* THERE ARE NO iOS SCREENSHOTS IN THIS REPOSITORY, so nothing here is         */
/* presented as a screen capture. The frame is CSS, and what the screen shows  */
/* is STRUCTURE drawn from this product's own tokens — a position trace with   */
/* unlabelled lines, real broadcast compound colours, the app's own section    */
/* names. It asserts no lap time, no driver and no result, because a           */
/* marketing surface that invents a race result is one that lies about         */
/* Formula 1. When real captures exist they replace the screen content here,   */
/* once, and every surface that shows the phone updates together.              */
/* -------------------------------------------------------------------------- */

export function PhoneMock({ compact = false, className }: {
  compact?: boolean; className?: string;
}) {
  return (
    <div className={cx("relative", className)}>
      {/* the light the device throws, in the accent, same as every other
          elevated surface in the product */}
      <span aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .16), transparent 70%)" }} />

      <div className={cx(
        "relative rounded-[2.4rem] border border-white/[0.10] bg-base-900",
        compact ? "w-[218px] p-2" : "w-[268px] p-2.5 sm:w-[300px]")}
        style={{ boxShadow: "var(--el-3)" }}>
        {/* the screen */}
        <div className="relative overflow-hidden rounded-[1.9rem] bg-base-950">
          {/* the island, drawn rather than notched — a pill is what a current
              iPhone actually shows and it reads at this size */}
          <span aria-hidden
            className={cx("absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-black/85",
              compact ? "h-[14px] w-[58px]" : "h-[18px] w-[74px]")} />
          <Screen compact={compact} />
        </div>
      </div>
    </div>
  );
}

/** What the screen shows. Structure and design language, no asserted result. */
function Screen({ compact }: { compact: boolean }) {
  return (
    <div className={cx("flex flex-col", compact ? "h-[380px] pt-7" : "h-[560px] pt-9 sm:h-[600px]")}>
      {/* app header */}
      <div className={cx("flex items-center gap-2 border-b border-white/[0.06] pb-2.5",
        compact ? "px-3" : "px-4 pb-3")}>
        <span className={cx("grid shrink-0 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30",
          compact ? "h-5 w-5" : "h-6 w-6")}>
          <Radar size={compact ? 11 : 13} className="text-accent-soft" />
        </span>
        <span className={cx("font-semibold tracking-tight text-ink",
          compact ? "text-[11px]" : "text-[12.5px]")}>
          Race<span className="text-accent-soft"> Story</span>
        </span>
        <span className="ml-auto rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          Race
        </span>
      </div>

      <div className={cx("min-h-0 flex-1 space-y-2.5 overflow-hidden",
        compact ? "px-2.5 pt-2.5" : "px-3.5 pt-3.5")}>
        {/* the answer-first card the product leads every race with */}
        <div className={cx("rounded-xl border border-accent/20 bg-accent/[0.05]", compact ? "p-2.5" : "p-3")}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-accent-soft">
            Turning point
          </p>
          <p className={cx("mt-1.5 font-semibold leading-snug text-ink",
            compact ? "text-[11px]" : "text-[12.5px]")}>
            The lap the lead changed hands
          </p>
          {!compact && (
            <p className="mt-1 text-[10.5px] leading-snug text-ink-faint">
              Why it mattered, and what it cost.
            </p>
          )}
        </div>

        {/* the position trace: shape only, no driver carries a name */}
        <div className={cx("rounded-xl border border-white/[0.06] bg-base-850/60", compact ? "p-2.5" : "p-3")}>
          <div className="flex items-baseline justify-between">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Position</p>
            <p className="font-mono text-[8.5px] text-ink-faint">P1 — P10</p>
          </div>
          <TraceArt className="mt-2" compact={compact} />
        </div>

        {/* stints: real broadcast compound colours, no attribution */}
        <div className={cx("rounded-xl border border-white/[0.06] bg-base-850/60", compact ? "p-2.5" : "p-3")}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Tyres</p>
          <div className="mt-2 space-y-1.5">
            <StintRow widths={[42, 34, 24]} />
            <StintRow widths={[30, 46, 24]} order={[1, 0, 2]} />
            {!compact && <StintRow widths={[52, 48]} order={[2, 1]} />}
          </div>
        </div>

        {/* clean-air pace, which is the product's own signature measurement —
            positions on the left, bars for relative pace, nobody named */}
        {!compact && (
          <div className="rounded-xl border border-white/[0.06] bg-base-850/60 p-3">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">
              Clean-air pace
            </p>
            <div className="mt-2 space-y-[5px]">
              {[["P1", 96], ["P2", 88], ["P3", 79], ["P4", 74]].map(([pos, w], i) => (
                <div key={String(pos)} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 font-mono text-[8px] text-ink-faint">{pos}</span>
                  <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <span className="block h-full rounded-full"
                      style={{
                        width: `${w}%`,
                        background: i === 0 ? "rgb(var(--accent))" : "rgb(var(--ink-faint) / .5)",
                      }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* the tab bar — the app's own section names */}
      <div className={cx("mt-auto grid grid-cols-4 border-t border-white/[0.06] bg-base-900/80 px-2 pt-2.5",
        compact ? "pb-3" : "pb-4")}>
        {[["Story", true], ["Charts", false], ["Strategy", false], ["Ask", false]].map(([label, on]) => (
          <span key={String(label)}
            className={cx("text-center text-[9px] font-medium",
              on ? "text-accent-soft" : "text-ink-faint")}>
            {String(label)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The position trace. `hero-trace` draws the lines in and is already
 *  reduced-motion aware (globals.css), so this needs no rule of its own. */
function TraceArt({ className, compact }: { className?: string; compact?: boolean }) {
  const lines = [
    { d: "M2,26 C22,24 34,10 56,9 C78,8 96,6 118,5", c: "rgb(var(--accent))", w: 1.6, delay: ".05s" },
    { d: "M2,8 C24,10 38,20 58,22 C80,24 98,17 118,14", c: "rgb(var(--speed))", w: 1.3, delay: ".2s" },
    { d: "M2,16 C24,17 36,26 58,29 C80,32 98,26 118,23", c: "rgb(var(--ink-faint))", w: 1.1, delay: ".35s" },
    { d: "M2,34 C24,33 40,30 58,33 C80,36 98,33 118,31", c: "rgb(var(--ink-faint) / .55)", w: 1, delay: ".5s" },
  ];
  return (
    <svg viewBox="0 0 120 40" className={cx(compact ? "h-[48px] w-full" : "h-[62px] w-full", className)}
      aria-hidden>
      {/* a neutralisation window, the one band the product always draws */}
      <rect x="52" y="0" width="17" height="40" fill="rgb(var(--amber) / .10)" />
      <line x1="52" y1="0" x2="52" y2="40" stroke="rgb(var(--amber) / .35)" strokeWidth=".5" />
      {lines.map((l) => (
        <path key={l.d} d={l.d} fill="none" stroke={l.c} strokeWidth={l.w}
          strokeLinecap="round" className="hero-trace" style={{ animationDelay: l.delay }} />
      ))}
    </svg>
  );
}

const STINT_COLORS = ["#ff3b3b", "#ffcf3f", "#e7ecf3"];   // soft / medium / hard
const STINT_LETTERS = ["S", "M", "H"];

export function StintRow({ widths, order = [0, 1, 2] }: { widths: number[]; order?: number[] }) {
  return (
    <div className="flex h-3.5 gap-[3px]">
      {widths.map((w, i) => {
        const c = order[i] ?? i;
        return (
          <span key={i} style={{ width: `${w}%`, background: STINT_COLORS[c] }}
            className="grid place-items-center rounded-[3px] text-[7.5px] font-bold text-black/75">
            {STINT_LETTERS[c]}
          </span>
        );
      })}
    </div>
  );
}
