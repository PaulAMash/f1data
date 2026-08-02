"use client";
import type {
  ClassificationRow, PitStop, RaceInsight, RaceSession, Stint, StrategySummary,
} from "./types";
import { COMPOUND_LABEL, compoundKnown } from "./compounds";
import {
  EVENT, deriveWindows, undercutStory, type MomentClass, type Win,
} from "./raceEvents";

/* -------------------------------------------------------------------------- */
/* WHY was it decisive?                                                        */
/*                                                                            */
/* A strategy card could already say WHAT happened ("Piastri stopped on lap    */
/* 34") and, when the backend had one, a sentence of general context. Neither  */
/* answers the question a debrief exists to answer, which is what the call did */
/* to the race. Races are not decided by stops; they are decided by four or    */
/* five recognisable MECHANISMS, and once a reader can name them they start    */
/* seeing them unprompted in the next race they watch:                        */
/*                                                                            */
/*   safety-car timing   the stop was taken while the field was slowed         */
/*   the undercut        fresh tyres used to take a place in the pit cycle      */
/*   track position      the pit cycle cost nothing — or cost a place           */
/*   the tyre offset     finishing on a different, fresher rubber to a rival    */
/*                                                                            */
/* Every mechanism here is DETECTED, never assumed. Each one is a claim about  */
/* this session that is checked against this session's pit stops, position     */
/* trace, stints and classification, and a mechanism that cannot be verified   */
/* is simply not stated. A card with no detectable mechanism falls back to the */
/* explanation it always had — the flourish fails to no flourish, never to a   */
/* confident sentence about a thing that did not happen.                       */
/* -------------------------------------------------------------------------- */

export interface Mechanism {
  key: string;
  /** The named mechanism — the thing a reader should learn to recognise. */
  label: string;
  /** One sentence, carrying this race's own numbers. */
  detail: string;
  tone: MomentClass;
}

export interface DecisiveContext {
  windows: Win[];
  stopsBy: Map<string, PitStop[]>;
  stintsBy: Map<string, Stint[]>;
  classBy: Map<string, ClassificationRow>;
  /** driver → lap → position */
  posBy: Map<string, Map<number, number>>;
  /** classification in finishing order, for "who were they actually racing?" */
  order: ClassificationRow[];
  nameOf: (code: string) => string;
  avgPitLoss?: number | null;
  strategy: StrategySummary;
}

