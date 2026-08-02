"use client";
import { createPortal } from "react-dom";
import { useHoverTip } from "@/lib/useHoverTip";
import { cx } from "@/lib/format";

// Plain-English glossary for F1 jargon. A <Term> renders the word with a dotted
// underline and shows the definition on hover — so a new fan can learn as they go.
export const GLOSSARY: Record<string, string> = {
  stint: "A run on one set of tyres, between pit stops.",
  undercut: "Pitting for fresh tyres before a rival, using the extra grip to jump ahead when they stop.",
  overcut: "Staying out on older tyres longer than a rival, then pitting later and coming out ahead.",
  degradation: "How much slower a tyre gets as it wears through a stint.",
  delta: "The time difference between two cars or two laps.",
  "pit loss": "The total time a stop costs — driving through the pit lane plus the stationary time.",
  "out lap": "The first lap after leaving the pits, on cold tyres.",
  "in lap": "The lap coming into the pits, usually slower.",
  "clean air": "Running with no car directly ahead, so no disturbed airflow slowing you down.",
  traffic: "Being stuck behind slower cars, losing time in their dirty air.",
  vsc: "Virtual Safety Car — the whole field slows to a set delta after an incident; a cheap time to pit.",
  "safety car": "A real car leads the bunched-up field slowly after a serious incident.",
  interval: "The time gap to the car directly ahead.",
  gap: "The time behind the leader.",
  "tyre age": "How many laps a set of tyres has completed.",
  "clean-air pace": "A car's true one-lap speed once fuel load and tyre type are accounted for.",
  "representative pace": "Lap times that reflect real speed, ignoring laps distorted by traffic, pits or fuel.",
  compound: "The tyre type — Soft (fastest, wears quickest), Medium, or Hard (slowest, most durable).",
  "long run": "A longer practice stint used to gauge race pace rather than one-lap speed.",
  grid: "The starting order, set by qualifying.",
  "tyre-limited": "Lap times fell away noticeably through their stints — pace was capped by tyre wear rather than outright car speed.",
  // qualifying glossary
  "track evolution": "As more cars run, rubber builds up on the racing line and increases grip. This usually makes the circuit faster later in the session.",
  "pole margin": "How much faster the pole lap was than the second-quickest car's best lap.",
  "theoretical lap": "The lap you'd get by adding a driver's (or the session's) best individual sectors together — the perfect lap nobody quite drove.",
  "deleted lap": "A lap time removed by race control, usually for running beyond track limits. A deleted lap can knock a driver out of a segment.",
  sector: "Circuits are split into three timed chunks (Sectors 1, 2, 3). Comparing sectors shows exactly where a lap was won or lost.",
  q1: "The first knockout segment of qualifying — every car runs, and the slowest five are eliminated.",
  q2: "The middle knockout segment — the next five slowest are eliminated, leaving ten to fight for pole.",
  q3: "The final top-ten shootout that decides pole position and the front of the grid.",
  "out in q1": "Eliminated in the first qualifying segment — they'll start near the back.",
  "out in q2": "Eliminated in the middle qualifying segment — they'll start between P11 and P15.",
  "push lap": "A flat-out timed lap, as opposed to warming up or cooling the tyres.",
  "flying lap": "A lap started at full speed (not from the pits) — the laps that actually count in qualifying.",
  "cool-down lap": "A slow lap between push laps to bring tyre temperatures back into their ideal window.",
  "track limits": "The white lines defining the edge of the circuit. Put all four wheels beyond them and the lap time is deleted.",
  "representative lap": "A lap time that reflects genuine pace — not spoiled by traffic, weather or a mistake.",
  "teammate delta": "The gap between two drivers in identical cars — the cleanest measure of driver performance.",
  "session progression": "How the benchmark time falls from Q1 to Q3 as fuel comes down, softer tyres go on and the track gains grip.",

  // --- session-state vocabulary -------------------------------------------
  // Words the app puts in front of a user as a label or a statistic. Anything
  // that appears in a card, meter, stat strip or column header belongs here:
  // the micro-learning system wraps these automatically, so a term that isn't
  // defined is a term that ships unexplained.
  stoppage: "A red flag — the session is halted completely and cars return to the pit lane.",
  stoppages: "Red flags: moments the session was halted completely and cars returned to the pit lane.",
  neutralisation: "Any period where racing is suspended but the session continues — a Safety Car or a Virtual Safety Car.",
  neutralisations: "Periods where racing was suspended but the session continued — Safety Cars and Virtual Safety Cars.",
  neutralization: "Any period where racing is suspended but the session continues — a Safety Car or a Virtual Safety Car.",
  neutralizations: "Periods where racing was suspended but the session continued — Safety Cars and Virtual Safety Cars.",
  interruption: "Anything that stops or neutralises the session: a red flag, a Safety Car or a VSC. Local yellow flags are counted separately.",
  interruptions: "Anything that stopped or neutralised the session: red flags, Safety Cars and VSCs. Local yellow flags are counted separately.",
  "local yellow": "A yellow flag shown in one sector only. Drivers must slow through that sector, which ruins the lap — but the session keeps running.",
  "local yellows": "Yellow flags shown in a single sector. Drivers must slow through that sector, ruining the lap — but the session keeps running.",
  "red flag": "The session is stopped. Cars return to the pit lane and the clock is paused until it restarts.",
  "cars timed": "How many drivers set a valid lap time. Cars that never ran, or whose only laps were deleted, aren't counted.",
  retirement: "A car that stopped before the finish — mechanical failure, accident damage or a crash.",
  retirements: "Cars that stopped before the finish — mechanical failure, accident damage or crashes.",
  finishers: "Cars still running at the chequered flag, out of the number that started.",
  margin: "The gap between first and second — how much the leader had in hand.",
  "closest margin": "The smallest gap between any two neighbouring cars in the top ten — the tightest fight of the session.",
  "grid penalty": "Places a driver loses on the starting grid as a steward's decision, usually for a component change or an on-track incident.",
  starts: "The official starting grid position after penalties and steward decisions — which can differ from where a driver qualified.",
  "pace advantage": "Who was quicker on track over the laps both drivers ran, with pit laps excluded. It measures speed, not the finishing gap.",
  steadiness: "How tightly a driver's push laps cluster together. A metronomic driver repeats the same lap time; an erratic one doesn't.",
  "time found": "How much quicker a driver's best lap got between their first run and their last, as the track gained grip and fuel came off.",
  "track time": "How many laps a driver completed. More laps means more tyre and setup data for the team.",
  spread: "The difference between the fastest and slowest lap in a set — small spread means consistent, large spread means erratic.",
  "one-lap pace": "Outright speed over a single flying lap, on low fuel — what qualifying rewards.",
  "long-run pace": "Median lap time over a driver's longest continuous run — the closest read on race pace available from practice.",
  constructor: "The team that builds and enters the car. Both of a constructor's drivers use the same machinery, which is why teammate comparisons matter.",
  constructors: "The teams that build and enter the cars. Both of a constructor's drivers use the same machinery, which is why teammate comparisons matter.",
  "turning point": "The moment in the session that most changed the outcome — usually a neutralisation, a pit call or an incident.",
  "lead change": "A lap where the two cars being compared swapped places.",
  "pit stop": "A stop for fresh tyres. It costs roughly 20 seconds in total, so when you take one matters as much as how quick it is.",
  "pit-lane loss": "The total time lost driving through the pit lane and standing still, compared with staying out on track.",
  humidity: "How much moisture is in the air. High humidity reduces engine power slightly and can hint at rain arriving.",
  wind: "Wind speed and direction. A headwind into a braking zone adds stability; a tailwind makes the car harder to slow.",
  "air temp": "The ambient air temperature.",
  "track temp": "The temperature of the tarmac itself, usually well above air temperature. It drives how quickly tyres reach — and pass — their working window.",
  "working window": "The temperature range where a tyre compound gives its best grip. Too cold and it won't switch on; too hot and it grains or blisters.",
  "chequered flag": "The flag that ends the session.",
  "banker lap": "A safe, early lap set to guarantee a time on the board in case a red flag or rain ends the session prematurely.",
};

