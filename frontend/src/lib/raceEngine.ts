/* -------------------------------------------------------------------------- */
/* The engine under the hero.                                                 */
/*                                                                            */
/*     X IS TIME, AND THE RIGHT EDGE IS NOW.                                   */
/*                                                                            */
/* Every car's position is recorded on a fixed tick, so the curve at any x is  */
/* where that car was age(x) seconds ago. The field does not scroll — history  */
/* gets older and slides left, the way a live timing trace does.               */
/*                                                                            */
/* WHAT CHANGED IN V57: the race is no longer choreographed.                   */
/*                                                                            */
/* Before, a director decided "there is an overtake now" and moved two cars    */
/* past each other. That is a puppet show: convincing for one beat, and never  */
/* able to produce the thing the brief actually asks for — a midfield fight    */
/* that forms, holds, and eventually resolves.                                 */
/*                                                                            */
/* Now every car carries a PACE, in seconds per lap, and a GAP, in seconds     */
/* behind the leader. The gap integrates the pace difference. Positions are    */
/* read off the gaps. So an overtake is not an event that gets staged — it is  */
/* what it looks like when one car's gap crosses another's, exactly as in a    */
/* real race. The director's job is reduced to what a commentator's actually   */
/* is: noticing what the race did, and saying so.                              */
/*                                                                            */
/* Everything else falls out of that. A leader in clean air pulls away. A car  */
/* within a second gets DRS and dirty air at the same time, so it closes and   */
/* then struggles — which is a battle, and battles last until the pace         */
/* underneath them changes. A pit stop is twenty seconds added to a gap.       */
/*                                                                            */
/* Nothing is random in a way a reader would resent: the PRNG is seeded with a */
/* constant, so server and client agree and there is no hydration mismatch.    */
/* -------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* ---- the paddock --------------------------------------------------------- */
/* Twelve, so a new race can field a different seven and actually look like a
   different race. Colours are per constructor and deliberately far apart in
   hue: the reader has to be able to follow one line without a legend. */
export interface DriverRef {
  code: string;
  team: string;
  dark: string;
  light: string;
}

export const POOL: DriverRef[] = [
  { code: "NOR", team: "McLaren",   dark: "#ff8b1f", light: "#c2410c" },
  { code: "PIA", team: "McLaren",   dark: "#ffab5e", light: "#9a3412" },
  { code: "VER", team: "Red Bull",  dark: "#4f8ce0", light: "#1d4ed8" },
  { code: "TSU", team: "Red Bull",  dark: "#7fb0ee", light: "#1e40af" },
  { code: "LEC", team: "Ferrari",   dark: "#ff4d5e", light: "#be123c" },
  { code: "HAM", team: "Ferrari",   dark: "#ff7b88", light: "#9f1239" },
  { code: "RUS", team: "Mercedes",  dark: "#27f4d2", light: "#0f766e" },
  { code: "ANT", team: "Mercedes",  dark: "#7af6e2", light: "#115e59" },
  { code: "ALO", team: "Aston",     dark: "#3fd18b", light: "#15803d" },
  { code: "GAS", team: "Alpine",    dark: "#57b6ff", light: "#0369a1" },
  { code: "HUL", team: "Sauber",    dark: "#b79bff", light: "#6d28d9" },
  { code: "OCO", team: "Haas",      dark: "#c9cede", light: "#475569" },
];

/** Cars on track in any one race. Seven is the legibility ceiling. */
export const N = 7;

export const COMPOUNDS = [
  { key: "S", label: "SOFT",   tint: "#ff4d5e", wear: 1.55 },
  { key: "M", label: "MEDIUM", tint: "#ffd34d", wear: 1.0 },
  { key: "H", label: "HARD",   tint: "#e6ebf5", wear: 0.68 },
] as const;

export const WEATHER = ["DRY", "CLOUDY", "LIGHT RAIN", "HUMID"] as const;

/** Seconds of race held across the width of the viewport. */
export const HISTORY_S = 22;
const STEP_S = 0.1;
const SAMPLES = Math.ceil(HISTORY_S / STEP_S) + 8;
/** Real seconds per race lap. A race lasts about two minutes. */
const LAP_S = 2.05;
/* How long a car takes to go round the minimap. Deliberately unrelated to
   LAP_S: the lap counter is a readout and can tick briskly, but a dot visibly
   travelling a circuit is a moving object, and at two seconds a lap it read as
   a decoration whipping round rather than as a car. Eighteen seconds is a car. */
const TRACK_LAP_S = 18;

/* ---- what the commentator can say ---------------------------------------- */
export type BeatKind =
  | "overtake" | "drs" | "pit" | "safety" | "vsc" | "fastest" | "sector"
  | "yellow" | "deg" | "push" | "best" | "purple" | "battery" | "tyreTemp"
  | "gap" | "fuel" | "box" | "undercut" | "limits" | "engine" | "rain"
  | "brake" | "closing";

/** How a card visualises itself. Never text alone. */
export type Viz = "spark" | "bars" | "wave" | "gauge" | "pulse" | "scan";

export interface Annotation {
  id: number;
  kind: BeatKind;
  label: string;
  value?: string;
  /** car index within this race, 0..N-1 */
  car: number;
  /** index into POOL — what colour this actually is */
  ref: number;
  born: number;
  bornU: number;
  life: number;
  viz: Viz;
  /** the series a spark/bars/wave draws */
  series: number[];
  /** amber for caution, accent for incident, speed for a gain */
  tone: "neutral" | "caution" | "gain" | "alert";
}

