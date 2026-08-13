"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTour } from "@/lib/tour";
import { usePrefs } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The tour, drawn.                                                           */
/*                                                                            */
/* Three rules, and they are what separate this from a tutorial nobody reads:  */
/*                                                                            */
/*   IT POINTS AT REAL THINGS. Each beat spotlights an element that is already */
/*   on screen, with the reader's own session in it. A modal describing the    */
/*   tabs teaches nothing; a hole cut around the actual tabs teaches by         */
/*   pointing.                                                                 */
/*                                                                            */
/*   IT IS SHORTER THAN THE PATIENCE FOR IT. One line per beat. If a beat      */
/*   needs a paragraph, the interface underneath it needs the work instead.     */
/*                                                                            */
/*   IT IS TRIVIAL TO LEAVE. Escape, a permanent Skip, and an X on the card. A */
/*   beat whose target isn't on screen is skipped rather than pointing at      */
/*   nothing.                                                                  */
/*                                                                            */
/* AND ONE RULE ADDED IN V92: WHILE THE TOUR IS UP, THE TOUR OWNS THE INPUT.   */
/*                                                                            */
/*   The hole used to be a REAL hole. The scrim was pointer-events: none from  */
/*   the wrapper down, so every click went through to the page — the spotlit    */
/*   control could be pressed, and so could everything around it. A reader     */
/*   being told "this is the session picker" could open the session picker,    */
/*   change the race, and have the beat they were reading start describing a   */
/*   page that no longer existed. Worse, the targets move when the page state  */
/*   changes, so the spotlight would then chase a control across a relayout    */
/*   nobody asked for.                                                          */
/*                                                                            */
/*   Teaching and operating are different modes and cannot share the same      */
/*   click. So the tour now takes exclusive control of input, by two           */
/*   mechanisms that cover the two ways a page can be reached:                 */
/*                                                                            */
/*     POINTER — one full-viewport blocker inside the tour layer, painted      */
/*     under the card and over everything else. The page stays fully visible   */
/*     and fully lit; it simply stops answering.                               */
/*                                                                            */
/*     KEYBOARD — `inert` on every sibling of the tour layer, which is what    */
/*     actually removes them from the tab order and the accessibility tree. A  */
/*     pointer blocker alone leaves Tab and Enter working, which is the same    */
/*     bug with a keyboard.                                                     */
/*                                                                            */
/*   The scrim is NOT a dismiss target any more. It was one only in the        */
/*   no-target case, and a backdrop that exits on click is exactly the thing   */
/*   a reader hits when they try to press the control being explained — the    */
/*   one accident this change exists to prevent. Skip, the X and Escape are    */
/*   all on screen at every beat, so nothing is trapped.                       */
/* -------------------------------------------------------------------------- */

interface Box { top: number; left: number; width: number; height: number; }

/* -------------------------------------------------------------------------- */
/* HOW BIG THE HIGHLIGHT IS.                                                   */
/*                                                                            */
/* It used to be eight pixels outward on every side of every target, for ever, */
/* plus a twenty-two pixel glow that nobody had budgeted for at all. That is   */
/* fine when a control has room around it and wrong the moment one does not:   */
/* the session picker sits sixteen pixels under its own subtitle, the tabs bar */
/* sits eight from the Sources button, and a spotlight that reaches            */
/* twenty-four pixels in every direction goes straight through both. The       */
/* reader sees an outline cutting a label in half and clipping the control     */
/* below — which reads as a bug in the tour rather than as a pointer.          */
/*                                                                            */
/* So the highlight measures the room it actually has. Three rules:            */
/*                                                                            */
/*   THE PADDING IS THE SAME ON ALL FOUR SIDES. Uneven padding looks like a    */
/*   mistake even when every side is individually correct, so the tightest     */
/*   side sets the number and the others match it. It stays at the designed    */
/*   eight whenever there is room, and only shrinks where the layout is close. */
/*                                                                            */
/*   THE GLOW LIVES INSIDE THAT BUDGET. Light thrown outward is what was       */
/*   actually landing on the neighbours, so the ring now casts most of its     */
/*   light INWARD — onto the thing it is illuminating, which is where a        */
/*   spotlight's light belongs — and what remains outside is sized from the    */
/*   same measurement as the padding.                                          */
/*                                                                            */
/*   THE OUTLINE IS THE TARGET'S OWN SHAPE. A pill gets a pill, a card gets a  */
/*   card, and the corner radius grows by exactly the padding so the outline   */
/*   stays parallel to the edge it is tracing rather than crossing it.         */
/* -------------------------------------------------------------------------- */

