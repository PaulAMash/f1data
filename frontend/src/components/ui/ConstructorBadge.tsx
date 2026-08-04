"use client";
import { useEffect, useState } from "react";
import {
  LOGO_COMPOSED_COVERAGE, logoFit, logoSrc, markField, opticalScale,
} from "@/lib/constructors";
import { cx } from "@/lib/format";
import { ConstructorShield } from "./ConstructorMark";

/* -------------------------------------------------------------------------- */
/* THE CONSTRUCTOR BADGE.                                                     */
/*                                                                            */
/* One component, every surface. A driver is a face in a circle everywhere in  */
/* this product; a constructor is now a mark in a circle of the same size, set */
/* the same way, so a row that carries both reads as one object rather than as */
/* a photo next to a logo somebody pasted on.                                  */
/*                                                                            */
/* A CIRCLE, AND NOT A ROUNDED BOX. Two reasons, and they agree. The first is  */
/* that `DriverAvatar` is a circle: the badge sits beside it in the standings, */
/* in the gallery and on the focus card, and two different container shapes at */
/* the same size read as two different systems. The second is that a team's    */
/* own mark is usually supplied as a composed roundel — and a circular asset   */
/* inside a rounded square leaves four lit corners of livery behind it, which  */
/* is the exact "pasted on" look this release exists to remove.                */
/*                                                                            */
/* THE TINT IS BEHIND THE MARK, NOT AROUND IT. The wash and the ring are drawn */
/* on the container, so a composed opaque roundel covers them completely and   */
/* you see the official badge; a transparent emblem lets them through and gets */
/* the soft livery field it needs to sit on. One treatment, correct for both   */
/* kinds of file, with nothing to configure per asset.                        */
/*                                                                            */
/* IT NEVER FAILS TO A HOLE. No file, a 404, a team that has not existed since */
/* 1976: the drawn shield renders instead, in the same circle at the same      */
/* size. The reader sees a complete row either way — which is what let this    */
/* ship before the licensed assets did.                                       */
/* -------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   ONE PROBE PER CONSTRUCTOR, NOT ONE PER BADGE.

   A championship table is eleven teams over twenty rows and a gallery is
   eleven cards; probing per instance meant the same asset was requested twenty
   times on mount, and every re-render started again from "unknown" and flashed
   the shield before settling. The result is a module-level cache: a resolved
   team is answered synchronously on the FIRST render, so a badge that has been
   seen once never flickers again for the rest of the session.

   It is a module constant rather than state in a provider on purpose — the
   answer is a property of the deployment, not of the tree, and it must survive
   every unmount between one page and the next.
   --------------------------------------------------------------------------- */
type Probe =
  | { ok: false }
  | {
      ok: true;
      /** width ÷ height, for the fit. */
      ar: number;
      /** Fraction of the canvas that is meaningfully opaque, 0–1. */
      coverage: number;
      /** Mean relative luminance of the ink, 0–1. `null` if unreadable. */
      ink: number | null;
    };
const RESOLVED = new Map<string, Probe>();
const PENDING = new Map<string, Promise<Probe>>();

/* ---------------------------------------------------------------------------
   WHAT THE PROBE ACTUALLY HAS TO ANSWER.

   V70 asked the image one question — its aspect ratio — and inferred everything
   else from it: a square mark was assumed to be a composed roundel, given the
   whole circle, and had its livery background removed on the grounds that an
   opaque roundel would hide it anyway.

   That inference is wrong for the most common asset there is. A transparent
   silhouette — a star, a speedmark, a pair of bulls — ships on a SQUARE canvas
   too, and V70 would have handed it the full circle and taken away the only
   thing making it visible. Four of the five marks in this release are pure
   white on transparent; on paper they would have rendered as nothing at all.

   So the question is asked properly instead of guessed. The image is drawn to
   an offscreen canvas once and measured:

     COVERAGE separates a composed badge from a bare mark. A roundel filling its
     square covers ~78% of it (π/4) and a real one covers more; the five marks
     here cover 17–41%. Anything under the threshold gets padding and a
     background, which is what a bare mark needs and what a roundel must not
     have.

     INK is the mean luminance of the opaque pixels, and it decides what colour
     that background has to be. A white mark needs a dark field and a black mark
     needs a light one, and no amount of care about the team's brand colour
     matters if the mark cannot be seen on it.

   Same-origin, so the canvas is never tainted. Once per asset per session.
   --------------------------------------------------------------------------- */
const SAMPLE = 64;

