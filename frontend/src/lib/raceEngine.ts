/* -------------------------------------------------------------------------- */
/* The engine under the hero.                                                 */
/*                                                                            */
/* Everything before this was a drawing that resembled data. Lines were sine   */
/* composites: smooth, endless, and completely disconnected from one another.  */
/* Nothing could happen in that world, because there was nothing there to      */
/* happen TO — no running order, no gaps, no cars that knew about each other.  */
/* Which is why it stopped being interesting after four seconds.               */
/*                                                                            */
/* This is a small race instead. Seven cars hold a continuous running order, a */
/* director stages moments into it, and the renderer draws whatever the        */
/* simulation happens to be doing. The consequence worth the whole rewrite:    */
/*                                                                            */
/*     X IS TIME, AND THE RIGHT EDGE IS NOW.                                   */
/*                                                                            */
/* Every driver's position is recorded on a fixed tick. The curve at any x is  */
/* where that car was `age(x)` seconds ago. So the field does not "scroll" —   */
/* history simply gets older and slides left, exactly as a live timing trace   */
/* does. An overtake is authored at the right edge and then travels the width  */
/* of the screen as a thing that already happened. That is the difference      */
/* between motion and narrative, and it is free once time is the x axis.       */
/*                                                                            */
/* Nothing here is random in the sense the reader would resent. The PRNG is    */
/* seeded with a constant, so the sequence is identical on the server and the  */
/* client (no hydration mismatch) and identical between reloads — but it is    */
/* long, and no two moments carry the same parameters.                         */
/* -------------------------------------------------------------------------- */

/** Deterministic, tiny, good enough. Seeded once so SSR and CSR agree. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoother = (k: number) => k * k * k * (k * (k * 6 - 15) + 10);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---- the field ----------------------------------------------------------- */
/* One car per constructor, so every line is a different hue and the reader can
   follow an individual without a legend. Seven is the ceiling: past that the
   scene stops being legible and starts being busy, which the brief is explicit
   about not wanting. */
export interface Driver {
  code: string;
  team: string;
  /** on black — emitted light */
  dark: string;
  /** on white — absorbed light, deeper so it holds against paper */
  light: string;
}

export const DRIVERS: Driver[] = [
  { code: "NOR", team: "McLaren",   dark: "#ff8b1f", light: "#c2410c" },
  { code: "VER", team: "Red Bull",  dark: "#4f8ce0", light: "#1d4ed8" },
  { code: "LEC", team: "Ferrari",   dark: "#ff4d5e", light: "#be123c" },
  { code: "RUS", team: "Mercedes",  dark: "#27f4d2", light: "#0f766e" },
  { code: "ALO", team: "Aston",     dark: "#3fd18b", light: "#15803d" },
  { code: "GAS", team: "Alpine",    dark: "#57b6ff", light: "#0369a1" },
  { code: "HUL", team: "Sauber",    dark: "#b79bff", light: "#6d28d9" },
];

export const N = DRIVERS.length;

/** Seconds of race held across the width of the viewport. */
export const HISTORY_S = 22;
/** Fixed simulation tick for the history. Never varies, so nothing can drift. */
const STEP_S = 0.1;
const SAMPLES = Math.ceil(HISTORY_S / STEP_S) + 8;

/* ---- what the director can stage ----------------------------------------- */
export type BeatKind =
  | "overtake" | "drs" | "pit" | "safety" | "fastest" | "sector" | "yellow" | "deg";

export interface Annotation {
  id: number;
  kind: BeatKind;
  /** small caps line — what happened */
  label: string;
  /** the number, if there is one worth showing */
  value?: string;
  driver: number;
  born: number;
  /** 0..1 across the width, where it was born */
  bornU: number;
  /** a five-point series, drawn as a hairline chart on the card */
  spark?: number[];
}

export interface Pulse {
  driver: number;
  /** 0..1 across the width */
  u: number;
  speed: number;
  /** 0..1 — how hot this packet is */
  heat: number;
  born: number;
  life: number;
}

export interface Snapshot {
  leader: number;
  /** gap from P1 to P2, seconds */
  gap: number;
  /** running order, driver indices, P1 first */
  order: number[];
  ers: number;
  deg: number;
  trackTemp: number;
  lap: number;
  /** last three sector deltas for the leader, negative is an improvement */
  sectors: [number, number, number];
  /** what the director is doing, for the status line */
  status: string;
}

interface Car {
  /** continuous running position, 0 = leader */
  pos: number;
  from: number;
  to: number;
  moveStart: number;
  moveDur: number;
  /** slow personal drift so the trace breathes without wobbling */
  driftPhase: number;
  driftRate: number;
  nextPulse: number;
  ers: number;
  ersUp: boolean;
}