export interface Pulse {
  car: number;
  u: number;
  speed: number;
  heat: number;
  born: number;
  life: number;
}

export interface Row {
  car: number;
  ref: number;
  pos: number;
  /** seconds behind the car ahead */
  interval: number;
  /** seconds behind the leader */
  gap: number;
  ers: number;
  tyre: number;
  tyreAge: number;
  drs: boolean;
  /** -1 lost, 0 held, +1 gained — only for a few seconds after it happens */
  moved: number;
  /** "purple" | "green" | null, for the sector flash */
  flash: string | null;
  /** last five lap times, normalised 0..1, for the row sparkline */
  form: number[];
  /** 0 none, 1 green, 2 purple, 3 yellow — one per sector, per car */
  sectors: number[];
  /** 0..1 of the tyre's life used */
  wear: number;
  /** km/h at the speed trap, live */
  speed: number;

  /* ---- the pedals ---------------------------------------------------------
     Both come from where the car actually is around the lap, not from a timer,
     which is why they agree with the tracker and with each other: the car
     braking in the panel is the dot entering a corner on the minimap. A trace
     that moves on its own clock is a screensaver; this one is a readout. */
  throttle: number;
  brake: number;
  /** kg on board. Falls all race — the slowest number on the panel. */
  fuel: number;
  /** the lap this car last completed, in seconds. Changes on its own lap. */
  lastLap: number;
  /** how the interval to the car ahead is trending: <0 closing, >0 dropping */
  trend: number;
  /** which stint this is */
  stint: number;
}

export interface Snapshot {
  rows: Row[];
  lap: number;
  laps: number;
  weather: string;
  circuit: string;
  status: string;
  trackTemp: number;
  /** the leader's trap speed, for the footer */
  trap: number;
  /** 0 while a race changes over, 1 while one is running */
  alive: number;
  /** the running order as car indices, for the renderer */
  order: number[];
}

interface Car {
  ref: number;
  /** seconds behind the leader — the whole model in one number */
  gap: number;
  /** seconds per lap slower than the reference. Negative is quick. */
  pace: number;
  paceTo: number;
  paceUntil: number;
  mood: "normal" | "push" | "manage";
  ers: number;
  ersUp: boolean;
  tyre: number;
  tyreAge: number;
  drs: boolean;
  flash: string | null;
  flashUntil: number;
  rank: number;
  /** the same rank, eased — an integer rank would step the lane on every pass */
  rankF: number;
  rankMoved: number;
  rankDelta: number;
  /** where this car is around the lap, 0..1 — the minimap reads this */
  trackU: number;
  form: number[];
  /* Sectors tick over on each car's OWN clock — a car sets a sector when it
     reaches one, and no two cars reach one together. Shared sector timing was
     the same simultaneity mistake as the shared easing, one layer down. */
  sectors: number[];
  sectorAt: number;
  sectorPhase: number;
  speed: number;
  wobble: number;
  /* Every rate in this file used to be shared. Two cars easing on the same
     constant reach their new value at the same moment, and a viewer reads
     simultaneity long before they read the values. Each car now owns its own. */
  paceRef: number;
  paceEase: number;
  rankEase: number;
  closeRate: number;
  /* A PIT STOP IS NOT A TELEPORT.
     Adding twenty seconds to a gap in one frame puts a vertical line through
     the picture — the same step discontinuity that made overtakes kink in V56,
     arriving by a different route. The loss is banked here and paid out over a
     few seconds, so the car falls away down the order at a rate a car could. */
  pitOwed: number;
  /** pace plus every situational term — written by drivePace, read by
      integrateGaps. Derived state, so it lives here rather than in any input. */
  effective: number;

  /* ---- the instruments ----------------------------------------------------
     Everything below is derived from where the car is and how it is going,
     never from a clock of its own. The pedals come from `trackU`, the lap time
     from `effective`, the fuel from the race distance run — so all three agree
     with the trace, with the tracker and with each other, and none of them can
     be caught cycling on a period the eye can learn. */
  throttle: number;
  brake: number;
  fuel: number;
  lastLap: number;
  lastU: number;
  trend: number;
  prevInterval: number;
  stint: number;
  /** this car's own corner layout, so no two pedal traces are in phase */
  cornerPhase: number;
  cornerCount: number;
  /* 1 the instant a stop begins, decaying to 0 as the car rejoins. The tracker
     reads it to run the car down the pit lane instead of the road, which is
     the one moment in a race when a dot legitimately leaves the circuit. */
  pitPhase: number;
}

export class RaceEngine {
  t = 0;
  private rnd: () => number;
  cars: Car[] = [];
  private hist: Float32Array[] = [];
  private head = 0;
  private acc = 0;

  /* `spread` used to be a global multiplier on the lane height, eased from 1
     to 0.42 whenever a safety car came out. It squeezed all seven lines at
     once, over the same six hundred milliseconds, at the same x — which is
     exactly the "nothing should ever happen globally" the brief is about.

     A safety car now works the way it actually works: through PACE. Every car
     is asked to converge on the car ahead, so the field closes up car by car,
     each from its own gap, at its own rate, arriving at its own moment. The
     result is the same picture and none of the simultaneity. */
  spread = 1;
  timeScale = 1;
  private timeTo = 1;

  annotations: Annotation[] = [];
  pulses: Pulse[] = [];
  private nextBeat = 4;
  private nextPulse = 0;
  private recent: BeatKind[] = [];
  private annId = 1;

