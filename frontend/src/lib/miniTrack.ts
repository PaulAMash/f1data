/* -------------------------------------------------------------------------- */
/* The minimap.                                                               */
/*                                                                            */
/* The first version drew the circuit as a Path2D of cubic beziers and then    */
/* animated the marker along a *straight line between the segment endpoints*,  */
/* which is not the same curve — so the car regularly cut the corner across    */
/* open space and left the track entirely. A marker that leaves the road is    */
/* worse than no marker, because it says the picture is decorative.            */
/*                                                                            */
/* One source of truth here: a layout is an array of cubic segments, and both  */
/* the outline and the marker are derived from it. The marker is placed by     */
/* ARC LENGTH rather than by parameter, so it also travels at constant speed —  */
/* a bezier's `t` runs fast through gentle curves and slow through tight ones,  */
/* which would have made the car surge and dawdle around every corner.         */
/*                                                                            */
/* Layouts share a segment count so one can be interpolated into another. The  */
/* lap ends, the shape morphs over two seconds, and the next lap runs a         */
/* different circuit — which is the cheapest possible way to make a background  */
/* element that nobody is looking at never repeat itself.                      */
/* -------------------------------------------------------------------------- */

/** [c1x, c1y, c2x, c2y, ex, ey] — a cubic, relative to the previous end. */
export type Seg = [number, number, number, number, number, number];

export interface Layout {
  name: string;
  start: [number, number];
  segs: Seg[];      // always SEGS long, so any two can be interpolated
}

const SEGS = 6;

/* Inspired by, never copied from — the rhythm of a circuit rather than its
   survey. Each is a closed loop of six cubics in a 0..1 box, and they all share
   that segment count so any one can be interpolated into any other. */
export const LAYOUTS: Layout[] = [
  {
    name: "MONZA",            // two long straights, three chicanes
    start: [0.06, 0.54],
    segs: [
      [0.06, 0.30, 0.20, 0.18, 0.40, 0.20],
      [0.62, 0.22, 0.60, 0.34, 0.74, 0.32],
      [0.90, 0.30, 0.98, 0.24, 0.97, 0.40],
      [0.96, 0.54, 0.86, 0.52, 0.78, 0.58],
      [0.62, 0.66, 0.44, 0.58, 0.28, 0.64],
      [0.16, 0.69, 0.06, 0.72, 0.06, 0.54],
    ],
  },
  {
    name: "SUZUKA",           // the figure-of-eight pinch, esses at the top
    start: [0.10, 0.60],
    segs: [
      [0.06, 0.38, 0.18, 0.20, 0.34, 0.22],
      [0.48, 0.24, 0.42, 0.44, 0.56, 0.46],
      [0.70, 0.48, 0.76, 0.20, 0.90, 0.28],
      [1.01, 0.35, 0.96, 0.62, 0.82, 0.68],
      [0.66, 0.74, 0.58, 0.60, 0.44, 0.64],
      [0.28, 0.69, 0.16, 0.82, 0.10, 0.60],
    ],
  },
  {
    name: "SPA",              // long uphill sweep, fast right-handers
    start: [0.08, 0.50],
    segs: [
      [0.08, 0.26, 0.28, 0.18, 0.44, 0.24],
      [0.58, 0.29, 0.56, 0.42, 0.70, 0.41],
      [0.88, 0.40, 0.92, 0.20, 0.97, 0.35],
      [1.01, 0.47, 0.93, 0.61, 0.79, 0.63],
      [0.58, 0.66, 0.44, 0.54, 0.29, 0.61],
      [0.17, 0.66, 0.08, 0.69, 0.08, 0.50],
    ],
  },
  {
    name: "SILVERSTONE",      // wide, fast, everything a radius
    start: [0.13, 0.44],
    segs: [
      [0.15, 0.19, 0.37, 0.13, 0.49, 0.26],
      [0.59, 0.37, 0.55, 0.49, 0.65, 0.53],
      [0.77, 0.58, 0.87, 0.33, 0.95, 0.44],
      [1.01, 0.53, 0.97, 0.71, 0.83, 0.75],
      [0.65, 0.80, 0.47, 0.67, 0.33, 0.73],
      [0.21, 0.78, 0.11, 0.65, 0.13, 0.44],
    ],
  },
  {
    name: "HUNGARORING",      // tight, twisty, no room anywhere
    start: [0.15, 0.72],
    segs: [
      [0.10, 0.52, 0.17, 0.29, 0.31, 0.24],
      [0.41, 0.20, 0.45, 0.37, 0.55, 0.37],
      [0.67, 0.37, 0.63, 0.14, 0.79, 0.17],
      [0.93, 0.19, 0.95, 0.45, 0.86, 0.57],
      [0.77, 0.69, 0.52, 0.56, 0.42, 0.69],
      [0.32, 0.81, 0.22, 0.89, 0.15, 0.72],
    ],
  },
  {
    name: "SINGAPORE",        // a street circuit: corners like a city block
    start: [0.12, 0.68],
    segs: [
      [0.10, 0.48, 0.14, 0.24, 0.32, 0.22],
      [0.46, 0.20, 0.42, 0.38, 0.52, 0.40],
      [0.64, 0.42, 0.68, 0.22, 0.84, 0.24],
      [0.98, 0.26, 0.98, 0.50, 0.88, 0.60],
      [0.76, 0.71, 0.56, 0.58, 0.42, 0.66],
      [0.30, 0.73, 0.18, 0.86, 0.12, 0.68],
    ],
  },
  {
    name: "INTERLAGOS",       // compact, a long left sweep onto the pit straight
    start: [0.18, 0.66],
    segs: [
      [0.11, 0.46, 0.22, 0.25, 0.39, 0.26],
      [0.51, 0.27, 0.48, 0.43, 0.59, 0.45],
      [0.71, 0.47, 0.75, 0.25, 0.87, 0.32],
      [0.97, 0.38, 0.95, 0.57, 0.84, 0.63],
      [0.72, 0.70, 0.54, 0.60, 0.44, 0.67],
      [0.34, 0.73, 0.25, 0.83, 0.18, 0.66],
    ],
  },
];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** A layout part-way between two, so a circuit can become another circuit. */
export function blend(a: Layout, b: Layout, k: number): Layout {
  return {
    name: k < 0.5 ? a.name : b.name,
    start: [lerp(a.start[0], b.start[0], k), lerp(a.start[1], b.start[1], k)],
    segs: a.segs.map((s, i) =>
      s.map((v, j) => lerp(v, b.segs[i][j], k)) as Seg),
  };
}

