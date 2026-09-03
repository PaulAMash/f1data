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

export type PhoneScreen = "story" | "charts" | "ask";

export function PhoneMock({ compact = false, screen = "story", className }: {
  compact?: boolean; screen?: PhoneScreen; className?: string;
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
          <Screen compact={compact} screen={screen} />
        </div>
      </div>
    </div>
  );
}

/** What the screen shows. Structure and design language, no asserted result.
 *  Three variants so the marketing page can show three different rooms of the
 *  app rather than the same screen three times — all under the same rule:
 *  real section names, real compound colours, no lap time, no driver. */
const SCREEN_TITLE: Record<PhoneScreen, [string, string]> = {
  story: ["Race", "Story"], charts: ["Position", "Chart"], ask: ["Ask", "Anything"],
};
const SCREEN_TAB: Record<PhoneScreen, string> = {
  story: "Story", charts: "Charts", ask: "Ask",
};

function Screen({ compact, screen }: { compact: boolean; screen: PhoneScreen }) {
  const [t1, t2] = SCREEN_TITLE[screen];
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
          {t1}<span className="text-accent-soft"> {t2}</span>
        </span>
        <span className="ml-auto rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          Race
        </span>
      </div>

      <div className={cx("min-h-0 flex-1 space-y-2.5 overflow-hidden",
        compact ? "px-2.5 pt-2.5" : "px-3.5 pt-3.5")}>
        {screen === "charts" && <ChartsBody compact={compact} />}
        {screen === "ask" && <AskBody compact={compact} />}
        {screen === "story" && <>
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
        </>}
      </div>

      {/* the tab bar — the app's own section names */}
      <div className={cx("mt-auto grid grid-cols-4 border-t border-white/[0.06] bg-base-900/80 px-2 pt-2.5",
        compact ? "pb-3" : "pb-4")}>
        {["Story", "Charts", "Strategy", "Ask"].map((label) => (
          <span key={label}
            className={cx("text-center text-[9px] font-medium",
              label === SCREEN_TAB[screen] ? "text-accent-soft" : "text-ink-faint")}>
            {label}
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

/* ---- the Charts room: the position trace as the hero, tyres beneath ------- */
function ChartsBody({ compact }: { compact: boolean }) {
  return (
    <>
      <div className={cx("rounded-xl border border-white/[0.06] bg-base-850/60", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-baseline justify-between">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Position</p>
          <p className="font-mono text-[8.5px] text-ink-faint">P1 — P10</p>
        </div>
        {/* the same trace, given the whole room: drawn twice as tall, with
            the neutralisation band and pit dots the real chart carries */}
        <TallTrace className="mt-2" compact={compact} />
        <div className="mt-2 flex items-center gap-3 border-t border-white/[0.05] pt-2">
          <span className="flex items-center gap-1 text-[8px] text-ink-faint">
            <span className="h-[3px] w-3 rounded-full" style={{ background: "rgb(var(--amber) / .5)" }} />
            Safety car
          </span>
          <span className="flex items-center gap-1 text-[8px] text-ink-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Pit stop
          </span>
        </div>
      </div>
      <div className={cx("rounded-xl border border-white/[0.06] bg-base-850/60", compact ? "p-2.5" : "p-3")}>
        <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Tyres</p>
        <div className="mt-2 space-y-1.5">
          <StintRow widths={[42, 34, 24]} />
          <StintRow widths={[30, 46, 24]} order={[1, 0, 2]} />
          <StintRow widths={[52, 48]} order={[2, 1]} />
          {!compact && <StintRow widths={[24, 40, 36]} order={[0, 2, 1]} />}
        </div>
      </div>
    </>
  );
}

function TallTrace({ className, compact }: { className?: string; compact?: boolean }) {
  const lines = [
    { d: "M2,52 C22,48 34,22 56,18 C78,14 96,12 118,10", c: "rgb(var(--accent))", w: 1.7, delay: ".05s" },
    { d: "M2,16 C24,20 38,40 58,44 C80,48 98,36 118,30", c: "rgb(var(--speed))", w: 1.4, delay: ".2s" },
    { d: "M2,32 C24,34 36,52 58,58 C80,64 98,54 118,48", c: "rgb(var(--ink-faint))", w: 1.1, delay: ".35s" },
    { d: "M2,66 C24,64 40,60 58,64 C80,68 98,66 118,62", c: "rgb(var(--ink-faint) / .55)", w: 1, delay: ".5s" },
  ];
  return (
    <svg viewBox="0 0 120 78" className={cx(compact ? "h-[96px] w-full" : "h-[128px] w-full", className)}
      aria-hidden>
      {[16, 32, 48, 64].map((y) => (
        <line key={y} x1="0" y1={y} x2="120" y2={y} stroke="rgb(var(--tint) / .04)" strokeWidth=".6" />
      ))}
      <rect x="50" y="0" width="18" height="78" fill="rgb(var(--amber) / .10)" />
      <line x1="50" y1="0" x2="50" y2="78" stroke="rgb(var(--amber) / .35)" strokeWidth=".5" />
      {lines.map((l) => (
        <path key={l.d} d={l.d} fill="none" stroke={l.c} strokeWidth={l.w}
          strokeLinecap="round" className="hero-trace" style={{ animationDelay: l.delay }} />
      ))}
      <circle cx="53" cy="34" r="2.4" fill="rgb(var(--accent))" />
      <circle cx="70" cy="44" r="2" fill="rgb(var(--speed))" />
    </svg>
  );
}

/* ---- the Ask room: a short exchange in the product's own registers -------- */
function AskBody({ compact }: { compact: boolean }) {
  return (
    <>
      <div className="space-y-2">
        <span className="ml-auto block w-fit max-w-[85%] rounded-xl rounded-br-sm bg-white/[0.07] px-2.5 py-1.5 text-[10px] leading-snug text-ink-muted">
          Why did he lose the lead?
        </span>
        <div className={cx("rounded-xl border border-accent/20 bg-accent/[0.05]", compact ? "p-2.5" : "p-3")}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-accent-soft">
            Short answer
          </p>
          <p className={cx("mt-1.5 font-semibold leading-snug text-ink",
            compact ? "text-[11px]" : "text-[12.5px]")}>
            The stop before the safety car
          </p>
          <p className="mt-1 text-[10px] leading-snug text-ink-faint">
            Pitting a lap early meant paying full price for a stop the field
            got at a discount.
          </p>
        </div>
      </div>
      <div className={cx("rounded-xl border border-white/[0.06] bg-base-850/60", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-center justify-between">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Evidence</p>
          <span className="rounded-[4px] bg-white/[0.06] px-1.5 py-px text-[7.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">
            High confidence
          </span>
        </div>
        <ul className="mt-1.5 space-y-1">
          {["Where the gap opened", "What the stop cost", "The laps either side"].map((t) => (
            <li key={t} className="flex items-center gap-1.5 text-[9.5px] text-ink-muted">
              <span className="h-1 w-1 shrink-0 rounded-full bg-accent-soft/70" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-1.5">
          {["Was the undercut on?", "Who had the best pace?"].map((t) => (
            <span key={t} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] text-ink-faint">
              {t}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
