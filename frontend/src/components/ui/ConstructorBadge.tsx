"use client";
import { useEffect, useState } from "react";
import { LOGO_SQUARE_BAND, logoFit, logoSrc, opticalScale } from "@/lib/constructors";
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
type Probe = { ok: false } | { ok: true; ar: number };
const RESOLVED = new Map<string, Probe>();
const PENDING = new Map<string, Promise<Probe>>();

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
      img.naturalWidth > 0 && img.naturalHeight > 0
        ? { ok: true, ar: img.naturalWidth / img.naturalHeight }
        : { ok: false });
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
  const [lo, hi] = LOGO_SQUARE_BAND;
  const composed = !!state?.ok && ar >= lo && ar <= hi;
  /* A composed roundel gets the whole circle; a bare emblem is fitted by its
     longest edge, which is what the eye reads as size. */
  const fit = (composed ? 1 : logoFit(ar || 1)) * opticalScale(team);
  const w = ar >= 1 ? fit : fit * ar;
  const h = ar >= 1 ? fit / ar : fit;

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
        state && !state.ok && "is-drawn", className)}
      style={{ width: size, height: size, ["--livery" as string]: color }}>
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
