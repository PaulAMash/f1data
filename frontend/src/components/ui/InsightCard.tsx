"use client";
import type { Driver } from "@/lib/types";
import { DriverAvatar } from "./DriverBadge";
import { InfoTip } from "./InfoTip";
import { IconTile, type VisualTone } from "./Visuals";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One informational card for the whole product.                              */
/*                                                                            */
/* Race, Practice and Qualifying each grew their own near-identical card and   */
/* the three drifted apart — different radii, different paddings, different    */
/* ideas about where colour belongs. This is the single one. Every panel that  */
/* states "here is a thing worth knowing" is built from it, so a card lifted   */
/* from Qualifying and dropped into the Race page would be indistinguishable   */
/* from its new neighbours.                                                    */
/*                                                                            */
/* Structure, in reading order:                                               */
/*   glyph + label      what this card is about                               */
/*   portrait + value   the answer, in the largest type on the card           */
/*   visual             the number, shown rather than described               */
/*   caption            the one line of context, only when it adds something  */
/* -------------------------------------------------------------------------- */

export interface InsightCardProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: VisualTone;
  sub?: React.ReactNode;
  /** Preferred over `caption`: show the number, don't narrate it. */
  visual?: React.ReactNode;
  caption?: React.ReactNode;
  driver?: Driver | null;
  /** Team-coloured bar instead of a portrait, for constructor-level cards. */
  swatch?: string;
  info?: string;
  onClick?: () => void;
  className?: string;
}

export function InsightCard({
  icon, label, value, tone = "neutral", sub, visual, caption,
  driver, swatch, info, onClick, className,
}: InsightCardProps) {
  const interactive = !!onClick;
  const body = (
    <>
      <div className="flex items-center gap-2">
        <IconTile tone={tone} size={26}>{icon}</IconTile>
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        {info && <InfoTip text={info} />}
      </div>

      {/* the answer — always ink-white, so a driver's name never changes colour
          from one card to the next; tone lives in the glyph and the visual */}
      <div className="mt-3 flex items-center gap-2.5">
        {driver !== undefined && driver !== null && <DriverAvatar driver={driver} size={36} />}
        {swatch && <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: swatch }} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[19px] font-bold leading-tight tracking-tight text-ink">{value}</div>
          {sub && <div className="mt-0.5 truncate text-xs text-ink-muted">{sub}</div>}
        </div>
      </div>

      {visual && <div className="mt-3">{visual}</div>}
      {caption && (
        <div className={cx("text-[11px] leading-snug text-ink-faint", visual ? "mt-2" : "mt-3")}>
          {caption}
        </div>
      )}
    </>
  );

  const cls = cx(
    "panel flex flex-col p-4 text-left",
    interactive && "panel-hover cursor-pointer",
    className,
  );
  return interactive
    ? <button type="button" onClick={onClick} className={cls}>{body}</button>
    : <div className={cls}>{body}</div>;
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