export function Term({ children, term }: { children: React.ReactNode; term?: string }) {
  const key = (term ?? String(children)).toLowerCase();
  const def = GLOSSARY[key];
  // rendered via a body portal at a fixed position — an absolutely positioned
  // popup gets clipped invisible inside any overflow-hidden card
  const { at: pos, open, close } = useHoverTip<{ x: number; y: number }>();
  if (!def) return <>{children}</>;
  return (
    <span className="relative inline"
      onMouseEnter={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        open({ x: r.left, y: r.top });
      }}
      onMouseLeave={close}>
      <span className={cx("cursor-help underline decoration-dotted decoration-ink-faint underline-offset-2 transition-colors duration-200 hover:decoration-accent-soft")}>
        {children}
      </span>
      {pos && typeof document !== "undefined" && createPortal(
        // placement transform outside, entry animation inside — a keyframed
        // transform would otherwise cancel the translateY(-100%)
        <span className="pointer-events-none fixed z-[70] block w-64"
          style={{
            left: Math.min(Math.max(8, pos.x), (typeof window !== "undefined" ? window.innerWidth : 9999) - 272),
            top: Math.max(8, pos.y - 8),
            transform: "translateY(-100%)",
          }}>
          <span className="animate-tip-in block rounded-xl border border-white/[0.14] bg-base-900 p-3 text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-ink-muted shadow-glow">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">{key}</span>
            {def}
          </span>
        </span>,
        document.body,
      )}
    </span>
  );
}