export function decisiveContext(session: RaceSession, strategy: StrategySummary): DecisiveContext {
  const stopsBy = new Map<string, PitStop[]>();
  for (const p of session.pit_stops) {
    if (!stopsBy.has(p.driver)) stopsBy.set(p.driver, []);
    stopsBy.get(p.driver)!.push(p);
  }
  for (const arr of stopsBy.values()) arr.sort((a, b) => a.lap - b.lap);

  const stintsBy = new Map<string, Stint[]>();
  for (const s of session.stints) {
    if (!stintsBy.has(s.driver)) stintsBy.set(s.driver, []);
    stintsBy.get(s.driver)!.push(s);
  }
  for (const arr of stintsBy.values()) arr.sort((a, b) => a.stint - b.stint);

  const posBy = new Map<string, Map<number, number>>();
  for (const p of session.positions) {
    if (!posBy.has(p.driver)) posBy.set(p.driver, new Map());
    posBy.get(p.driver)!.set(p.lap, p.position);
  }

  const classBy = new Map(session.classification.map((c) => [c.driver, c]));
  const names = new Map(session.drivers.map((d) => [d.code, d.name]));

  return {
    windows: deriveWindows(session),
    stopsBy, stintsBy, classBy, posBy,
    order: [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    nameOf: (code) => names.get(code) ?? code,
    avgPitLoss: strategy.avg_pit_loss,
    strategy,
  };
}

/**
 * Which stop is this moment about?
 *
 * Most insights name a lap range and the answer is obvious. When they don't,
 * two resolutions are still safe: a driver with exactly one stop can only mean
 * that one, and a driver with exactly one stop taken under a neutralisation
 * can only mean that one on a card about pit timing. Anything more ambiguous
 * returns nothing rather than guessing, because attributing a mechanism to the
 * wrong stop is worse than attributing none.
 */
function pickStop(ins: RaceInsight, code: string, ctx: DecisiveContext): PitStop | null {
  const stops = ctx.stopsBy.get(code) ?? [];
  if (!stops.length) return null;
  const lo = ins.lap_range?.[0];
  if (lo != null) {
    const hi = ins.lap_range?.[1] ?? lo;
    const hit = stops.find((s) => s.lap >= lo - 1 && s.lap <= hi + 1);
    if (hit) return hit;
  }
  const neutral = stops.filter((s) => inWindow(s.lap, ctx.windows) || s.under_vsc || s.under_safety_car);
  if (neutral.length === 1) return neutral[0];
  if (stops.length === 1) return stops[0];
  return null;
}

const inWindow = (lap: number, windows: Win[]) => windows.find((w) => lap >= w.start && lap <= w.end) ?? null;

/** The car this driver was actually racing: the one classified directly ahead. */
function rivalOf(code: string, ctx: DecisiveContext): ClassificationRow | null {
  const i = ctx.order.findIndex((c) => c.driver === code);
  if (i < 0) return null;
  return ctx.order[i - 1] ?? ctx.order[i + 1] ?? null;
}

/** "Lewis Hamilton" → "Hamilton". Second and later mentions in a sentence. */
function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

/**
 * When the pit cycle is over.
 *
 * Reading track position two laps after a stop is not reading the pit cycle,
 * it is reading the middle of it: the cars ahead have not stopped yet, so the
 * driver is always behind, and the card would announce that a successful
 * undercut "traded track position" on the same screen as the undercut it won.
 *
 * The cycle closes when every car that was ahead on the lap before the stop
 * has taken its own next stop. Bounded two ways so it stays a pit cycle and
 * not the rest of the race: never past this driver's NEXT stop (which would
 * measure two decisions as one), and never more than 15 laps out.
 */
function settleLap(code: string, stop: PitStop, before: number, ctx: DecisiveContext): number {
  const total = Math.max(...[...(ctx.posBy.get(code)?.keys() ?? [1])]);
  const mine = ctx.stopsBy.get(code) ?? [];
  const next = mine.find((s) => s.lap > stop.lap);
  const ceiling = Math.min(next ? next.lap - 1 : total, stop.lap + 15, total);

  let settled = stop.lap + 2;
  for (const [rival, trace] of ctx.posBy) {
    if (rival === code) continue;
    const rp = trace.get(stop.lap - 1);
    if (rp == null || rp >= before) continue;          // was not ahead
    const theirs = (ctx.stopsBy.get(rival) ?? []).find((s) => s.lap >= stop.lap);
    if (theirs) settled = Math.max(settled, theirs.lap + 1);
  }
  return Math.max(stop.lap + 1, Math.min(settled, ceiling));
}

export function mechanismsFor(ins: RaceInsight, ctx: DecisiveContext): Mechanism[] {
  const code = ins.drivers[0];
  if (!code) return [];
  const out: Mechanism[] = [];
  const stop = pickStop(ins, code, ctx);
  const who = ctx.nameOf(code);

  /* ---- 1. the stop was taken while the field was slowed ------------------ */
  if (stop) {
    const w = inWindow(stop.lap, ctx.windows);
    if (w || stop.under_vsc || stop.under_safety_car) {
      const label = w ? EVENT[w.kind].label : stop.under_safety_car ? "Safety Car" : "Virtual Safety Car";
      const span = w ? ` (laps ${w.start}–${w.end})` : "";
      const cost = ctx.avgPitLoss != null
        ? ` A green-flag stop cost the field about ${ctx.avgPitLoss.toFixed(0)}s of race time in this session; this one cost a fraction of it.`
        : "";
      out.push({
        key: "sc",
        label: "Benefited from safety-car timing",
        tone: "gain",
        detail: `${who} stopped on lap ${stop.lap}, inside the ${label}${span}. Everyone else was slowed too, so the pit lane was almost free.${cost}`,
      });
    }
  }

  /* ---- 2. the undercut, from either end ----------------------------------
     Only when it belongs to THIS moment. A card about a driver's long closing
     stint is not a card about the undercut they pulled forty laps earlier, and
     attaching it there taught the reader that the tag means nothing. */
  const lo = ins.lap_range?.[0], hi = ins.lap_range?.[1] ?? lo;
  const nearThisMoment = (pitLap: number) =>
    ins.kind === "undercut" || ins.kind === "overcut"
    || lo == null
    || (pitLap >= lo - 2 && pitLap <= (hi ?? lo) + 2);

  const asAttacker = ctx.strategy.undercuts.find((u) => u.attacker === code && nearThisMoment(u.pit_lap));
  const asVictim = ctx.strategy.undercuts.find((u) => u.victim === code && nearThisMoment(u.pit_lap));
  const pos = (lap: number) => ctx.posBy.get(code)?.get(lap);
  if (asAttacker) {
    const story = undercutStory(asAttacker, ctx.nameOf,
      (c) => ctx.classBy.get(c)?.position ?? null);
    out.push({
      key: "uc",
      label: asAttacker.kind === "overcut" ? "Forced the rival to react — overcut" : "Forced the rival into the pit cycle",
      tone: asAttacker.gained ? "gain" : "loss",
      detail: story.outcome,
    });
  } else if (asVictim) {
    const story = undercutStory(asVictim, ctx.nameOf,
      (c) => ctx.classBy.get(c)?.position ?? null);
    out.push({
      key: "uc-v",
      label: "Was caught by the undercut",
      tone: asVictim.gained ? "loss" : "read",
      detail: `${surname(ctx.nameOf(asVictim.attacker))} stopped first on lap ${asVictim.pit_lap} and ${surname(who)} had to answer on older tyres. ${story.outcome}`,
    });
  }

  /* ---- 3. what the pit cycle did to track position -----------------------
     Skipped when an undercut on this same stop has already answered it. Two
     mechanisms describing one stop with opposite signs — "came out ahead of
     Norris" above "went from P3 to P4" — is not two insights, it is a card
     arguing with itself. The undercut is the more specific claim, so it wins. */
  const ucCovers = !!asAttacker && !!stop && Math.abs(asAttacker.pit_lap - stop.lap) <= 1;
  if (stop && !ucCovers) {
    const before = pos(stop.lap - 1);
    if (before != null) {
      const at = settleLap(code, stop, before, ctx);
      const after = pos(at);
      if (after != null) {
        if (after <= before) {
          out.push({
            key: "pos",
            label: after === before ? "Protected track position" : "Gained places in the pit cycle",
            tone: "gain",
            detail: after === before
              ? `${who} went into the stop P${before} on lap ${stop.lap} and was back in P${after} by lap ${at}, once the cars around them had stopped too — the pit cycle cost nothing on track.`
              : `${who} came out of the cycle ahead of where they went in: P${before} on lap ${stop.lap}, P${after} by lap ${at}.`,
          });
        } else {
          out.push({
            key: "pos",
            label: "Traded track position for tyre life",
            tone: "loss",
            detail: `Across the pit cycle ${surname(who)} went from P${before} to P${after} by lap ${at}. That is only a good trade if the fresher tyre wins the places back — which is the bet the pit wall was making.`,
          });
        }
      }
    }
  }

  /* ---- 4. the tyre offset at the flag ------------------------------------
     An offset is what a stop LEAVES BEHIND, so it is only named where the stop
     that created it can be pointed at — or on a card that is explicitly a
     verdict on the whole strategy. */
  const mine = lastNamedStint(ctx.stintsBy.get(code));
  const rival = rivalOf(code, ctx);
  const theirs = rival ? lastNamedStint(ctx.stintsBy.get(rival.driver)) : null;
  const offsetApplies = stop != null || ins.kind === "best_strategy" || ins.kind === "worst_strategy";
  if (offsetApplies && mine && rival && theirs) {
    const lead = theirs.start_lap - mine.start_lap; // >0 means the RIVAL is fresher
    const diffCompound = mine.compound !== theirs.compound;
    const gap = Math.abs(lead);
    if (diffCompound || gap >= 4) {
      const rn = surname(ctx.nameOf(rival.driver));
      const age = gap >= 4
        ? lead < 0
          ? ` — a ${gap}-lap tyre advantage to ${surname(who)}`
          : ` — a ${gap}-lap tyre advantage to ${rn}`
        : "";
      out.push({
        key: "offset",
        label: "Created a tyre offset",
        tone: lead < 0 ? "gain" : diffCompound && gap < 4 ? "read" : "loss",
        detail: diffCompound
          ? `${who} finished on the ${COMPOUND_LABEL[mine.compound]} fitted on lap ${mine.start_lap}; ${rn}, the car they were racing, ran the ${COMPOUND_LABEL[theirs.compound]} from lap ${theirs.start_lap}${age}. Different rubber means the two cars were quick at different points of the run.`
          : `${who} took their last set on lap ${mine.start_lap}, ${rn} on lap ${theirs.start_lap}${age}. Same compound, different age — which is where the late-race pace difference came from.`,
      });
    }
  }

  return out.slice(0, 3);
}

function lastNamedStint(stints?: Stint[]): Stint | null {
  if (!stints?.length) return null;
  const last = stints[stints.length - 1];
  return compoundKnown(last.compound) ? last : null;
}