function measure(img: HTMLImageElement): Probe {
  const ar = img.naturalWidth / img.naturalHeight;
  const base = { ok: true as const, ar, coverage: 1, ink: null as number | null };
  let cv: HTMLCanvasElement;
  try {
    cv = document.createElement("canvas");
    cv.width = SAMPLE; cv.height = SAMPLE;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return base;
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let opaque = 0, lum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      /* A hard alpha cut rather than a weighted mean: antialiased edge pixels
         are half the ink in a 48px silhouette, and letting them vote drags the
         measured luminance toward whatever the canvas was cleared to. */
      if (a < 140) continue;
      opaque += 1;
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    const total = SAMPLE * SAMPLE;
    return {
      ok: true, ar,
      coverage: opaque / total,
      ink: opaque > total * 0.01 ? lum / opaque / 255 : null,
    };
  } catch {
    /* A tainted or unreadable canvas is not a reason to show nothing. Fall back
       to "treat it as a composed mark", which is the conservative answer: it
       renders the file as supplied and adds no colour of our own. */
    return base;
  }
}

function probe(src: string): Promise<Probe> {
  const hit = PENDING.get(src);
  if (hit) return hit;
  const run = new Promise<Probe>((resolve) => {
    /* Loaded detached rather than error-handled on a mounted <img>. An <img>
       whose src 404s can fire `error` before React attaches its handler, and
       what survives that race is the browser's broken-image glyph plus the alt
       text at full paragraph width, inside a 24px circle. */
    const img = new window.Image();
    img.onload = () => resolve(
      img.naturalWidth > 0 && img.naturalHeight > 0 ? measure(img) : { ok: false });
    img.onerror = () => resolve({ ok: false });
    img.src = src;
  }).then((r) => { RESOLVED.set(src, r); return r; });
  PENDING.set(src, run);
  return run;
}

export type BadgeSize = number;

export function ConstructorBadge({
  team, color, size = 24, className, title,
}: {
  team: string;
  /** The livery, already through the reader's palette. */
  color: string;
  size?: BadgeSize;
  className?: string;
  /** Set when the badge is the only thing naming the team. */
  title?: string;
}) {
  const src = logoSrc(team);
  const [state, setState] = useState<Probe | null>(() => RESOLVED.get(src) ?? null);

  useEffect(() => {
    const known = RESOLVED.get(src);
    if (known) { setState(known); return; }
    /* React reuses this instance across `team` changes, so the previous team's
       answer has to be cleared or one resolved mark would be painted into the
       next constructor's circle for a frame. */
    setState(null);
    let live = true;
    probe(src).then((r) => { if (live) setState(r); });
    return () => { live = false; };
  }, [src]);

  const label = title ?? team;
  const ar = state?.ok ? state.ar : 0;
  /* COVERAGE, NOT ASPECT RATIO, decides this. A composed roundel fills its
     square; a bare silhouette on the same square canvas does not, and V70's
     aspect test called both of them composed. */
  const composed = !!state?.ok && state.coverage >= LOGO_COMPOSED_COVERAGE;
  /* A composed roundel gets the whole circle; a bare emblem is fitted by its
     longest edge, which is what the eye reads as size. */
  const fit = (composed ? 1 : logoFit(ar || 1)) * opticalScale(team);
  const w = ar >= 1 ? fit : fit * ar;
  const h = ar >= 1 ? fit / ar : fit;
  /* The livery, taken as far as the mark's own ink requires — see markField.
     Only a bare mark gets one; a composed roundel brings its own. */
  const field = state?.ok && !composed ? markField(color, state.ink) : null;

  /* ONE CONTAINER FOR ALL THREE STATES.
     Pending, resolved-mark and resolved-shield all paint into the same circle
     at the same size, so nothing in the row ever moves and no mark is ever
     replaced by a different mark. Pending is the circle with its livery wash
     and nothing in it — a badge arriving. The alternative, showing the shield
     first and swapping to the logo a frame later, is a mark that changes under
     the reader's eye, which is the one thing a badge must never do. */
  return (
    <span
      role="img" aria-label={label} title={title}
      className={cx("cbadge", composed && "is-composed",
        field && "is-field", state && !state.ok && "is-drawn", className)}
      style={{
        width: size, height: size,
        ["--livery" as string]: color,
        ...(field ? { ["--field" as string]: field } : null),
      }}>
      {state?.ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden decoding="async" loading="lazy"
          className="cbadge-img"
          style={{ width: `${w * 100}%`, height: `${h * 100}%` }} />
      ) : state ? (
        <ConstructorShield team={team} color={color} size={size} className="cbadge-img" />
      ) : null}
    </span>
  );
}
