"use client";
import { useEffect, useState } from "react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";

// A friendly driver identity: the official Formula1.com portrait where the
// provider resolved one, else a clean team-coloured initials avatar. Used
// across all views so casual fans see names + teams, not just VER/HAM.
export function DriverAvatar({ driver, size = 28 }: { driver?: Driver | null; size?: number }) {
  const url = driver?.headshot_url ?? null;
  const [broken, setBroken] = useState(false);
  // React reuses component instances across prop changes — without this reset,
  // one broken URL would blank the portrait of the NEXT driver rendered here.
  useEffect(() => setBroken(false), [url]);
  const color = driver?.team_color ?? "#8892a6";
  const initials = (driver?.name ?? driver?.code ?? "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const showImg = url && !broken;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: `${color}22`, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
      {showImg ? (
        // no-referrer: F1's image CDN rejects hotlinked requests that carry a
        // referrer. If the asset is genuinely missing the load fails and we
        // fall back to the clean initials avatar — never a silhouette.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={driver!.name} onError={() => setBroken(true)}
          referrerPolicy="no-referrer" loading="lazy"
          className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold text-ink" style={{ fontSize: size * 0.38 }}>{initials}</span>
      )}
    </span>
  );
}

/** Avatar + name + team. `compact` shows the code instead of the full name. */
export function DriverBadge({
  driver, code, name, team, teamColor, size = 28, compact = false, className,
}: {
  driver?: Driver | null; code?: string; name?: string; team?: string;
  teamColor?: string; size?: number; compact?: boolean; className?: string;
}) {
  const d: Driver | null = driver ?? (code ? {
    number: "", code, name: name ?? code, team: team ?? "",
    team_color: teamColor ?? "#8892a6",
  } as Driver : null);
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-2", className)}>
      <DriverAvatar driver={d} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold">
          {compact ? (d?.code ?? "—") : (d?.name ?? d?.code ?? "—")}
        </span>
        {!compact && (d?.team) && <span className="block truncate text-[11px] text-ink-faint">{d.team}</span>}
      </span>
    </span>
  );
}