function cubic(p0: [number, number], s: Seg, t: number): [number, number] {
  const m = 1 - t;
  const a = m * m * m, bq = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [
    a * p0[0] + bq * s[0] + c * s[2] + d * s[4],
    a * p0[1] + bq * s[1] + c * s[3] + d * s[5],
  ];
}

/**
 * An arc-length table for a layout.
 *
 * `at(u)` takes a fraction of the LAP, not of the parameter, so the marker
 * covers equal distance in equal time all the way round.
 */
export class TrackPath {
  private pts: [number, number][] = [];
  private cum: number[] = [];
  readonly length: number;

  /** An open path from points already in normalised space — see pitLane. */
  static fromPoints(pts: [number, number][]): TrackPath {
    const t = new TrackPath(EMPTY_LAYOUT, 1, pts);
    return t;
  }

  constructor(readonly layout: Layout, resolution = 40, points?: [number, number][]) {
    if (points) {
      this.pts = points;
    } else {
      let p0 = layout.start;
      this.pts.push(p0);
      for (const s of layout.segs) {
        for (let i = 1; i <= resolution; i++) this.pts.push(cubic(p0, s, i / resolution));
        p0 = [s[4], s[5]];
      }
    }
    let total = 0;
    this.cum.push(0);
    for (let i = 1; i < this.pts.length; i++) {
      const dx = this.pts[i][0] - this.pts[i - 1][0];
      const dy = this.pts[i][1] - this.pts[i - 1][1];
      total += Math.hypot(dx, dy);
      this.cum.push(total);
    }
    this.length = total;
  }

  /** Position at `u` of a lap, 0..1. Always exactly on the drawn curve. */
  at(u: number): [number, number] {
    const target = ((u % 1) + 1) % 1 * this.length;
    // the table is monotonic, so a binary search is exact and allocation-free
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= target) lo = mid; else hi = mid;
    }
    const span = this.cum[hi] - this.cum[lo] || 1;
    const k = (target - this.cum[lo]) / span;
    return [
      lerp(this.pts[lo][0], this.pts[hi][0], k),
      lerp(this.pts[lo][1], this.pts[hi][1], k),
    ];
  }

  private cachedPath: Path2D | null = null;

  /** The outline, in the same normalised space, for stroking. Built once — a
      Path2D per frame is an allocation and a re-parse for a shape that only
      changes when the layout does. */
  path(): Path2D {
    if (this.cachedPath) return this.cachedPath;
    const p = new Path2D();
    if (this.layout === EMPTY_LAYOUT) {
      // an open path built from samples: still one source of truth with at()
      p.moveTo(this.pts[0][0], this.pts[0][1]);
      for (let i = 1; i < this.pts.length; i++) p.lineTo(this.pts[i][0], this.pts[i][1]);
    } else {
      p.moveTo(this.layout.start[0], this.layout.start[1]);
      for (const s of this.layout.segs) p.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
      p.closePath();
    }
    this.cachedPath = p;
    return p;
  }
}