interface Effect {
  kind: BeatKind;
  start: number;
  dur: number;
  driver: number;
}

export class RaceEngine {
  t = 0;
  private rnd: () => number;
  private cars: Car[] = [];
  /** per-driver ring of positions, newest at `head` */
  private hist: Float32Array[] = [];
  private head = 0;
  private filled = 0;
  private acc = 0;

  /** global lane spread — the safety car squeezes this */
  spread = 1;
  private spreadTo = 1;
  /** global time scale — a yellow flag slows the whole picture */
  timeScale = 1;
  private timeTo = 1;

  annotations: Annotation[] = [];
  pulses: Pulse[] = [];
  private effects: Effect[] = [];
  private nextBeat = 6;
  private recent: BeatKind[] = [];
  private annId = 1;

  private lap = 34;
  private trackTemp = 41.4;
  private deg = 0.31;

  constructor(seed = 0x5eed1e) {
    this.rnd = mulberry32(seed);
    for (let i = 0; i < N; i++) {
      this.cars.push({
        pos: i, from: i, to: i, moveStart: 0, moveDur: 1,
        driftPhase: this.rnd() * Math.PI * 2,
        // spread around 1.0 so no two cars sweep on the same period
        driftRate: 0.048 + this.rnd() * 0.028,
        nextPulse: 1.5 + this.rnd() * 5,
        ers: 0.35 + this.rnd() * 0.5,
        ersUp: this.rnd() > 0.5,
      });
      const h = new Float32Array(SAMPLES);
      h.fill(i);
      this.hist.push(h);
    }
    this.filled = SAMPLES;
  }

  /* ---- reading the world ------------------------------------------------- */

  /**
   * Where driver `d` was `age` seconds ago, interpolated.
   *
   * Catmull-Rom rather than linear: at 0.1s ticks a linear read puts a visible
   * corner at every sample, and a hero made of corners is the thing this whole
   * rewrite exists to avoid.
   */
  posAt(d: number, age: number): number {
    const h = this.hist[d];
    const f = age / STEP_S;
    const i = Math.floor(f);
    const fr = f - i;
    const at = (k: number) => h[(((this.head - k) % SAMPLES) + SAMPLES) % SAMPLES];
    // ages beyond the buffer simply hold the oldest value — never a wrap, so
    // there is no seam where the ring meets itself
    if (i >= SAMPLES - 3) return at(SAMPLES - 3);
    const p0 = at(i - 1 < 0 ? 0 : i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const a = 2 * p1;
    const b = p2 - p0;
    const c = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const e = -p0 + 3 * p1 - 3 * p2 + p3;
    return 0.5 * (a + b * fr + c * fr * fr + e * fr * fr * fr);
  }

  /** The lane a car occupies now, including its slow personal drift. */
  private livePos(i: number, t: number): number {
    const c = this.cars[i];
    const k = c.moveDur <= 0 ? 1 : clamp01((t - c.moveStart) / c.moveDur);
    const base = c.from + (c.to - c.from) * smoother(k);
    /* Three slow terms, tuned against HISTORY_S rather than against taste.
       The width of the screen is 22 seconds, so a 33-second period shows as
       two-thirds of one graceful sweep — a current, not a wave. The faster
       terms are an order of magnitude smaller and only stop the sweep from
       looking like an arc. Total amplitude stays under half a lane, so lines
       lean toward each other and occasionally very nearly touch, but the
       running order is never in doubt. */
    const p = c.driftPhase;
    const drift =
      0.27 * Math.sin(t * 0.19 * c.driftRate * 16 + p) +
      0.14 * Math.sin(t * 0.33 + p * 1.7) +
      0.06 * Math.sin(t * 0.61 + p * 2.9);
    return base + drift;
  }

  snapshot(): Snapshot {
    const order = this.cars
      .map((c, i) => [c.pos, i] as [number, number])
      .sort((a, b) => a[0] - b[0])
      .map(([, i]) => i);
    const lead = this.cars[order[0]].pos;
    const second = this.cars[order[1]].pos;
    return {
      leader: order[0],
      gap: Math.max(0.08, (second - lead) * 1.35 + 0.22),
      order,
      ers: this.cars[order[0]].ers,
      deg: this.deg,
      trackTemp: this.trackTemp,
      lap: Math.floor(this.lap),
      sectors: [
        -0.041 + 0.28 * Math.sin(this.t * 0.21),
        0.062 + 0.24 * Math.sin(this.t * 0.17 + 2),
        -0.118 + 0.3 * Math.sin(this.t * 0.13 + 4),
      ],
      status: this.activeStatus(),
    };
  }

  private activeStatus(): string {
    const e = this.effects.find((x) => x.kind === "safety" || x.kind === "yellow");
    if (e?.kind === "safety") return "SAFETY CAR";
    if (e?.kind === "yellow") return "YELLOW FLAG";
    return "GREEN";
  }

  /* ---- running the world ------------------------------------------------- */

  step(dtSeconds: number) {
    const dt = Math.min(0.05, dtSeconds) * this.timeScale;
    this.t += dt;
    const t = this.t;

    // eased globals — a safety car should arrive, not switch on
    this.spread += (this.spreadTo - this.spread) * Math.min(1, dt * 1.6);
    this.timeScale += (this.timeTo - this.timeScale) * Math.min(1, dt * 1.4);

    this.lap += dt * 0.012;
    this.trackTemp += Math.sin(t * 0.05) * dt * 0.06;
    this.deg = 0.28 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.043));

