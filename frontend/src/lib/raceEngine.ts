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
  | "overtake" | "drs" | "pit" | "safety" | "fastest" | "sector" | "yellow" | "deg"
  | "push" | "best" | "purple" | "battery" | "tyreTemp" | "gap" | "fuel" | "box";

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
  /** seconds on screen, fades included. Two to four — long enough to read
      once, short enough that the hero is empty more often than it is not. */
  life: number;
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
  /** per driver: +1 gained a place recently, -1 lost one, 0 settled */
  moved: number[];
}

interface Car {
  /** what the renderer sees: base + drift */
  pos: number;
  /* THE RUNNING ORDER AND THE BREATHING ARE SEPARATE QUANTITIES.
     `base` is where the car is in the order; `pos` is that plus its slow drift.
     Keeping only `pos` meant a staged move seeded `from` with a value that
     already contained the drift — and then added the drift a second time on
     the very next frame. Every overtake therefore began with an instantaneous
     jump of up to half a lane, which is exactly the hard corner that showed up
     wherever two lines crossed. A step discontinuity cannot be smoothed by any
     amount of curve fitting downstream; it has to not happen. */
  base: number;
  from: number;
  to: number;
  moveStart: number;
  moveDur: number;
  /** slow personal drift so the trace breathes without wobbling */
  driftPhase: number;
  driftRate: number;
  /** a fourth, much slower term that modulates how wide the drift swings */
  swellRate: number;
  ers: number;
  ersUp: boolean;
  /** for the cluster's gained/lost arrows */
  rank: number;
  rankMoved: number;
  rankDelta: number;
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
  private nextBeat = 5;
  private nextPulse = 0;
  private recent: BeatKind[] = [];
  private annId = 1;

  private lap = 34;
  private trackTemp = 41.4;
  private deg = 0.31;

