"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/lib/useScrollLock";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One dialog shell, and every dialog uses it.                                 */
/*                                                                            */
/* THE BUG THIS EXISTS TO MAKE IMPOSSIBLE. `position: fixed` is only fixed to  */
/* the viewport while no ancestor has a transform, filter, perspective or      */
/* containment — any of those makes that ancestor the containing block, and    */
/* "fixed" quietly starts meaning "fixed to that panel". Every arrival         */
/* animation in this product ends on `transform: none`, and an animation with  */
/* `fill-mode: both` holds its final keyframe for ever — as the computed       */
/* matrix, not as the keyword. So practically every panel was redefining the   */
/* viewport for its descendants, and the Driver focus dialog, declared         */
/* `fixed inset-0`, opened 453 pixels down the page.                           */
/*                                                                            */
/* The fill modes are fixed at source. This is the second line of defence, and */
/* it is the one that holds regardless: a dialog rendered into `document.body` */
/* has no ancestor but the body, so there is nothing left to redefine what the */
/* screen is.                                                                  */
/*                                                                            */
/* AND CENTRING IS A PROMISE ABOUT THE READER'S SCREEN. Because the page       */
/* behind is locked, a dialog that opens off-screen cannot be brought back —   */
/* the reader has no scroll and no drag. So it is centred in the viewport, it  */
/* is never taller than the viewport, and its own body is the part that        */
/* scrolls. `place-items: center` with `max-height` beats `items-start` with a  */
/* top offset for exactly one reason: a short dialog and a tall one both end   */
/* up somewhere the reader is already looking.                                  */
/* -------------------------------------------------------------------------- */

export function Modal({ open, onClose, label, children, width = "max-w-5xl", initialFocus }: {
  open: boolean;
  onClose: () => void;
  /** The accessible name. A dialog without one is an unlabelled region. */
  label: string;
  children: React.ReactNode;
  width?: string;
  /** Focused on open, so the keyboard lands somewhere useful. */
  initialFocus?: React.RefObject<HTMLElement>;
}) {
  useScrollLock(open);
  const shell = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    const id = requestAnimationFrame(() => {
      (initialFocus?.current ?? shell.current)?.focus?.();
    });
    return () => { window.removeEventListener("keydown", onKey); cancelAnimationFrame(id); };
  }, [open, onClose, initialFocus]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4"
      role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 animate-fade-in bg-base-950/80 backdrop-blur-sm" onClick={onClose} />
      {/* `max-h-full` inside a padded grid cell, so the shell can never be
          taller than the space it was given — which is what stops a long list
          pushing its own header off the top of the screen. */}
      <div ref={shell} tabIndex={-1}
        className={cx("modal-shell relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl outline-none", width)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