    for (const c of this.cars) {
      c.ers += (c.ersUp ? 0.055 : -0.13) * dt;
      if (c.ers > 0.98) { c.ers = 0.98; c.ersUp = false; }
      if (c.ers < 0.12) { c.ers = 0.12; c.ersUp = true; }
    }

    for (let i = 0; i < N; i++) this.cars[i].pos = this.livePos(i, t);

    this.retireEffects(t);
    this.direct(t);
    this.movePulses(dt, t);
    this.emitPulses(t);
    this.ageAnnotations(t);

    // history on a fixed tick, so the scroll rate can never drift
    this.acc += dt;
    while (this.acc >= STEP_S) {
      this.acc -= STEP_S;
      this.head = (this.head + 1) % SAMPLES;
      for (let i = 0; i < N; i++) this.hist[i][this.head] = this.cars[i].pos;
      if (this.filled < SAMPLES) this.filled++;
    }
  }

  /* ---- the director ------------------------------------------------------ */

  private direct(t: number) {
    if (t < this.nextBeat) return;
    this.nextBeat = t + 8.5 + this.rnd() * 5.5;

    const pool: BeatKind[] = [
      "overtake", "overtake", "drs", "sector", "sector",
      "pit", "fastest", "deg", "safety", "yellow",
    ];
    let kind = pool[Math.floor(this.rnd() * pool.length)];
    // a moment that just happened is not a moment
    let guard = 0;
    while (this.recent.includes(kind) && guard++ < 8) {
      kind = pool[Math.floor(this.rnd() * pool.length)];
    }
    this.recent.push(kind);
    if (this.recent.length > 3) this.recent.shift();

    this.stage(kind, t);
  }

  private order(): number[] {
    return this.cars.map((c, i) => [c.pos, i] as [number, number])
      .sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  }

  private move(i: number, to: number, dur: number, t: number) {
    const c = this.cars[i];
    c.from = c.pos;
    c.to = Math.max(-0.35, Math.min(N - 0.65, to));
    c.moveStart = t;
    c.moveDur = dur;
  }

  private note(a: Omit<Annotation, "id" | "born" | "bornU">, t: number) {
    // two at a time, ever. The brief's Layer 8 is the one that matters most:
    // the goal is atmosphere, and three cards on screen is a dashboard.
    if (this.annotations.length >= 2) this.annotations.shift();
    this.annotations.push({ ...a, id: this.annId++, born: t, bornU: 0.88 });
  }

  private spark(seed: number, drop: boolean): number[] {
    const r = mulberry32(seed);
    const out: number[] = [];
    let v = 0.5;
    for (let i = 0; i < 7; i++) {
      v += (r() - 0.5) * 0.34 + (drop ? -0.06 : 0.05);
      out.push(Math.max(0.05, Math.min(0.95, v)));
    }
    return out;
  }

  private stage(kind: BeatKind, t: number) {
    const ord = this.order();

    switch (kind) {
      case "overtake": {
        // always a real pass between two adjacent cars, front half of the field
        const p = 1 + Math.floor(this.rnd() * 3);
        const ahead = ord[p - 1], behind = ord[p];
        this.move(behind, p - 1, 4.2, t);
        this.move(ahead, p, 4.2, t);
        this.note({
          kind, driver: behind,
          label: "OVERTAKE",
          value: `${DRIVERS[behind].code} ▸ ${DRIVERS[ahead].code}`,
        }, t);
        break;
      }
      case "drs": {
        const d = ord[1 + Math.floor(this.rnd() * 3)];
        for (let k = 0; k < 3; k++) {
          this.pulses.push({ driver: d, u: 0.06 + k * 0.05, speed: 0.52, heat: 1, born: t, life: 2.1 });
        }
        this.note({ kind, driver: d, label: "DRS ENABLED", value: `+${(11 + this.rnd() * 8).toFixed(0)} km/h` }, t);
        break;
      }
      case "pit": {
        const d = ord[2 + Math.floor(this.rnd() * 4)];
        const back = this.cars[d].pos + 2.4 + this.rnd() * 1.4;
        this.move(d, back, 5.5, t);
        this.effects.push({ kind, start: t, dur: 22, driver: d });
        this.note({ kind, driver: d, label: "PIT WINDOW", value: `${(2.1 + this.rnd() * 0.7).toFixed(1)}s stop` }, t);
        break;
      }
      case "safety": {
        this.spreadTo = 0.4;
        this.timeTo = 0.72;
        this.effects.push({ kind, start: t, dur: 9, driver: ord[0] });
        this.note({ kind, driver: ord[0], label: "SAFETY CAR", value: "field neutralised" }, t);
        break;
      }
      case "yellow": {
        this.timeTo = 0.58;
        this.effects.push({ kind, start: t, dur: 4.5, driver: ord[0] });
        this.note({ kind, driver: ord[2], label: "YELLOW FLAG", value: `sector ${1 + Math.floor(this.rnd() * 3)}` }, t);
        break;
      }
      case "fastest": {
        const d = ord[Math.floor(this.rnd() * 3)];
        this.pulses.push({ driver: d, u: -0.05, speed: 0.95, heat: 1.6, born: t, life: 1.5 });
        this.note({
          kind, driver: d, label: "FASTEST LAP",
          value: `1:${23 + Math.floor(this.rnd() * 2)}.${(100 + Math.floor(this.rnd() * 899))}`,
          spark: this.spark(this.annId * 7919, true),
        }, t);
        break;
      }
      case "sector": {
        const d = ord[Math.floor(this.rnd() * 5)];
        const s = 1 + Math.floor(this.rnd() * 3);
        this.pulses.push({ driver: d, u: 0.1, speed: 0.44, heat: 1.25, born: t, life: 2.4 });
        this.note({
          kind, driver: d, label: `SECTOR ${s}`,
          value: `−0.${(100 + Math.floor(this.rnd() * 400))}`,
          spark: this.spark(this.annId * 104729, true),
        }, t);
        break;
      }
      case "deg": {
        const d = ord[1 + Math.floor(this.rnd() * 4)];
        this.note({
          kind, driver: d, label: "TYRE DEG",
          value: `+0.0${3 + Math.floor(this.rnd() * 6)} s/lap`,
          spark: this.spark(this.annId * 15485863, false),
        }, t);
        break;
      }
    }
  }

  private retireEffects(t: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (t - e.start < e.dur) continue;
      if (e.kind === "safety") { this.spreadTo = 1; this.timeTo = 1; }
      if (e.kind === "yellow") { this.timeTo = 1; }
      if (e.kind === "pit") {
        // the stop pays off: the car comes back at the cars it dropped behind
        this.move(e.driver, Math.max(0, this.cars[e.driver].pos - 1.6), 9, t);
      }
      this.effects.splice(i, 1);
    }
  }

  /* ---- packets ----------------------------------------------------------- */

  private emitPulses(t: number) {
    for (let i = 0; i < N; i++) {
      const c = this.cars[i];
      if (t < c.nextPulse) continue;
      c.nextPulse = t + 4.5 + this.rnd() * 6;
      // dimmer down the order: the engine is watching the front of the race
      this.pulses.push({
        driver: i, u: 0, speed: 0.3 + this.rnd() * 0.14,
        heat: 0.85 - i * 0.07, born: t, life: 3.6,
      });
    }
  }

  private movePulses(dt: number, t: number) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.u += p.speed * dt;
      if (p.u > 1.12 || t - p.born > p.life) this.pulses.splice(i, 1);
    }
  }

  /* ---- annotations ------------------------------------------------------- */

  /**
   * A card is born at the right edge and then rides the history leftward at
   * exactly the rate the data does — because it is pinned to a moment, not to
   * a screen position. It is retired well before it can reach the headline.
   */
  annotationU(a: Annotation): number {
    return a.bornU - (this.t - a.born) / HISTORY_S;
  }

  private ageAnnotations(t: number) {
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      if (this.annotationU(this.annotations[i]) < 0.52) this.annotations.splice(i, 1);
    }
    void t;
  }
}