const EMPTY_LAYOUT: Layout = { name: "", start: [0, 0], segs: [] };

/**
 * The layout, and the transition between layouts.
 *
 * THE CIRCUIT CHANGES WHEN THE RACE DOES, NOT ON A CLOCK OF ITS OWN.
 *
 * This used to run a thirty-four second lap timer and pick a new circuit at the
 * end of each one, which meant the tracker was showing Suzuka while the timing
 * panel was thirty laps into a race that had started at Monza. Two clocks, and
 * the reader can always tell — it is the same mistake the hero itself was built
 * to avoid, one widget down.
 *
 * The morph is now requested by whoever owns the race, at the moment a race
 * ends. Between those moments this class does exactly one thing: bend one road
 * into another over MORPH_S while cars keep running on it.
 */
export class MiniTrack {
  private i = 0;
  private next = 0;
  private morph = 0;          // 0 = settled, >0 = fraction through a morph
  private cache: TrackPath;
  private pit: TrackPath;

  static MORPH_S = 2.6;

  constructor(private rnd: () => number = Math.random) {
    this.i = Math.floor(this.rnd() * LAYOUTS.length);
    this.next = this.i;
    this.cache = new TrackPath(LAYOUTS[this.i]);
    this.pit = pitLane(this.cache);
  }

  /** Begin bending into a different circuit. Ignored if one is already bending. */
  toNext() {
    if (this.morph > 0) return;
    let n = Math.floor(this.rnd() * LAYOUTS.length);
    if (n === this.i) n = (n + 1) % LAYOUTS.length;
    this.next = n;
    this.morph = 0.0001;
  }

  step(dt: number) {
    if (this.morph <= 0) return;
    this.morph += dt / MiniTrack.MORPH_S;
    if (this.morph >= 1) {
      this.morph = 0;
      this.i = this.next;
      this.cache = new TrackPath(LAYOUTS[this.i]);
    } else {
      this.cache = new TrackPath(blend(LAYOUTS[this.i], LAYOUTS[this.next], ease(this.morph)));
    }
    this.pit = pitLane(this.cache);
  }

  get track() { return this.cache; }
  /** the pit lane, as its own path, so a stopping car has somewhere to go */
  get lane() { return this.pit; }
  /** 1 while settled, dipping while the road is changing shape */
  get settled() { return this.morph > 0 ? 1 - Math.sin(ease(this.morph) * Math.PI) * 0.4 : 1; }
  /** the circuit's name, for the widget's header */
  get name() { return this.cache.layout.name; }
  /** true while one circuit is becoming another */
  get morphing() { return this.morph > 0; }
}

/* -------------------------------------------------------------------------- */
/**
 * A pit lane, derived from the road rather than drawn per circuit.
 *
 * Seven hand-drawn pit lanes would be seven more things to keep in step with
 * seven layouts, and they would all have to be re-drawn the moment a layout
 * changed. This takes the stretch of road either side of the line and pushes it
 * toward the middle of the circuit — which is where a pit lane is, on every
 * circuit, for the same reason. It morphs with the road for free.
 */
function pitLane(road: TrackPath): TrackPath {
  const FROM = 0.9, TO = 1.12, STEPS = 12, INSET = 0.055;
  // the middle of the whole shape, so "inward" means something
  let cx = 0, cy = 0;
  for (let i = 0; i <= 24; i++) {
    const [x, y] = road.at(i / 24);
    cx += x / 25; cy += y / 25;
  }
  const pts: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const u = FROM + (TO - FROM) * (i / STEPS);
    const [x, y] = road.at(u);
    // ease the inset in and out so the lane leaves and rejoins the road
    const k = Math.sin((i / STEPS) * Math.PI) * INSET;
    const dx = cx - x, dy = cy - y;
    const d = Math.hypot(dx, dy) || 1;
    pts.push([x + (dx / d) * k, y + (dy / d) * k]);
  }
  return TrackPath.fromPoints(pts);
}

const ease = (k: number) => k * k * (3 - 2 * k);