  /* ---- the broadcast ----------------------------------------------------- */
  lap = 1;
  laps = 57;
  /** Increments once per race. Whoever owns the tracker watches this so the
      circuit changes when the race does rather than on a timer of its own. */
  raceId = 0;
  weather = "DRY";
  circuit = "SECTOR 1";
  trackTemp = 41.4;
  /** 1 running, dips to 0 across a changeover */
  alive = 1;
  private changing = 0;
  private status = "GREEN";
  private statusUntil = 0;
  /** the scale that maps a gap in seconds to a lane */
  private span = 6;
  private trackClock = 0;

  constructor(seed = 0x5eed1e) {
    this.rnd = mulberry32(seed);
    for (let i = 0; i < N; i++) {
      this.cars.push(this.blankCar(i));
      const h = new Float32Array(SAMPLES);
      h.fill(i);
      this.hist.push(h);
    }
    this.newRace(true);
  }

  private blankCar(i: number): Car {
    return {
      ref: i, gap: i * 1.2, pace: 0, paceTo: 0, paceUntil: 0, mood: "normal",
      ers: 0.4, ersUp: true, tyre: 1, tyreAge: 0, drs: false,
      flash: null, flashUntil: 0, rank: i, rankF: i, rankMoved: -99, rankDelta: 0,
      trackU: 0, form: [0.5, 0.5, 0.5, 0.5, 0.5], wobble: 0, pitOwed: 0,
      sectors: [0, 0, 0], sectorAt: 0, sectorPhase: 0, speed: 318,
      throttle: 0.8, brake: 0, fuel: 100, lastLap: 88, lastU: 0, trend: 0,
      prevInterval: 2, stint: 1,
      cornerPhase: 0, cornerCount: 4, pitPhase: 0,
      paceRef: 0, paceEase: 0.5, rankEase: 0.7, closeRate: 1,
      effective: 0,
    };
  }

  /* ---- a new broadcast --------------------------------------------------- */
  /**
   * A different seven, a different circuit, a different length, a different
   * story. The point of ending a race is that the next one is not the same one
   * — an endless single race is a loop with extra steps.
   */
  private newRace(first = false) {
    const picks = new Set<number>();
    while (picks.size < N) picks.add(Math.floor(this.rnd() * POOL.length));
    const refs = [...picks];

    this.laps = [52, 53, 57, 58, 61, 63, 66, 71][Math.floor(this.rnd() * 8)];
    this.lap = 1;
    this.raceId += 1;
    this.weather = WEATHER[Math.floor(this.rnd() * WEATHER.length)];
    this.trackTemp = 28 + this.rnd() * 22;
    this.span = 6;
    this.status = "GREEN";

    for (let i = 0; i < N; i++) {
      const c = this.cars[i];
      c.ref = refs[i];
      c.gap = i * (0.7 + this.rnd() * 0.9);
      // grid pace order is roughly the grid order, with real overlap
      c.pace = i * 0.052 + (this.rnd() - 0.5) * 0.12;
      c.paceTo = c.pace;
      c.paceUntil = this.t + 4 + this.rnd() * 8;
      c.mood = "normal";
      c.ers = 0.35 + this.rnd() * 0.5;
      c.ersUp = this.rnd() > 0.5;
      c.tyre = Math.floor(this.rnd() * 3);
      c.tyreAge = this.rnd() * 15;
      c.drs = false;
      c.flash = null;
      c.rank = i; c.rankF = i; c.rankMoved = -99; c.rankDelta = 0;
      c.trackU = 0;
      c.form = [0.5, 0.5, 0.5, 0.5, 0.5];
      c.pitOwed = 0;
      // spread widely: 0.34..0.86 is a factor of two and a half between the
      // slowest and the quickest car to settle into a new pace
      c.paceRef = c.pace;
      c.paceEase = 0.34 + this.rnd() * 0.52;
      c.rankEase = 0.42 + this.rnd() * 0.5;
      c.closeRate = 0.7 + this.rnd() * 0.6;
      c.sectors = [0, 0, 0];
      c.sectorAt = this.t + this.rnd() * 3;
      // Math.floor, and not optional: a float index writes a named property
      // on the array rather than an element, so the pips never changed at all
      c.sectorPhase = Math.floor(this.rnd() * 3);
      c.speed = 300 + this.rnd() * 40;
      /* A CIRCUIT HAS A SHAPE, AND SO DOES A PEDAL TRACE.
         Four to seven braking zones a lap, each car offset into its own place
         in that layout, so seven throttle bars never rise together. The count
         changes with the circuit; the phase is the car's own. */
      c.cornerCount = 4 + Math.floor(this.rnd() * 4);
      c.cornerPhase = this.rnd() * Math.PI * 2;
      c.throttle = 0.7; c.brake = 0;
      c.fuel = 103 + this.rnd() * 6;
      c.lastLap = 84 + this.rnd() * 10;
      c.lastU = 0;
      c.trend = 0; c.prevInterval = 2;
      c.stint = 1;
      c.pitPhase = 0;
      if (first) this.hist[i].fill(i);
    }
    this.annotations.length = 0;
    this.pulses.length = 0;
    this.nextBeat = this.t + 3;

    /* THE CHANGEOVER MUST NEVER ENTER THE BUFFER.
       Resetting seven gaps in one tick writes a step into every lane at the
       same instant — and because the buffer scrolls, that step then travelled
       across the screen as a vertical wall for the next twenty-two seconds,
       with the old race's colours on one side of it and the new race's on the
       other. It was the single most visible artefact in the hero.

       The new race is instead run forward for a full window's worth of history
       before anything is drawn, so the buffer holds only this race, already
       shaped. The old race leaves with the fade rather than being stitched on
       to the front of the new one. */
    if (!first) {
      const beats = this.annId;
      for (let i = 0; i < Math.ceil((HISTORY_S + 2) / 0.033); i++) this.advance(0.033);
      this.annotations.length = 0;
      this.pulses.length = 0;
      this.annId = beats;
      this.nextBeat = this.t + 2;
    }
  }

