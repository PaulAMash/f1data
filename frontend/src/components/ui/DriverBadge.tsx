"use client";
import { useState } from "react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";

// A friendly driver identity: portrait where OpenF1 provides one, else a clean
// team-coloured initials avatar. Used across Simple-mode views so casual fans
// see names + teams, not just VER/HAM.
export function DriverAvatar({ driver, size = 28 }: { driver?: Driver | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const color = driver?.team_color ?? "#8892a6";
  const initials = (driver?.name ?? driver?.code ?? "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const showImg = driver?.headshot_url && !broken;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: `${color}22`, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={driver!.headshot_url!} alt={driver!.name} onError={() => setBroken(true)}
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
