"use client";
import { useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { Driver } from "@/lib/types";
import { DriverAvatar } from "./DriverBadge";
import { DisclosureContext, IconTile, type VisualTone } from "./Visuals";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One informational card for the whole product.                              */
/*                                                                            */
/* At rest a card shows four things and nothing else:                         */
/*                                                                            */
/*   glyph + label      what this card is about                               */
/*   portrait + value   the answer, in the largest type on the card           */
/*   visual             the number, shown — with its scale, never its essay   */
/*   takeaway           ONE short line: why it matters                        */
/*                                                                            */
/* Everything deeper — how the metric is built, what the scale means, where to */
/* go next — lives behind the chevron. That's the whole point: a dashboard     */
/* should be understood in a glance and explored on purpose, and a page that   */
/* explains everything at once explains nothing.                              */
/*                                                                            */
/* The interaction is deliberately singular. Every card with more to say gets  */
/* the same chevron in the same corner, the same hover lift, and the same rule:*/
/* click anywhere on the card to open it. Learn one card, you've learned all   */
/* of them.                                                                    */
/* -------------------------------------------------------------------------- */

export interface InsightCardProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: VisualTone;
  sub?: React.ReactNode;
  /** Preferred over prose: show the number, don't narrate it. */
  visual?: React.ReactNode;
  /** ONE short line, always visible. Keep it under about ten words. */
  takeaway?: React.ReactNode;
  /** The depth — revealed only when the reader asks for it. */
  detail?: React.ReactNode;
  /** A labelled jump, shown inside the drawer rather than hijacking the card. */
  action?: { label: string; onClick: () => void };
  driver?: Driver | null;
  /** Team-coloured bar instead of a portrait, for constructor-level cards. */
  swatch?: string;
  className?: string;
  /**
   * Widen the card across the grid. A page of identical tiles reads as a
   * template and invites the eye to skim past it; one card given room to
   * breathe says "start here" without breaking the alignment.
   */
  feature?: boolean;
}

export function InsightCard({
  icon, label, value, tone = "neutral", sub, visual, takeaway, detail, action,
  driver, swatch, className, feature = false,
}: InsightCardProps) {
  const [open, setOpen] = useState(false);
  const expandable = !!detail || !!action;

  return (
    <DisclosureContext.Provider value={{ inPanel: true, expanded: open }}>
      <div className={cx(
        "panel group/card relative flex flex-col p-4 text-left transition-colors duration-200",
        feature && "sm:col-span-2 sm:p-5",
        expandable && "cursor-pointer hover:border-white/[0.14] hover:bg-base-800/70",
        open && "border-white/[0.14] bg-base-800/70",
        className,
      )}
        {...(expandable ? {
          role: "button" as const,
          tabIndex: 0,
          "aria-expanded": open,
          onClick: () => setOpen((o) => !o),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
          },
        } : {})}>

        <div className="flex items-center gap-2">
          <IconTile tone={tone} size={26}>{icon}</IconTile>
          <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            {label}
          </span>
          {/* the one affordance, in the one place, on every card that has depth */}
          {expandable && (
            <span aria-hidden
              className={cx("ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full",
                "text-ink-faint transition-all duration-200",
                "group-hover/card:bg-white/[0.06] group-hover/card:text-ink-muted",
                open && "rotate-180 bg-white/[0.06] text-ink-muted")}>
              <ChevronDown size={13} />
            </span>
          )}
        </div>

        {/* the answer — always ink-white, so a driver's name never changes colour
            from one card to the next; tone lives in the glyph and the visual */}
        <div className={cx("flex items-center gap-2.5", feature ? "mt-4" : "mt-3")}>
          {driver !== undefined && driver !== null && (
            <DriverAvatar driver={driver} size={feature ? 52 : 36} />
          )}
          {swatch && (
            <span className={cx("w-1.5 shrink-0 rounded-full", feature ? "h-12" : "h-9")}
              style={{ background: swatch }} />
          )}
          <div className="min-w-0 flex-1">
            <div className={cx("truncate font-bold leading-tight tracking-tight text-ink",
              feature ? "text-[26px]" : "text-[19px]")}>
              {value}
            </div>
            {sub && (
              <div className={cx("mt-0.5 truncate text-ink-muted", feature ? "text-sm" : "text-xs")}>
                {sub}
              </div>
            )}
          </div>
        </div>

        {visual && <div className={feature ? "mt-4" : "mt-3"}>{visual}</div>}

        {/* one line. mt-auto keeps a row of uneven cards bottom-aligned. */}
        {takeaway && (
          <div className="mt-auto pt-2.5 text-[11.5px] font-medium leading-snug text-ink-muted">
            {takeaway}
          </div>
        )}

        {open && (detail || action) && (
          <div className="animate-fade-in mt-3 space-y-2 border-t border-white/[0.07] pt-3
                          text-[11.5px] leading-relaxed text-ink-faint">
            {detail}
            {action && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                className="inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-accent-soft transition-colors hover:text-accent">
                {action.label} <ArrowUpRight size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </DisclosureContext.Provider>
  );
}

/** The grid every card set sits in — one column rhythm across the product. */
export function InsightGrid({
  children, cols = 3, className,
}: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const c = cols === 2 ? "sm:grid-cols-2"
    : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4"
      : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={cx("grid gap-3", c, className)}>{children}</div>;
}