interface Fit {
  /** outward padding, identical on all four sides */
  pad: number;
  /** blur radius of the part of the glow that escapes the hole */
  bloom: number;
  /** the hole's own corner radius, already including the padding */
  radius: number;
}

const FIT_DEFAULT: Fit = { pad: 8, bloom: 12, radius: 20 };

/** The target's own corner radius, in px, resolving a percentage honestly. */
function cornerOf(el: Element, r: DOMRect): number {
  const cs = getComputedStyle(el);
  const corners = [
    cs.borderTopLeftRadius, cs.borderTopRightRadius,
    cs.borderBottomLeftRadius, cs.borderBottomRightRadius,
  ];
  let max = 0;
  for (const c of corners) {
    const first = c.split(" ")[0];
    const n = parseFloat(first);
    if (!Number.isFinite(n)) continue;
    max = Math.max(max, first.endsWith("%") ? (n / 100) * Math.min(r.width, r.height) : n);
  }
  // a pill asks for half its height; anything larger is the same pill
  return Math.min(max, Math.min(r.width, r.height) / 2);
}

/**
 * The clearance around a target: the distance to the nearest thing the
 * highlight could run into.
 *
 * Only elements that actually share a band with the target can be hit — a card
 * two columns over is not a constraint on how far up the outline may go — so
 * each candidate is tested against the perpendicular axis first. The walk goes
 * up a few levels because the thing a highlight collides with is usually not a
 * sibling: the tabs bar's neighbour is the Sources button (a sibling), but the
 * session picker's is a paragraph that belongs to its parent's parent.
 */
function clearance(el: Element, r: DOMRect): number {
  const vw = window.innerWidth, vh = window.innerHeight;
  let gap = Math.min(r.top, r.left, vw - r.right, vh - r.bottom);

  let node: Element | null = el;
  for (let up = 0; node && up < 4; up++, node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent || parent === document.body) break;
    const sibs: Element[] = Array.from(parent.children);
    for (const sib of sibs) {
      if (sib === node || sib.contains(el) || el.contains(sib)) continue;
      const s = sib.getBoundingClientRect();
      if (s.width < 1 || s.height < 1) continue;
      if (s.right > r.left + 1 && s.left < r.right - 1) {
        if (s.bottom <= r.top) gap = Math.min(gap, r.top - s.bottom);
        if (s.top >= r.bottom) gap = Math.min(gap, s.top - r.bottom);
      }
      if (s.bottom > r.top + 1 && s.top < r.bottom - 1) {
        if (s.right <= r.left) gap = Math.min(gap, r.left - s.right);
        if (s.left >= r.right) gap = Math.min(gap, s.left - r.right);
      }
    }
  }
  return Math.max(0, gap);
}

/** Everything the highlight needs to wrap this particular element cleanly. */
function fitTo(el: Element): Fit {
  const r = el.getBoundingClientRect();
  const gap = clearance(el, r);
  // two pixels of daylight are kept between the highlight and whatever is next
  // to it, so "does not touch" is visible rather than merely true
  const pad = Math.max(3, Math.min(8, Math.floor((gap - 2) / 2)));
  const bloom = Math.max(4, Math.min(14, gap - pad - 2));
  return { pad, bloom, radius: cornerOf(el, r) + pad };
}

