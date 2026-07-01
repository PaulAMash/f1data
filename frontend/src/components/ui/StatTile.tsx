import { InfoTip } from "./InfoTip";
import { cx } from "@/lib/format";

export function StatTile({
  label, value, sub, tone, info,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: "accent" | "speed" | "amber" | "default"; info?: string;
}) {
  const toneClass = {
    accent: "text-accent-soft", speed: "text-speed", amber: "text-amber", default: "text-ink",
  }[tone ?? "default"];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-base-800/60 p-4">
      <div className="flex items-center gap-1.5">
        <span className="label">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className={cx("mt-1 text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