  /* ---- reading the world ------------------------------------------------- */

  /** Where car `c` was `age` seconds ago, in lanes. Catmull-Rom, so no corners. */
  posAt(c: number, age: number): number {
    const h = this.hist[c];
    const f = age / STEP_S;
    const i = Math.floor(f);
    const fr = f - i;
    const at = (k: number) => h[(((this.head - k) % SAMPLES) + SAMPLES) % SAMPLES];
    if (i >= SAMPLES - 3) return at(SAMPLES - 3);
    const p0 = at(i - 1 < 0 ? 0 : i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const a = 2 * p1;
    const b = p2 - p0;
    const cc = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const e = -p0 + 3 * p1 - 3 * p2 + p3;
    return 0.5 * (a + b * fr + cc * fr * fr + e * fr * fr * fr);
  }

  /**
   * A lane, from a gap and a position.
   *
   * Pure proportional-to-gap looks correct and reads badly: real gaps cluster
   * at the front, so six cars pile into the top third and one straggler holds
   * the bottom two-thirds empty. Pure position spaces evenly and throws away
   * every compression and every escape — the whole point of the model.
   *
   * Sixty per cent position, forty per cent gap. The field stays legible across
   * the full height, a leader pulling clear still visibly opens a gap, and a
   * safety car still visibly closes everything up.
   */
  private lane(gap: number, rank: number, car: Car, t: number): number {
    /* Plus a small independent breath per car.
       The gap model supplies the narrative — battles, escapes, a pass — but it
       is slow by nature, and 60% of a lane is a rank that barely moves, so on
       its own the field draws seven near-parallel rails. This restores the
       flowing quality the field had before the model arrived: four fifths of a
       lane, on periods no two cars share, layered UNDER the story rather than
       instead of it. It is pace variation, which is the most believable thing
       a lap chart contains. */
    const p = car.ref * 1.9;
    const breath =
      0.30 * Math.sin(t * (0.155 + (car.ref % 5) * 0.011) + p) +
      0.13 * Math.sin(t * 0.34 + p * 1.7) +
      0.05 * Math.sin(t * 0.63 + p * 2.9);
    return 0.55 * rank + 0.45 * (gap / this.span) * (N - 1) + breath;
  }

  order(): number[] {
    return this.cars
      .map((c, i) => [c.gap, i] as [number, number])
      .sort((a, b) => a[0] - b[0])
      .map(([, i]) => i);
  }

  snapshot(): Snapshot {
    const ord = this.order();
    const rows: Row[] = ord.map((ci, r) => {
      const c = this.cars[ci];
      return {
        car: ci, ref: c.ref, pos: r + 1,
        interval: r === 0 ? 0 : c.gap - this.cars[ord[r - 1]].gap,
        gap: c.gap,
        ers: c.ers, tyre: c.tyre, tyreAge: Math.floor(c.tyreAge),
        drs: c.drs,
        moved: this.t - c.rankMoved < 5 ? Math.sign(c.rankDelta) : 0,
        flash: this.t < c.flashUntil ? c.flash : null,
        form: c.form,
        sectors: c.sectors,
        // a stint, not a lap count: the bar should be somewhere in the middle
        // most of the time rather than pinned at either end
        wear: clamp01(c.tyreAge / (this.laps / 2.4 / COMPOUNDS[c.tyre].wear)),
        throttle: c.throttle, brake: c.brake, fuel: c.fuel,
        lastLap: c.lastLap, trend: c.trend, stint: c.stint,
        speed: c.speed,
      };
    });
    return {
      rows, lap: Math.min(this.laps, Math.floor(this.lap)), laps: this.laps,
      weather: this.weather, circuit: this.circuit, status: this.status,
      trackTemp: this.trackTemp, alive: this.alive, order: ord,
      trap: this.cars[ord[0]].speed,
    };
  }

  /* ---- running the world ------------------------------------------------- */

  step(dtSeconds: number) {
    const dt = Math.min(0.05, dtSeconds) * this.timeScale;
    this.timeScale += (this.timeTo - this.timeScale) * Math.min(1, dt * 1.4);

    /* the changeover: fade the whole picture out, swap the race, fade back */
    if (this.changing > 0) {
      this.changing -= dt;
      this.alive = clamp01(Math.abs(this.changing - 1.1) / 1.1);
      if (this.changing <= 1.1 && this.changing + dt > 1.1) { this.newRace(); return; }
      if (this.changing <= 0) { this.changing = 0; this.alive = 1; }
    } else {
      this.lap += dt / LAP_S;
      if (this.lap >= this.laps + 0.6) this.changing = 2.2;
    }

    this.advance(dt);
  }

  /** The physics, separable from the broadcast, so a new race can be run
      forward through it before its first frame is ever shown. */
  private advance(dt: number) {
    this.t += dt;
    const t = this.t;
    if (t > this.statusUntil && this.status !== "GREEN") {
      this.status = "GREEN";
      this.timeTo = 1;
    }

    this.trackTemp += (Math.sin(t * 0.11) + Math.sin(t * 0.043) * 0.6) * dt * 0.19;

    this.drivePace(dt, t);
    this.integrateGaps(dt, t);
    this.rankChanges(t, dt);
    this.commentate(t);
    this.movePulses(dt, t);
    this.emitPulses(t);
    this.ageAnnotations(t);

    /* history on a fixed tick, so the scroll rate can never drift */
    this.acc += dt;
    while (this.acc >= STEP_S) {
      this.acc -= STEP_S;
      this.head = (this.head + 1) % SAMPLES;
      for (let i = 0; i < N; i++) {
        const c = this.cars[i];
        this.hist[i][this.head] = this.lane(c.gap, c.rankF, c, this.t);
      }
    }
  }

  /**
   * Pace: the only thing anybody actually decides.
   *
   * A car holds a pace for a stint of a few seconds and then picks another,
   * eased into rather than switched. Tyre age costs time. Clean air is worth
   * having, dirty air is not, and a car within DRS range gets both at once —
   * which is why battles hold rather than resolve immediately.
   */
  private drivePace(dt: number, t: number) {
    const ord = this.order();
    let fastest = Infinity;
    for (const c of this.cars) fastest = Math.min(fastest, c.effective);

    for (let r = 0; r < ord.length; r++) {
      const c = this.cars[ord[r]];

      if (t > c.paceUntil) {
        c.paceUntil = t + 3.5 + this.rnd() * 7;
        const roll = this.rnd();
        c.mood = roll > 0.82 ? "push" : roll > 0.66 ? "manage" : "normal";
        const base = r * 0.05 + (this.rnd() - 0.5) * 0.16;
        c.paceTo = base + (c.mood === "push" ? -0.17 : c.mood === "manage" ? 0.14 : 0);
      }
      // eased, never switched: a step in pace is a kink in the trace
      c.pace += (c.paceTo - c.pace) * Math.min(1, dt * c.paceEase);
      // a slow average of this car's own pace, for judging its own sectors
      c.paceRef += (c.effective - c.paceRef) * Math.min(1, dt * 0.09);

      /* A stint pace that holds flat between decisions gives parallel lines.
         Real pace never holds — it drifts with fuel, track, traffic and the
         driver. Two slow terms per car, on periods nothing else shares, and an
         amplitude chosen against the window: 0.18 s/lap over the ten laps the
         screen holds is about a lane and a half of movement, which is a race
         breathing rather than a chart wobbling. */
      const ph = c.ref * 1.7;
      c.wobble = 0.18 * Math.sin(t * 0.14 + ph) + 0.07 * Math.sin(t * 0.31 + ph * 2.3);

      c.tyreAge += dt / LAP_S;
      const wear = COMPOUNDS[c.tyre].wear;
      const degradation = Math.max(0, c.tyreAge - 8) * 0.011 * wear;

      // clean air for the leader; everyone else is in somebody's wake
      const ahead = r === 0 ? null : this.cars[ord[r - 1]];
      const interval = ahead ? c.gap - ahead.gap : 99;
      c.drs = interval < 1.0 && r > 0 && this.status === "GREEN";
      const dirty = interval < 1.6 ? (1.6 - interval) * 0.09 : 0;
      const drs = c.drs ? -0.13 : 0;
      const clean = r === 0 ? -0.05 : 0;

      /* Under caution a car closes on the one ahead until it is a second
         behind, and no further. Each car therefore starts from its own gap,
         closes at its own rate and settles at its own moment — a field
         bunching up, rather than a picture being scaled. */
      const neutral = this.status === "GREEN" || r === 0 ? 0
        : -Math.min(0.5, Math.max(0, interval - 0.9)) * 0.55 * c.closeRate;

      c.effective = c.pace + degradation + dirty + drs + clean + neutral + c.wobble;

      /* A sector falls to each car when that car reaches it. The interval is
         its own, the phase is its own, and the colour it lights depends on how
         the car is actually going — so the pips are a readout rather than a
         decoration blinking on a timer. */
      if (t > c.sectorAt) {
        c.sectorAt = t + 1.4 + this.rnd() * 1.5;
        c.sectorPhase = (c.sectorPhase + 1) % 3;
        /* Relative to the car's OWN rolling pace, not to the field's. A
           sector colour answers "was that good for them", which is why a
           midfield car can light green — comparing against the leader instead
           left three rows permanently amber, which is accurate and useless. */
        const own = c.effective < c.paceRef - 0.04;
        const best = c.effective <= fastest + 0.005;
        const grade = best && this.rnd() > 0.4 ? 2 : own ? 1 : 3;
        c.sectors[c.sectorPhase] = grade;
        /* THE ROW WASHES WHEN THE SECTOR LANDS, NOT WHEN A BEAT FIRES.
           The flash used to be reserved for the handful of staged moments,
           which made it a rare event on a panel that is supposed to look
           continuously busy. It belongs to the thing it describes: a car sets
           a sector, and its row says so. Purple always; a personal best about
           a third of the time, so green stays worth noticing. Every car is on
           its own sector clock, so no two rows can wash together. */
        if (grade === 2) this.markFlash(ord[r], "purple", t);
        else if (grade === 1 && this.rnd() < 0.34) this.markFlash(ord[r], "green", t);
      }
      // the trap speed follows the pace, with its own small tremor
      c.speed += ((332 - c.effective * 26 + Math.sin(t * 1.7 + c.ref) * 4) - c.speed)
        * Math.min(1, dt * 1.3);

      c.ers += (c.ersUp ? 0.075 : (c.drs ? -0.2 : -0.13)) * dt;
      if (c.ers > 0.97) { c.ers = 0.97; c.ersUp = false; }
      if (c.ers < 0.13) { c.ers = 0.13; c.ersUp = true; }

      /* ---- the pedals ----------------------------------------------------
         A lap is a sequence of braking zones, and where the car is in that
         sequence is already known: `trackU` is its place around the circuit.
         Reading the pedals off it rather than off a timer is what stops this
         being decoration — the bar that drops is the dot arriving at a corner,
         and a car that is lapped drifts out of phase with the leader by
         itself, because its trackU does.

         Under a caution nobody is on the throttle, which the panel then shows
         without being told: `neutral` is already in `effective`. */
      const lapPh = c.trackU * Math.PI * 2 * c.cornerCount + c.cornerPhase;
      const zone = 0.5 + 0.5 * Math.sin(lapPh);            // 1 at a corner, 0 on a straight
      const lift = Math.pow(zone, 2.2);
      const cap = this.status === "GREEN" ? 1 : 0.62;
      const wantT = clamp01((1 - lift * 1.15) * cap + Math.sin(t * 5.1 + c.ref) * 0.03);
      const wantB = clamp01((lift - 0.52) * 2.3 * cap);
      // pedals move fast, but not instantly: 60ms of travel, not a square wave
      c.throttle += (wantT - c.throttle) * Math.min(1, dt * 13);
      c.brake += (wantB - c.brake) * Math.min(1, dt * 16);

      // fuel burns with distance run, so it only ever falls, and slowly
      c.fuel = Math.max(1.4, c.fuel - dt * (1.55 / LAP_S));
      // the lane takes about as long to travel as the stop takes to cost
      if (c.pitPhase > 0) c.pitPhase = Math.max(0, c.pitPhase - dt / 7);

      // the interval's own direction of travel, eased hard enough to be read
      const trendNow = ahead ? (interval - c.prevInterval) / Math.max(1e-4, dt) : 0;
      c.prevInterval = interval;
      c.trend += (Math.max(-1, Math.min(1, trendNow * 24)) - c.trend) * Math.min(1, dt * 1.6);

      /* A lap time lands when the car crosses the line — its own line, at its
         own moment. Eighty-odd seconds of real circuit, scaled from the pace
         the simulation is actually carrying. */
      if (c.trackU < c.lastU) {
        c.lastLap = 84.6 + c.effective * 1.9 + (this.rnd() - 0.5) * 0.5
          + (this.status === "GREEN" ? 0 : 14 + this.rnd() * 5);
      }
      c.lastU = c.trackU;
    }
  }

  private integrateGaps(dt: number, t: number) {
    const ord = this.order();
    const ref = this.cars[ord[0]].effective;

    for (const c of this.cars) {
      const rel = c.effective - ref;
      c.gap += rel * (dt / LAP_S);
      // the stop is paid out over about three seconds, never in one frame
      if (c.pitOwed > 0.01) {
        /* A CONSTANT RATE, NOT AN EXPONENTIAL ONE.
           Easing pays most of the debt in the first few frames, which is a
           near-vertical drop however smooth the curve technically is. At two
           and a half seconds of gap per second of real time, a twenty-second
           stop unfolds over eight seconds — five hundred pixels of screen, and
           a car sliding down the order rather than falling through it. */
        const pay = Math.min(c.pitOwed, 2.5 * dt);
        c.gap += pay;
        c.pitOwed -= pay;
      }
      if (c.gap < 0) c.gap = 0;
    }

    // the leader is the datum, always
    let min = Infinity;
    for (const c of this.cars) min = Math.min(min, c.gap);
    if (min > 0) for (const c of this.cars) c.gap -= min;

    /* The span adapts slowly toward the spread of the field, so a leader
       pulling away compresses everyone behind — visible, and true — without
       the picture ever rescaling fast enough to notice. */
    let max = 0;
    for (const c of this.cars) max = Math.max(max, c.gap);
    /* The span is the one quantity that legitimately has to be shared, since
       it is the scale of the picture. It is therefore made as slow as it can
       be without the field ever leaving the frame: a thirty-second time
       constant is below the rate at which a viewer can attribute a change to
       any moment, and the clamp is tight enough that it rarely has far to go. */
    const want = Math.max(5, Math.min(13, max * 1.08));
    this.span += (want - this.span) * Math.min(1, dt * 0.033);

    // where each car is around the lap, for the minimap
    this.trackClock += dt / TRACK_LAP_S;
    for (const c of this.cars) {
      /* Position around the lap comes from the gap, so the dots really are in
         the running order and really do close up, fall back and get lapped —
         and because each gap moves at its own rate, so does each dot. */
      c.trackU = ((this.trackClock - c.gap * 0.03) % 1 + 1) % 1;
      // a rolling form trace for each row's sparkline
      if (this.rnd() < dt * 0.9) {
        c.form.push(clamp01(0.5 - c.effective * 1.4 + (this.rnd() - 0.5) * 0.2));
        if (c.form.length > 5) c.form.shift();
      }
    }
  }

  private rankChanges(t: number, dt: number) {
    const ord = this.order();
    // the eased rank follows the real one, so a swap bends rather than steps
    for (let r = 0; r < ord.length; r++) {
      const c = this.cars[ord[r]];
      c.rankF += (r - c.rankF) * Math.min(1, dt * c.rankEase);
    }
    for (let r = 0; r < ord.length; r++) {
      const c = this.cars[ord[r]];
      if (c.rank === r) continue;
      c.rankDelta = c.rank - r;
      c.rankMoved = t;
      const was = c.rank;
      c.rank = r;
      // a real pass just happened; say so, but not more than once a beat
      if (c.rankDelta > 0 && was - r === 1 && t > this.nextBeat - 3) {
        const lost = this.cars[ord[r + 1]];
        this.note({
          kind: "overtake", car: ord[r], label: "OVERTAKE",
          value: `${POOL[c.ref].code} ▸ ${POOL[lost.ref].code}`,
          viz: "pulse", series: [], tone: "gain",
        }, t, 4.5);
      }
    }
  }

  /* ---- packets ----------------------------------------------------------- */

  private emitPulses(t: number) {
    if (this.pulses.length >= 3) return;
    if (this.pulses.length > 0 && t < this.nextPulse) return;
    const busy = new Set(this.pulses.map((p) => p.car));
    const free: number[] = [];
    for (let i = 0; i < N; i++) if (!busy.has(i)) free.push(i);
    if (!free.length) return;
    free.sort((a, b) => this.cars[a].gap - this.cars[b].gap);
    const pick = free[Math.floor(this.rnd() ** 1.7 * free.length)];
    this.pulses.push({
      car: pick, u: -0.06, speed: 0.21 + this.rnd() * 0.13,
      heat: 0.9 - this.cars[pick].rank * 0.055, born: t, life: 9,
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

  annotationU(a: Annotation): number {
    return a.bornU - (this.t - a.born) / HISTORY_S;
  }

  private note(a: Omit<Annotation, "id" | "born" | "bornU" | "life" | "ref">, t: number, life = 3.2) {
    /* One to three at a time, on different cars, with independent lifetimes.
       The population is what matters — a fixed cadence with a fixed duration
       is a metronome, and a metronome is the one thing "alive" is not. */
    if (this.annotations.some((x) => x.car === a.car)) return;
    if (this.annotations.length >= 3) this.annotations.shift();
    this.annotations.push({
      ...a, ref: this.cars[a.car].ref, id: this.annId++, born: t, bornU: 0.72, life,
    });
  }

  private series(seed: number, drift: number): number[] {
    const r = mulberry32(seed);
    const out: number[] = [];
    let v = 0.5;
    for (let i = 0; i < 8; i++) {
      v = clamp01(v + (r() - 0.5) * 0.32 + drift);
      out.push(v);
    }
    return out;
  }

  private ageAnnotations(t: number) {
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const a = this.annotations[i];
      if (t - a.born > a.life || this.annotationU(a) < 0.4) this.annotations.splice(i, 1);
    }
  }

  /* ---- the commentator ---------------------------------------------------
     It no longer decides what happens. It watches the race and reports it,
     and only reaches for a canned reading when the race is not offering one. */
  private commentate(t: number) {
    if (t < this.nextBeat || this.changing > 0) return;
    /* Cadence against lifetime is what sets the population. Beats every 1.9
       to 4.3 seconds against cards that live 3.5 to 5.5 gives between one and
       three on screen, with the occasional clean moment — which is the shape
       the brief asks for and the shape a real feed has. */
    this.nextBeat = t + 1.9 + this.rnd() * 2.4;

    const ord = this.order();
    const dp = () => (100 + Math.floor(this.rnd() * 899)).toString();
    const front = () => ord[Math.floor(this.rnd() * 4)];

    /* First: is the race itself saying something? A gap under a second in the
       top half is a battle, and a battle is more interesting than any reading
       we could invent. */
    for (let r = 1; r < 5; r++) {
      const c = this.cars[ord[r]];
      const iv = c.gap - this.cars[ord[r - 1]].gap;
      if (iv < 0.75 && c.drs && !this.recent.includes("closing")) {
        this.remember("closing");
        this.note({
          kind: "closing", car: ord[r], label: "GAP CLOSING",
          value: `${iv.toFixed(2)}s`, viz: "wave",
          series: this.series(this.annId * 7919, -0.04), tone: "gain",
        }, t, 4.7);
        return;
      }
    }

    const pool: BeatKind[] = [
      "drs", "drs", "sector", "purple", "best", "push", "battery", "gap", "gap",
      "tyreTemp", "fuel", "deg", "fastest", "pit", "undercut", "limits",
      "engine", "brake", "safety", "vsc", "yellow", "rain",
    ];
    let kind = pool[Math.floor(this.rnd() * pool.length)];
    let guard = 0;
    while (this.recent.includes(kind) && guard++ < 10) {
      kind = pool[Math.floor(this.rnd() * pool.length)];
    }
    this.remember(kind);

    const car = front();
    const mid = ord[2 + Math.floor(this.rnd() * 4)];
    const S = () => 1 + Math.floor(this.rnd() * 3);

    switch (kind) {
      case "safety":
        this.status = "SAFETY CAR"; this.statusUntil = t + 9;
        this.timeTo = 0.78;
        this.note({ kind, car: ord[0], label: "SAFETY CAR", value: "neutralised",
          viz: "scan", series: [], tone: "alert" }, t, 5.4);
        break;
      case "vsc":
        this.status = "VSC"; this.statusUntil = t + 6;
        this.timeTo = 0.7;
        this.note({ kind, car: ord[0], label: "VIRTUAL SC", value: "delta +0.4",
          viz: "scan", series: [], tone: "caution" }, t, 4.7);
        break;
      case "yellow":
        this.status = "YELLOW"; this.statusUntil = t + 4.5;
        this.timeTo = 0.62;
        this.note({ kind, car: mid, label: "YELLOW FLAG", value: `sector ${S()}`,
          viz: "pulse", series: [], tone: "caution" }, t, 4.3);
        break;
      case "pit": {
        const c = this.cars[mid];
        c.pitOwed += 19 + this.rnd() * 4;
        c.tyreAge = 0;
        c.tyre = Math.floor(this.rnd() * 3);
        c.stint += 1;
        c.pitPhase = 1;
        this.note({ kind, car: mid, label: "PIT STOP",
          value: `${(2.1 + this.rnd() * 0.7).toFixed(1)}s`, viz: "bars",
          series: this.series(this.annId * 104729, 0), tone: "neutral" }, t, 4.5);
        break;
      }
      case "undercut":
        this.note({ kind, car: mid, label: "UNDERCUT", value: `+${(0.4 + this.rnd()).toFixed(1)}s`,
          viz: "spark", series: this.series(this.annId * 15485863, -0.05), tone: "gain" }, t, 4.5);
        break;
      case "drs":
        this.pulses.push({ car, u: 0.02, speed: 0.5, heat: 1.1, born: t, life: 4 });
        this.note({ kind, car, label: "DRS ENABLED", value: `+${(11 + this.rnd() * 8).toFixed(0)} km/h`,
          viz: "gauge", series: [], tone: "gain" }, t, 5.2);
        break;
      case "fastest":
        this.pulses.push({ car, u: -0.05, speed: 0.86, heat: 1.7, born: t, life: 3 });
        this.markFlash(car, "purple", t);
        this.note({ kind, car, label: "FASTEST LAP", value: `1:2${3 + Math.floor(this.rnd() * 2)}.${dp()}`,
          viz: "spark", series: this.series(this.annId * 7919, -0.06), tone: "gain" }, t, 4.9);
        break;
      case "purple":
        this.markFlash(car, "purple", t);
        this.pulses.push({ car, u: 0.08, speed: 0.46, heat: 1.3, born: t, life: 4 });
        this.note({ kind, car, label: `PURPLE S${S()}`, value: `−0.${dp()}`,
          viz: "bars", series: this.series(this.annId * 104729, -0.05), tone: "gain" }, t, 5.4);
        break;
      case "best":
        this.markFlash(car, "green", t);
        this.note({ kind, car: mid, label: "PERSONAL BEST", value: `1:2${4 + Math.floor(this.rnd() * 2)}.${dp()}`,
          viz: "spark", series: this.series(this.annId * 15485863, -0.03), tone: "gain" }, t, 5.4);
        break;
      case "sector":
        this.note({ kind, car: mid, label: `SECTOR ${S()}`, value: `−0.${dp()}`,
          viz: "bars", series: this.series(this.annId * 999331, -0.04), tone: "neutral" }, t, 5.3);
        break;
      case "rain":
        this.weather = "LIGHT RAIN";
        this.note({ kind, car: ord[0], label: "RAIN RADAR", value: "12 min",
          viz: "wave", series: this.series(this.annId * 41, 0.02), tone: "caution" }, t, 4.7);
        break;
      case "limits":
        this.note({ kind, car: mid, label: "TRACK LIMITS", value: `turn ${4 + Math.floor(this.rnd() * 9)}`,
          viz: "pulse", series: [], tone: "caution" }, t, 5.2);
        break;
      case "engine":
        this.note({ kind, car, label: "ENGINE MODE", value: `mode ${2 + Math.floor(this.rnd() * 4)}`,
          viz: "gauge", series: [], tone: "neutral" }, t, 5.2);
        break;
      case "brake":
        this.note({ kind, car: mid, label: "BRAKE TEMP", value: `${540 + Math.floor(this.rnd() * 260)}°C`,
          viz: "wave", series: this.series(this.annId * 53, 0.03), tone: "caution" }, t, 5.3);
        break;
      case "battery":
        this.cars[car].ers = 0.95; this.cars[car].ersUp = false;
        this.note({ kind, car, label: "ERS DEPLOY", value: `${80 + Math.floor(this.rnd() * 19)}%`,
          viz: "gauge", series: [], tone: "gain" }, t, 5.2);
        break;
      case "gap": {
        const r = 1 + Math.floor(this.rnd() * 4);
        const c = ord[r];
        const iv = this.cars[c].gap - this.cars[ord[r - 1]].gap;
        this.note({ kind, car: c, label: "GAP", value: `+${iv.toFixed(2)}s`,
          viz: "wave", series: this.series(this.annId * 61, 0), tone: "neutral" }, t, 5.1);
        break;
      }
      case "tyreTemp":
        this.note({ kind, car: mid, label: "TYRE TEMP", value: `${96 + Math.floor(this.rnd() * 18)}°C`,
          viz: "bars", series: this.series(this.annId * 71, 0.02), tone: "caution" }, t, 5.2);
        break;
      case "fuel":
        this.note({ kind, car: mid, label: "FUEL TARGET", value: `${(0.4 + this.rnd() * 1.4).toFixed(2)} kg`,
          viz: "gauge", series: [], tone: "neutral" }, t, 5.2);
        break;
      case "push":
        this.pulses.push({ car, u: 0.02, speed: 0.55, heat: 1.2, born: t, life: 4 });
        this.note({ kind, car, label: "PUSH LAP", value: `${2 + Math.floor(this.rnd() * 4)} laps`,
          viz: "spark", series: this.series(this.annId * 83, -0.05), tone: "gain" }, t, 5.2);
        break;
      default:
        this.note({ kind: "deg", car: mid, label: "TYRE DEG",
          value: `+0.0${3 + Math.floor(this.rnd() * 6)} s/lap`, viz: "spark",
          series: this.series(this.annId * 97, 0.05), tone: "caution" }, t, 4.5);
    }
  }

  private markFlash(car: number, kind: string, t: number) {
    this.cars[car].flash = kind;
    this.cars[car].flashUntil = t + 2.1;
  }

  private remember(k: BeatKind) {
    this.recent.push(k);
    if (this.recent.length > 7) this.recent.shift();
  }
}
