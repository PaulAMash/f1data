import { Database, FlaskConical, Radio } from "lucide-react";
import type { DataSource } from "@/lib/types";
import { cx } from "@/lib/format";

const MAP: Record<DataSource, { label: string; className: string; Icon: any; hint: string }> = {
  live: {
    label: "Live F1 data",
    className: "border-speed/40 bg-speed/10 text-speed",
    Icon: Radio,
    hint: "Freshly fetched real data through pitwall / FastF1.",
  },
  cache: {
    label: "Cached real data",
    className: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    Icon: Database,
    hint: "Real data fetched earlier and served from the local cache.",
  },
  mock: {
    label: "Demo data",
    className: "border-amber/40 bg-amber/10 text-amber",
    Icon: FlaskConical,
    hint: "Realistic simulated race — shown when live F1 data can't be fetched.",
  },
};

export function DataSourceBadge({ source, title }: { source: DataSource; title?: string }) {
  const m = MAP[source];
  const Icon = m.Icon;
  return (
    <span
      title={title || m.hint}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        m.className,
      )}
    >
      <Icon size={12} />
      {m.label}
    </span>
  );
}
