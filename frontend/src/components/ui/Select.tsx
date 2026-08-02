"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The dropdown.                                                              */
/*                                                                            */
/* Every picker in the product was a native <select>. Natives are excellent at */
/* three things — keyboard, accessibility, and never being wrong on a phone —  */
/* and hopeless at the one thing this product is about, which is looking like  */
/* one piece of software. The menu is drawn by the operating system: it has    */
/* the platform's radius, the platform's type, the platform's shadow and the   */
/* platform's idea of where to open, so on a page built out of 13px Inter and  */
/* soft shadows it reads as a hole punched through to another application.     */
/* On Chrome it also opens UPWARD whenever the trigger is in the lower half of */
/* the window, which is why a season picker near the fold covered the heading  */
/* it belonged to.                                                            */
/*                                                                            */
/* So this is a listbox, and the whole cost of leaving the native behind is    */
/* that the three things natives are good at have to be paid for explicitly:   */
/*                                                                            */
/*   KEYBOARD    arrows, Home/End, Enter, Escape, and type-ahead, because a    */
/*               twenty-four race calendar is unusable without it.             */
/*   SEMANTICS   real listbox/option roles and `aria-activedescendant`, so a   */
/*               screen reader hears a menu rather than a pile of buttons.     */
/*   POSITION    portalled to the body, so no `overflow-hidden` ancestor can   */
/*               clip it, and measured against the viewport so it opens DOWN   */
/*               unless there is genuinely no room, in which case it opens up  */
/*               rather than off the bottom of the screen.                     */
/*                                                                            */
/* It is not a modal. It closes on scroll rather than following the trigger:   */
/* a menu that rides the page while you scroll is a menu you have to dismiss.  */
/* -------------------------------------------------------------------------- */

export interface Option<T extends string | number> {
  value: T;
  label: string;
  /** Optional colour chip — a team, a compound, a driver. */
  tint?: string;
  /** Optional trailing detail: a date, a count, a status. */
  hint?: string;
}

interface Pos { left: number; top: number; width: number; up: boolean; maxH: number; }

const ROW = 34;          // one option, including its padding
const PAD = 8;           // the menu's own vertical padding
const GAP = 6;           // between trigger and menu
const EDGE = 12;         // never closer than this to the viewport edge

export function Select<T extends string | number>({
  value, onChange, options, className, wide, ariaLabel, id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly Option<T>[];
  className?: string;
  /** Widen the trigger — used for long labels like a Grand Prix name. */
  wide?: boolean;
  ariaLabel?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ buf: "", at: 0 });
  const listId = useId();

  const current = options.find((o) => o.value === value);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  /* Measure against the viewport, and prefer down.
     `maxH` is what is actually available rather than a constant, so a menu near
     the bottom of the window becomes a shorter scrolling menu instead of a
     menu that hangs off the screen. */
  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const wanted = Math.min(options.length * ROW + PAD * 2, 320);
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    // down unless it genuinely does not fit and there is meaningfully more room up
    const up = below < wanted && above > below;
    setPos({
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - r.width - EDGE)),
      top: up ? r.top - GAP : r.bottom + GAP,
      width: r.width,
      up,
      maxH: Math.max(120, Math.min(wanted, up ? above : below)),
    });
  }, [options.length]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    setActive(index);
    const close = () => setOpen(false);
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    // a menu that follows the page is a menu you have to dismiss
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("mousedown", outside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keep the highlighted row in view when the arrows walk past the fold
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(i: number) {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "Escape": e.preventDefault(); setOpen(false); trigger.current?.focus(); break;
      case "Enter": case " ": e.preventDefault(); pick(active); break;
      case "ArrowDown": e.preventDefault(); setActive((i) => Math.min(last, i + 1)); break;
      case "ArrowUp": e.preventDefault(); setActive((i) => Math.max(0, i - 1)); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(last); break;
      case "Tab": setOpen(false); break;
      default: {
        // type-ahead. Twenty-four Grands Prix is a list you type at, not scroll.
        if (e.key.length !== 1) return;
        const now = Date.now();
        const t = typed.current;
        t.buf = now - t.at > 800 ? e.key : t.buf + e.key;
        t.at = now;
        const q = t.buf.toLowerCase();
        const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(q));
        if (hit >= 0) setActive(hit);
      }
    }
  }

  return (
    <>
      <button ref={trigger} type="button" id={id}
        onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        role="combobox" aria-expanded={open} aria-haspopup="listbox"
        aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        className={cx("sel-trigger group/sel", wide && "sel-wide", open && "is-open", className)}>
        {current?.tint && (
          <span aria-hidden className="sel-chip" style={{ background: current.tint }} />
        )}
        <span className="truncate">{current?.label ?? "—"}</span>
        <ChevronDown size={14} aria-hidden
          className={cx("ml-auto shrink-0 text-ink-faint transition-transform duration-[--dur-2] ease-[--ease-out]",
            open && "rotate-180 text-accent-soft")} />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={menu} id={listId} role="listbox" tabIndex={-1} onKeyDown={onKey}
          aria-activedescendant={`${listId}-${active}`}
          className={cx("sel-menu", pos.up && "is-up")}
          style={{
            left: pos.left,
            top: pos.up ? undefined : pos.top,
            bottom: pos.up ? window.innerHeight - pos.top : undefined,
            minWidth: pos.width,
            maxHeight: pos.maxH,
          }}>
          {options.map((o, i) => (
            <div key={String(o.value)} id={`${listId}-${i}`} data-i={i}
              role="option" aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={cx("sel-opt", i === active && "is-active", o.value === value && "is-on")}>
              {o.tint && <span aria-hidden className="sel-chip" style={{ background: o.tint }} />}
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="sel-hint">{o.hint}</span>}
              <Check size={13} aria-hidden
                className={cx("ml-auto shrink-0 text-accent-soft transition-opacity",
                  o.value === value ? "opacity-100" : "opacity-0")} />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