  constructor(seed = 0x5eed1e) {
    this.rnd = mulberry32(seed);
    for (let i = 0; i < N; i++) {
      this.cars.push({
        pos: i, base: i, from: i, to: i, moveStart: 0, moveDur: 1,
        driftPhase: this.rnd() * Math.PI * 2,
        // spread around 1.0 so no two cars sweep on the same period
        driftRate: 0.048 + this.rnd() * 0.028,
        swellRate: 0.031 + this.rnd() * 0.026,
        ers: 0.35 + this.rnd() * 0.5,
        ersUp: this.rnd() > 0.5,
        rank: i, rankMoved: -99, rankDelta: 0,
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
  /** Advances one car and returns nothing — it writes `base` and `pos`. */
  private livePos(i: number, t: number) {
    const c = this.cars[i];
    const k = c.moveDur <= 0 ? 1 : clamp01((t - c.moveStart) / c.moveDur);
    c.base = c.from + (c.to - c.from) * smoother(k);

    /* Three slow terms, tuned against HISTORY_S rather than against taste.
       The width of the screen is 22 seconds, so a 33-second period shows as
       two-thirds of one graceful sweep — a current, not a wave.

       The fourth term is the one that stops the field ever looking settled:
       it modulates the AMPLITUDE of the first on a period of its own, so the
       spacing between lines keeps opening and closing. Four incommensurable
       periods per car, all different between cars, is a repeat interval no
       viewer will ever sit through. */
    const p = c.driftPhase;
    const swell = 0.62 + 0.38 * Math.sin(t * c.swellRate + p * 2.3);
    c.pos = c.base
      + 0.36 * swell * Math.sin(t * 0.19 * c.driftRate * 16 + p)
      + 0.15 * Math.sin(t * 0.33 + p * 1.7)
      + 0.06 * Math.sin(t * 0.61 + p * 2.9);
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
      // an arrow lives for six seconds, then the position is simply the position
      moved: this.cars.map((c) => (this.t - c.rankMoved < 6 ? Math.sign(c.rankDelta) : 0)),
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

    /* Every readout has to visibly move inside the thirty seconds somebody
       might actually watch for. A lap that ticks over once every eighty
       seconds is, to that viewer, a static number — and a static number is a
       claim that nothing is being measured. */
    this.lap += dt * 0.036;                                  // ~28s a lap
    this.trackTemp += (Math.sin(t * 0.11) + Math.sin(t * 0.043) * 0.6) * dt * 0.19;
    this.deg = 0.27 + 0.17 * (0.5 + 0.5 * Math.sin(t * 0.075))
      + 0.02 * Math.sin(t * 0.31);

    for (const c of this.cars) {
      c.ers += (c.ersUp ? 0.085 : -0.16) * dt;               // ~10s up, ~5s down
      if (c.ers > 0.97) { c.ers = 0.97; c.ersUp = false; }
      if (c.ers < 0.14) { c.ers = 0.14; c.ersUp = true; }
    }

    /* Places gained and lost, so the cluster can show an arrow for a few
       seconds after a change. The rank is read from the same order the lines
       are drawn in, so an arrow can never disagree with the picture. */
    const nowOrder = this.order();
    for (let r = 0; r < nowOrder.length; r++) {
      const c = this.cars[nowOrder[r]];
      if (c.rank !== r) {
        c.rankDelta = c.rank - r;   // moved up in the list = gained
        c.rankMoved = t;
        c.rank = r;
      }
    }

    for (let i = 0; i < N; i++) this.livePos(i, t);

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
    this.nextBeat = t + 4.6 + this.rnd() * 4.2;

    /* Readings outnumber events about three to one, which is the ratio a real
       timing feed has: the race is mostly measurement, punctuated. The four
       weighted twice are the ones worth seeing more than once. */
    const pool: BeatKind[] = [
      "overtake", "overtake", "drs", "drs", "sector", "sector",
      "purple", "purple", "best", "push", "battery", "gap", "gap",
      "tyreTemp", "fuel", "deg", "fastest", "pit", "safety", "yellow",
    ];
    let kind = pool[Math.floor(this.rnd() * pool.length)];
    // a moment that just happened is not a moment
    let guard = 0;
    while (this.recent.includes(kind) && guard++ < 8) {
      kind = pool[Math.floor(this.rnd() * pool.length)];
    }
    this.recent.push(kind);
    if (this.recent.length > 5) this.recent.shift();

    this.stage(kind, t);
  }

  private order(): number[] {
    return this.cars.map((c, i) => [c.pos, i] as [number, number])
      .sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  }

  private move(i: number, to: number, dur: number, t: number) {
    const c = this.cars[i];
    // `base`, never `pos` — see the note on Car.base
    c.from = c.base;
    c.to = Math.max(-0.35, Math.min(N - 0.65, to));
    c.moveStart = t;
    c.moveDur = dur;
  }

  private note(a: Omit<Annotation, "id" | "born" | "bornU" | "life">, t: number, life = 3.2) {
    /* One at a time, and never two on the same line.
       The brief's Layer 8 is the one that matters most: the goal is
       atmosphere, and a second card turns the hero into a dashboard. Cards
       live two to four seconds against a beat every five to nine, so the
       clean state is the common one — which is what makes the card land when
       it does arrive. */
    this.annotations = this.annotations.filter((x) => x.driver !== a.driver);
    if (this.annotations.length >= 1) this.annotations.shift();
    this.annotations.push({ ...a, id: this.annId++, born: t, bornU: 0.88, life });
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
    const front = () => ord[Math.floor(this.rnd() * 4)];
    const dp = (n: number) => (100 + Math.floor(this.rnd() * 899)).toString().slice(0, n);

    switch (kind) {
      /* ---- beats that actually move the race ---------------------------- */
      case "overtake": {
        const p = 1 + Math.floor(this.rnd() * 3);
        const ahead = ord[p - 1], behind = ord[p];
        // 5.5s rather than 4.2s: a pass should be a lean, not a swerve
        this.move(behind, p - 1, 5.5, t);
        this.move(ahead, p, 5.5, t);
        this.note({
          kind, driver: behind, label: "OVERTAKE",
          value: `${DRIVERS[behind].code} ▸ ${DRIVERS[ahead].code}`,
        }, t, 3.6);
        break;
      }
      case "pit": {
        const d = ord[2 + Math.floor(this.rnd() * 4)];
        this.move(d, this.cars[d].base + 2.4 + this.rnd() * 1.4, 6.5, t);
        this.effects.push({ kind, start: t, dur: 22, driver: d });
        this.note({ kind, driver: d, label: "BOX THIS LAP", value: `${(2.1 + this.rnd() * 0.7).toFixed(1)}s` }, t, 3.4);
        break;
      }
      case "safety": {
        this.spreadTo = 0.42;
        this.timeTo = 0.74;
        this.effects.push({ kind, start: t, dur: 9, driver: ord[0] });
        this.note({ kind, driver: ord[0], label: "SAFETY CAR", value: "neutralised" }, t, 4);
        break;
      }
      case "yellow": {
        this.timeTo = 0.6;
        this.effects.push({ kind, start: t, dur: 4.5, driver: ord[0] });
        this.note({ kind, driver: ord[2], label: "YELLOW FLAG", value: `sector ${1 + Math.floor(this.rnd() * 3)}` }, t, 3);
        break;
      }

      /* ---- beats that are readings, not events -------------------------- */
      case "drs": {
        const d = front();
        for (let k = 0; k < 3; k++) {
          this.pulses.push({ driver: d, u: 0.02 + k * 0.05, speed: 0.5, heat: 1.1, born: t, life: 4 });
        }
        this.note({ kind, driver: d, label: "DRS ENABLED", value: `+${(11 + this.rnd() * 8).toFixed(0)} km/h` }, t, 2.8);
        break;
      }
      case "fastest": {
        const d = front();
        this.pulses.push({ driver: d, u: -0.05, speed: 0.86, heat: 1.7, born: t, life: 3 });
        this.note({
          kind, driver: d, label: "FASTEST LAP", value: `1:2${3 + Math.floor(this.rnd() * 2)}.${dp(3)}`,
          spark: this.spark(this.annId * 7919, true),
        }, t, 3.8);
        break;
      }
      case "purple": {
        const d = front();
        const sN = 1 + Math.floor(this.rnd() * 3);
        this.pulses.push({ driver: d, u: 0.08, speed: 0.46, heat: 1.3, born: t, life: 4 });
        this.note({ kind, driver: d, label: `PURPLE S${sN}`, value: `−0.${dp(3)}` }, t, 3);
        break;
      }
      case "sector": {
        const d = ord[Math.floor(this.rnd() * 5)];
        const sN = 1 + Math.floor(this.rnd() * 3);
        this.note({
          kind, driver: d, label: `SECTOR ${sN}`, value: `−0.${dp(3)}`,
          spark: this.spark(this.annId * 104729, true),
        }, t, 3);
        break;
      }
      case "best": {
        const d = ord[Math.floor(this.rnd() * 5)];
        this.note({ kind, driver: d, label: "PERSONAL BEST", value: `1:2${4 + Math.floor(this.rnd() * 2)}.${dp(3)}` }, t, 3);
        break;
      }
      case "push": {
        const d = front();
        this.pulses.push({ driver: d, u: 0.02, speed: 0.55, heat: 1.2, born: t, life: 4 });
        this.note({ kind, driver: d, label: "PUSH LAP", value: `${2 + Math.floor(this.rnd() * 4)} laps` }, t, 2.8);
        break;
      }
      case "battery": {
        const d = front();
        this.cars[d].ers = 0.95; this.cars[d].ersUp = false;
        this.note({ kind, driver: d, label: "BATTERY DEPLOY", value: `${80 + Math.floor(this.rnd() * 19)}%` }, t, 2.8);
        break;
      }
      case "gap": {
        const p = 1 + Math.floor(this.rnd() * 4);
        const d = ord[p];
        const g = (this.cars[d].base - this.cars[ord[p - 1]].base) * 1.35;
        this.note({ kind, driver: d, label: "GAP", value: `${g >= 0 ? "+" : ""}${g.toFixed(2)}s` }, t, 2.6);
        break;
      }
      case "tyreTemp": {
        const d = ord[Math.floor(this.rnd() * 6)];
        this.note({ kind, driver: d, label: "TYRE TEMP", value: `${96 + Math.floor(this.rnd() * 18)}°C` }, t, 2.8);
        break;
      }
      case "fuel": {
        const d = ord[Math.floor(this.rnd() * 6)];
        this.note({ kind, driver: d, label: "FUEL TARGET", value: `${(0.4 + this.rnd() * 1.4).toFixed(2)} kg` }, t, 2.8);
        break;
      }
      case "deg": {
        const d = ord[1 + Math.floor(this.rnd() * 4)];
        this.note({
          kind, driver: d, label: "TYRE DEG", value: `+0.0${3 + Math.floor(this.rnd() * 6)} s/lap`,
          spark: this.spark(this.annId * 15485863, false),
        }, t, 3.6);
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

  /**
   * Markers: between one and three alive at any moment, on different lines.
   *
   * Per-driver timers meant seven independent countdowns that drifted into
   * phase and then out again — sometimes six packets at once, sometimes an
   * empty screen for eight seconds. The population is the thing worth
   * controlling, so it is controlled directly: keep at least one, allow up to
   * three, and space the arrivals irregularly. Nothing is ever synchronised
   * because nothing shares a clock.
   */
  private emitPulses(t: number) {
    const alive = this.pulses.length;
    if (alive >= 3) return;
    if (alive > 0 && t < this.nextPulse) return;

    const busy = new Set(this.pulses.map((p) => p.driver));
    const free: number[] = [];
    for (let i = 0; i < N; i++) if (!busy.has(i)) free.push(i);
    if (!free.length) return;

    // the front of the race transmits more often than the back
    free.sort((a, b) => this.cars[a].pos - this.cars[b].pos);
    const pick = free[Math.floor(this.rnd() ** 1.7 * free.length)];

    this.pulses.push({
      driver: pick,
      u: -0.06,
      speed: 0.21 + this.rnd() * 0.13,
      heat: 0.9 - this.cars[pick].pos * 0.055,
      born: t,
      life: 9,
    });
    this.nextPulse = t + 1.1 + this.rnd() * 3.6;
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
      const a = this.annotations[i];
      if (t - a.born > a.life || this.annotationU(a) < 0.5) this.annotations.splice(i, 1);
    }
  }
}
