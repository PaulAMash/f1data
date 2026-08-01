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

/* Inspired by, never copied from. Each is a closed loop in a 0..1 box with a
   character of its own: one flowing, one tight, one long-straight, one wide
   and fast, one compact. */
export const LAYOUTS: Layout[] = [
  {
    name: "flowing",
    start: [0.10, 0.62],
    segs: [
      [0.02, 0.40, 0.14, 0.16, 0.34, 0.18],
      [0.52, 0.20, 0.52, 0.42, 0.64, 0.44],
      [0.78, 0.46, 0.82, 0.22, 0.94, 0.30],
      [1.02, 0.37, 0.98, 0.66, 0.84, 0.70],
      [0.68, 0.75, 0.60, 0.62, 0.46, 0.66],
      [0.30, 0.71, 0.20, 0.86, 0.10, 0.62],
    ],
  },
  {
    name: "tight",
    start: [0.14, 0.72],
    segs: [
      [0.10, 0.52, 0.16, 0.30, 0.30, 0.24],
      [0.40, 0.20, 0.44, 0.36, 0.54, 0.36],
      [0.66, 0.36, 0.62, 0.14, 0.78, 0.16],
      [0.92, 0.18, 0.94, 0.44, 0.86, 0.56],
      [0.78, 0.68, 0.52, 0.56, 0.42, 0.68],
      [0.32, 0.80, 0.22, 0.88, 0.14, 0.72],
    ],
  },
  {
    name: "long straight",
    start: [0.08, 0.50],
    segs: [
      [0.08, 0.28, 0.26, 0.20, 0.42, 0.24],
      [0.56, 0.28, 0.56, 0.40, 0.70, 0.40],
      [0.86, 0.40, 0.90, 0.22, 0.96, 0.34],
      [1.01, 0.45, 0.94, 0.60, 0.80, 0.62],
      [0.60, 0.65, 0.44, 0.54, 0.30, 0.60],
      [0.18, 0.65, 0.08, 0.68, 0.08, 0.50],
    ],
  },
  {
    name: "fast sweeps",
    start: [0.12, 0.44],
    segs: [
      [0.14, 0.20, 0.36, 0.14, 0.48, 0.26],
      [0.58, 0.36, 0.54, 0.48, 0.64, 0.52],
      [0.76, 0.57, 0.86, 0.34, 0.94, 0.44],
      [1.00, 0.52, 0.96, 0.70, 0.82, 0.74],
      [0.64, 0.79, 0.46, 0.66, 0.32, 0.72],
      [0.20, 0.77, 0.10, 0.64, 0.12, 0.44],
    ],
  },
  {
    name: "compact",
    start: [0.18, 0.66],
    segs: [
      [0.12, 0.46, 0.22, 0.26, 0.38, 0.26],
      [0.50, 0.26, 0.48, 0.42, 0.58, 0.44],
      [0.70, 0.46, 0.74, 0.26, 0.86, 0.32],
      [0.96, 0.37, 0.94, 0.56, 0.84, 0.62],
      [0.72, 0.69, 0.54, 0.60, 0.44, 0.66],
      [0.34, 0.72, 0.26, 0.82, 0.18, 0.66],
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

  constructor(readonly layout: Layout, resolution = 40) {
    let p0 = layout.start;
    this.pts.push(p0);
    for (const s of layout.segs) {
      for (let i = 1; i <= resolution; i++) this.pts.push(cubic(p0, s, i / resolution));
      p0 = [s[4], s[5]];
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
    p.moveTo(this.layout.start[0], this.layout.start[1]);
    for (const s of this.layout.segs) p.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
    p.closePath();
    this.cachedPath = p;
    return p;
  }
}

/**
 * The lap, the layout, and the transition between layouts.
 *
 * A lap takes `LAP_S`; at the end of one, the next circuit is chosen and the
 * shape is interpolated into it over `MORPH_S` while the car keeps running —
 * the road bends into a different road underneath it rather than cutting.
 */
export class MiniTrack {
  private i = 0;
  private next = 0;
  private morph = 0;          // 0 = settled, >0 = fraction through a morph
  private lap = 0;
  private cache: TrackPath;

  static LAP_S = 15;
  static MORPH_S = 2.2;

  constructor(private rnd: () => number = Math.random) {
    this.i = Math.floor(this.rnd() * LAYOUTS.length);
    this.next = this.i;
    this.cache = new TrackPath(LAYOUTS[this.i]);
  }

  step(dt: number) {
    const wasLap = this.lap;
    this.lap += dt / MiniTrack.LAP_S;

    if (this.morph > 0) {
      this.morph += dt / MiniTrack.MORPH_S;
      if (this.morph >= 1) {
        this.morph = 0;
        this.i = this.next;
        this.cache = new TrackPath(LAYOUTS[this.i]);
      } else {
        this.cache = new TrackPath(blend(LAYOUTS[this.i], LAYOUTS[this.next], ease(this.morph)));
      }
      return;
    }

    // a lap just completed: pick a different circuit and start bending into it
    if (Math.floor(this.lap) !== Math.floor(wasLap)) {
      let n = Math.floor(this.rnd() * LAYOUTS.length);
      if (n === this.i) n = (n + 1) % LAYOUTS.length;
      this.next = n;
      this.morph = 0.0001;
    }
  }

  get track() { return this.cache; }
  /** where the car is, 0..1 of the current lap */
  get u() { return this.lap % 1; }
  /** 1 while settled, dipping while the road is changing shape */
  get settled() { return this.morph > 0 ? 1 - Math.sin(ease(this.morph) * Math.PI) * 0.45 : 1; }
}

const ease = (k: number) => k * k * (3 - 2 * k);
