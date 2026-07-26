import { InfoTip } from "./InfoTip";
import { IconTile, toneText, type VisualTone } from "./Visuals";
import { cx } from "@/lib/format";

/**
 * A single number with its name. The quiet sibling of InsightCard: same surface,
 * same label treatment, same optional glyph — for facts that need a value but
 * no portrait and no visual.
 */
export function StatTile({
  label, value, sub, tone, info, icon,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: VisualTone; info?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        {icon && <IconTile tone={tone ?? "neutral"} size={26}>{icon}</IconTile>}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className={cx("mt-2.5 text-2xl font-bold tabular-nums tracking-tight",
        tone ? toneText[tone] : "text-ink")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs leading-snug text-ink-muted">{sub}</div>}
    </div>
  );
}