export function GuidedTour() {
  const { beats, index, running, ready, next, prev, stop } = useTour();
  const { prefs } = usePrefs();
  /* ONE LAYER, OWNED BY US, FOR THE WHOLE RUN.
     The portal used to mount straight into document.body, which meant the tour's
     own node was a body child that appeared and disappeared between beats — and
     the `inert` sweep below has to be able to tell "the tour" from "the page it
     is covering". A host created when the tour starts and removed when it ends
     is stable for the entire run, so the sweep has something constant to skip
     and the waiting state is covered by the same guarantee as a live beat. */
  const [host, setHost] = useState<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [fit, setFit] = useState<Fit>(FIT_DEFAULT);
  const [el, setEl] = useState<Element | null>(null);
  /* Travelling to a new target, or tracking one that has moved underneath us.
     Two different events that both change the same four numbers, and they want
     two different speeds: the journey between beats is a movement the reader
     watches, a correction for a layout shift is a thing that should already
     have happened. One curve for both means either a lurching journey or a
     twenty-four-pixel glide half a second after the page settled. */
  const [travelling, setTravelling] = useState(true);
  // has the page stopped moving? the card is not shown until it has
  const [settled, setSettled] = useState(false);
  const beat = running ? beats[index] : undefined;

  useEffect(() => {
    if (!running || typeof document === "undefined") return;
    const el = document.createElement("div");
    el.setAttribute("data-tour-layer", "");
    document.body.appendChild(el);
    setHost(el);
    return () => { el.remove(); setHost(null); };
  }, [running]);

  /* THE PAGE GOES QUIET WHILE THE TOUR TALKS.
     `inert` is the only thing that removes a subtree from the tab order, the
     accessibility tree and hit-testing all at once — a pointer blocker stops the
     mouse and leaves Tab, Enter and a screen reader walking straight into the
     page the tour is covering.

     Applied to the tour layer's SIBLINGS rather than to one app wrapper: this
     component portals into document.body, so its siblings are exactly "the rest
     of the document", and nothing has to be restructured for the tour's benefit.
     Anything already inert is left alone and left out of the restore list, so a
     modal that inerted the page first still owns that decision when we leave.

     AND IT HAS TO KEEP SWEEPING, which is the part a single pass gets wrong.
     A tour NAVIGATES: the first beat is on the Race Explorer and the reader may
     have started from the landing page, so the page element present when the
     tour opened is unmounted moments later and a fresh one takes its place —
     never marked, fully live, sitting under the scrim. The same is true of
     anything else that mounts mid-tour: a portal, a route announcer, the
     feedback dock appearing on a route where it is shown. Observing the body's
     child list closes all of those at once, because they are all the same
     event. */
  useEffect(() => {
    if (!running || !host) return;
    const marked = new Set<HTMLElement>();
    const sweep = () => {
      for (const node of Array.from(document.body.children)) {
        const el = node as HTMLElement;
        if (el === host || el.contains(host) || el.inert) continue;
        el.inert = true;
        marked.add(el);
      }
    };
    sweep();
    const watch = new MutationObserver(sweep);
    watch.observe(document.body, { childList: true });
    return () => {
      watch.disconnect();
      for (const el of marked) el.inert = false;
    };
  }, [running, host]);

  /* FIND THE TARGET — AND WAIT FOR IT.
     A beat that arrives before its page has finished fetching does not have a
     missing target; it has a target that has not rendered yet. The first cut
     could not tell the two apart and skipped on the first miss, so the entire
     Race Explorer half of the tour was skipped whenever the session took more
     than a moment to load — which, on a page whose whole job is fetching a
     session, is most of the time.

     It waits three seconds, which is longer than any render and shorter than
     anyone's patience, and only then treats the target as genuinely absent.
     A control that was removed still gets skipped rather than pointed at. */
  useEffect(() => {
    if (!beat?.target || !ready) { setEl(null); return; }
    const sel = beat.target;
    const now = document.querySelector(sel);
    if (now) { setEl(now); return; }
    let tries = 0;
    const id = setInterval(() => {
      const found = document.querySelector(sel);
      if (found) { clearInterval(id); setEl(found); }
      else if (++tries > 25) { clearInterval(id); next(); }
    }, 120);
    return () => clearInterval(id);
  }, [beat, ready, next]);

  /* SCROLL ONLY HAPPENS BECAUSE THE TOUR ASKED FOR IT.
     A reader who nudges the wheel while a beat is up slides the highlighted
     control out from under its own spotlight, and the tour is then explaining
     something they cannot see. `overflow: hidden` on the body would stop that
     and also stop the tour scrolling, which is the one thing that still has to
     work — so the *input* is blocked rather than the scrolling. Wheel and touch
     are cancellable, the scroll keys are intercepted, and `scrollIntoView` is
     untouched because it is not an input event.

     Non-passive listeners, deliberately: a passive listener cannot preventDefault
     and would silently do nothing at all. */
  useEffect(() => {
    if (!running) return;
    const swallow = (e: Event) => e.preventDefault();
    const KEYS = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);
    const keys = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // never swallow typing, and never swallow the tour's own arrow keys
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (KEYS.has(e.key)) e.preventDefault();
    };
    window.addEventListener("wheel", swallow, { passive: false });
    window.addEventListener("touchmove", swallow, { passive: false });
    window.addEventListener("keydown", keys);
    document.documentElement.classList.add("tour-open");
    return () => {
      window.removeEventListener("wheel", swallow);
      window.removeEventListener("touchmove", swallow);
      window.removeEventListener("keydown", keys);
      document.documentElement.classList.remove("tour-open");
    };
  }, [running]);

  /* -------------------------------------------------------------------- */
  /* THE HIGHLIGHT FOLLOWS ITS TARGET FOR AS LONG AS THE BEAT IS UP.       */
  /*                                                                      */
  /* It used to measure during the scroll and then stop — two frames at    */
  /* the same offset and the watcher returned, leaving only `scroll` and   */
  /* `resize` listeners behind. Neither of those fires when the LAYOUT     */
  /* changes underneath a stationary page, and on the Race Explorer the    */
  /* layout changes a beat after the tour opens: the session lands, the    */
  /* heading stops saying "Loading", a Demo-data chip appears beside it, a */
  /* partial-data note may appear under it. Everything below is pushed     */
  /* down by twenty or thirty pixels and the outline stays where it was —  */
  /* which is the "it aligns, then shifts" report exactly.                 */
  /*                                                                      */
  /* So the rect is read every frame for the life of the beat and written  */
  /* only when it has actually moved. One `getBoundingClientRect` per      */
  /* frame is nothing next to what the page behind it is already doing,    */
  /* and the equality check means a stationary target costs zero renders.  */
  /* -------------------------------------------------------------------- */

  /* AND THE PAGE ONLY MOVES WHEN IT GENUINELY HAS TO.
     `scrollIntoView({block: "center"})` on every beat is a camera flight even
     when the target is already in front of the reader — V65 cut the distance by
     choosing smaller targets, but the right number of pixels to scroll toward
     something you can already see is zero. The tour now scrolls only when the
     target is outside a comfortable band, and then by the least it can: enough
     to clear the band, not enough to centre. Most beats no longer move the page
     at all, which is the only way a spotlight can feel fixed to the thing it is
     pointing at. */
  useLayoutEffect(() => {
    if (!el) { setBox(null); setSettled(false); return; }
    setSettled(false);
    setTravelling(true);
    const arrived = setTimeout(() => setTravelling(false), 560);

    // the band the target has to be inside: clear of the sticky nav at the top,
    // clear of the tour card's own height at the bottom
    const BAND_TOP = 96, BAND_BOTTOM = 232;
    const r0 = el.getBoundingClientRect();
    const vh = window.innerHeight;
    let delta = 0;
    if (r0.height <= vh - BAND_TOP - BAND_BOTTOM) {
      if (r0.top < BAND_TOP) delta = r0.top - BAND_TOP;
      else if (r0.bottom > vh - BAND_BOTTOM) delta = r0.bottom - (vh - BAND_BOTTOM);
    } else if (r0.top < BAND_TOP) {
      // taller than the band: put its top edge at the top of it and no more
      delta = r0.top - BAND_TOP;
    }
    if (Math.abs(delta) > 2) {
      window.scrollBy({ top: delta, behavior: prefs.motion === "calm" ? "auto" : "smooth" });
    }

    let box0: Box | null = null;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      if (box0 && Math.abs(box0.top - next.top) < 0.5 && Math.abs(box0.left - next.left) < 0.5
        && Math.abs(box0.width - next.width) < 0.5 && Math.abs(box0.height - next.height) < 0.5) return;
      box0 = next;
      setBox(next);
    };
    measure();

    /* The card waits for the page to stop before it appears, so it fades in
       where it will stay rather than sliding into place while being read. When
       nothing scrolled there is nothing to wait for. */
    let last = -1, same = 0, raf = 0, settling = Math.abs(delta) > 2;
    const t0 = performance.now();
    const watch = () => {
      measure();
      if (settling) {
        const y = window.scrollY;
        same = y === last ? same + 1 : 0;
        last = y;
        if (same >= 2 || performance.now() - t0 > 900) { settling = false; setSettled(true); }
      }
      raf = requestAnimationFrame(watch);
    };
    if (!settling) setSettled(true);
    raf = requestAnimationFrame(watch);

    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(arrived);
      window.removeEventListener("resize", measure);
    };
  }, [el, prefs.motion]);

  /* How much room this target has is a fact about the LAYOUT, not about the
     scroll position, so it is measured when the target changes and when the
     window is resized — and not on every frame of the settle, which would put
     a walk of the element's neighbours inside the scroll loop. */
  useLayoutEffect(() => {
    if (!el) { setFit(FIT_DEFAULT); return; }
    const compute = () => setFit(fitTo(el));
    compute();
    /* A walk of the target's neighbours is far too expensive to run every frame
       alongside the rect, and it does not need to be: content arriving above the
       target moves it and its neighbours together, leaving the clearance
       unchanged. What DOES change the clearance is the target or its
       surroundings changing size, which is exactly what a ResizeObserver is. */
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", compute);
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); };
  }, [el]);

  // auto-advance, for the demonstration script
  useEffect(() => {
    if (!beat?.hold || !ready) return;
    const t = setTimeout(next, beat.hold);
    return () => clearTimeout(t);
  }, [beat, ready, next]);

  /* Whether this beat is still resolving, and whether it has been resolving
     long enough to be worth saying so. Declared with the other hooks because
     the render below returns early and hooks may not be conditional. */
  const waiting = !beat || !ready || (!!beat.target && !box);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!running || !waiting) { setStalled(false); return; }
    const STALL_MS = 700;
    const t = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(t);
  }, [running, waiting]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "Enter" || e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, next, prev, stop]);

  /* WHERE THE KEYBOARD IS, ONCE THE PAGE HAS GONE INERT.
     Making the page inert blurs whatever was focused in it and leaves focus on
     the body, so the first Tab would walk from the top of the document — which
     is now the tour, but only by accident. Putting focus on the card makes it
     deliberate: Tab reaches Back / Skip / Next in the order they are read, and
     a screen reader announces the beat it has landed on.

     `preventScroll` because the beat has just finished deciding what the scroll
     position should be, and focusing an off-screen card would undo it. */
  useEffect(() => {
    if (!running || !settled) return;
    cardRef.current?.focus({ preventScroll: true });
  }, [running, settled, index]);

  if (!running || typeof document === "undefined" || !host) return null;

  /* THE WAIT BETWEEN BEATS.
     A beat with a target is not shown until that target has been found: a card
     that appears before its spotlight points at nothing for a frame. That gap
     is normally under a fifth of a second and rendering nothing across it is
     right.

     What was wrong is what happens when the gap is NOT short — the first beat
     of a tour started from the landing page has to fetch a whole route first,
     and scroll input is locked from the moment the tour starts. On a cold
     route that left the reader on a page that would not scroll, with no card,
     no scrim and nothing to press: a modal state with no affordance, which is
     the one state a modal may never be in.
     So after `STALL_MS` of waiting the tour admits it is working, and — the
     part that actually matters — offers the way out. */
  if (waiting) {
    return stalled ? createPortal(
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4"
        style={{ background: "rgb(var(--base-950) / 0.84)" }}
        role="dialog" aria-modal="true" aria-label="Guided tour, opening">
        <span className="tour-wait" aria-hidden />
        <span className="text-[13px] text-ink-muted">Opening the tour…</span>
        <button type="button" onClick={() => stop()}
          className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-ink-faint transition-colors hover:text-ink">
          Skip the tour
        </button>
      </div>,
      host,
    ) : null;
  }
  if (!beat) return null;

  const hole = box && {
    top: box.top - fit.pad, left: box.left - fit.pad,
    width: box.width + fit.pad * 2, height: box.height + fit.pad * 2,
  };
  const last = index === beats.length - 1;

  /* WHERE THE CARD GOES.
     Three cases, and the third is the one that broke: a target taller than the
     window. "Below the target" is then off the bottom of the screen and "above
     it" is off the top, and the card was placed at a negative offset — present
     in the DOM, invisible, and un-pressable. A tour that cannot be advanced is
     worse than no tour.

     So a large target is not something the card sits outside of. It sits over
     it, docked to the corner nearest the reader, which is what every tour that
     has ever explained a whole panel does. Small targets keep the pointing
     relationship, clamped so the card is always fully on screen. */
  const CARD_H = 190, CARD_W = 368, EDGE = 16;
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  const bulky = !hole || hole.height > vh * 0.55 || hole.width > vw * 0.9;

  let place: React.CSSProperties;
  if (!hole) {
    place = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (bulky) {
    place = { bottom: EDGE + 8, left: EDGE + 8 };
  } else {
    const below = hole.top + hole.height + CARD_H < vh;
    place = {
      top: below
        ? Math.min(hole.top + hole.height + 12, vh - CARD_H - EDGE)
        : Math.max(EDGE, hole.top - CARD_H - 12),
      left: Math.max(EDGE, Math.min(hole.left, vw - CARD_W)),
    };
  }

  return createPortal(
    // pointer-events-none on the wrapper, auto on the blocker and the card: the
    // blocker takes every click meant for the page, the card takes its own.
    <div className="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-modal="true"
      aria-label={`Guided tour, step ${index + 1} of ${beats.length}`}
      style={{ ["--tour-move" as string]: travelling ? ".52s" : ".16s" }}>
      {/* THE BLOCKER. Invisible, full-viewport, and the first thing painted in
          this layer — so it sits over the whole page and under everything the
          tour draws. It carries no appearance at all: the scrim below it is
          what the reader sees, and dimming is a separate job from blocking.
          `preventDefault` on pointerdown stops the click ALSO placing a caret or
          starting a selection drag on the text underneath. */}
      <div aria-hidden className="pointer-events-auto absolute inset-0"
        onPointerDown={(e) => e.preventDefault()} />

      {/* The scrim is one element with a hole punched through it by box-shadow,
          rather than four rectangles around the target — so it can animate from
          one beat to the next as a single moving spotlight. The hole is now
          only a hole in the LIGHT; the blocker above still covers it, which is
          what stops the spotlit control being pressed. */}
      {hole ? (
        /* TWO ELEMENTS, NOT ONE, AND THAT IS THE WHOLE FIX.
           The scrim and its outline used to be the same box, so the outline's
           glow had to live in the same `box-shadow` as the 9999px scrim — which
           meant it could not breathe without re-running the geometry
           transition, and every pulse fought the move to the next target. The
           scrim keeps the hole; a second, identically-placed element carries the
           ring and its slow breath. Both move on the same curve, so they travel
           as one object.

           `will-change: top,left,width,height` keeps the pair on their own
           compositor layer for the move, which is what took the jitter out of a
           1.5px ring travelling across a live page. */
        <>
          <div
            className="tour-scrim absolute"
            style={{
              top: hole.top, left: hole.left, width: hole.width, height: hole.height,
              borderRadius: fit.radius,
            }} />
          <div aria-hidden
            className="tour-ring absolute"
            style={{
              top: hole.top, left: hole.left, width: hole.width, height: hole.height,
              borderRadius: fit.radius,
              // the glow's escape distance, measured from the same clearance
              // that set the padding — so it can never reach a neighbour
              ["--ring-out" as string]: `${fit.bloom}px`,
            }} />
        </>
      ) : (
        /* No target to cut a hole around, so the dim is flat. Not a dismiss
           target: see the header note — a backdrop that exits on click is the
           thing a reader presses when they mean to press the control. */
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-base-950/84" />
      )}

      {/* The card is mounted only once the page has stopped, and it fades in
          where it will stay. Nothing about it animates position — a card that
          slides into place while being read is the "choppy" report. */}
      <div
        ref={cardRef} tabIndex={-1}
        className={cx("tour-card modal-scroll pointer-events-auto absolute w-[min(23rem,calc(100vw-2rem))] max-h-[min(24rem,calc(100vh-2rem))] p-4 outline-none",
          settled ? "opacity-100" : "pointer-events-none opacity-0")}
        style={place}>
        {/* The card's own room: a slow drifting wash and a hairline lattice,
            the same philosophy as the welcome screen and the landing hero — and
            behind an opaque pane, so not one pixel of it reaches the text.
            Readability is not a thing to trade for atmosphere; it is the thing
            the atmosphere sits behind. */}
        <span aria-hidden className="tour-card-field" />
        <span aria-hidden className="tour-card-edge" />

        <div className="relative flex items-start gap-3">
          <span className="tour-step" aria-hidden>{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold leading-snug tracking-[-0.012em] text-ink">{beat.title}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{beat.body}</p>
          </div>
          <button onClick={() => stop()} aria-label="Leave the tour"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink">
            <X size={14} />
          </button>
        </div>

        {/* On an auto-advancing beat the bar IS the control's promise: it says
            how long you have before it moves, so nobody has to guess whether
            they are about to lose their place. */}
        {beat.hold && (
          <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div key={index} className="h-full rounded-full bg-accent/70"
              style={{ animation: `tour-hold ${beat.hold}ms linear both` }} />
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          {/* progress as marks, not "3 of 10": the eye counts dots faster than
              it parses a fraction */}
          <div className="flex gap-1">
            {beats.map((_, n) => (
              <span key={n} className={cx("h-1.5 rounded-full transition-all duration-300",
                n === index ? "w-4 bg-accent" : n < index ? "w-1.5 bg-accent/45" : "w-1.5 bg-white/15")} />
            ))}
          </div>
          <button onClick={prev} disabled={index === 0} aria-label="Previous"
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-25">
            <ArrowLeft size={13} />
          </button>
          <button onClick={() => stop()}
            className="text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink">
            Skip
          </button>
          <button onClick={next}
            className="pressable inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-pure">
            {last ? "Done" : "Next"}
            {!last && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}
