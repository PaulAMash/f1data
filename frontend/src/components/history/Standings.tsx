"use client";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Users } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton, EmptyState } from "@/components/ui/misc";
import { ConstructorMark } from "@/components/ui/ConstructorMark";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { api } from "@/lib/api";
import { teamColour } from "@/lib/constructors";
import { useLivery } from "@/lib/liveryColor";
import { useLocale } from "@/lib/locale";
import type { DataSource, Driver } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Championship standings.                                                    */
/*                                                                            */
/* This lived inline in the Historical page as a grey list: a number, a name,  */
/* a points total and a bar that was accent for first and teal for everyone    */
/* else. Accurate, and the plainest surface in a product whose whole visual    */
/* argument is that colour is how you recognise a car.                          */
/*                                                                            */
/* Three things carry it now, and none of them is decoration:                  */
/*                                                                            */
/*   COLOUR IS THE TEAM. A rail down the left of every row in the             */
/*   constructor's own livery, and the bar in it too. A reader finds their     */
/*   team before they read a word, which is the entire point of a livery.      */
/*                                                                            */
/*   THE TOP THREE ARE THE STORY. A championship is read from the top, and     */
/*   the gap between first and second is the fact anybody wants. P1–P3 get     */
/*   more weight and a larger figure; everyone else recedes into a list.       */
/*                                                                            */
/*   THE BAR IS A GAP, NOT A SCORE. Scaled to the leader, so the picture is    */
/*   "how far behind" rather than "how many" — which is what a championship    */
/*   table is actually about, and it is why the leader's bar is always full.   */
/*                                                                            */
/* Extracted because the Race Explorer needs exactly this for the season in    */
/* progress. Two implementations of a championship table would be two places   */
/* to fix the next time one of them is wrong.                                  */
/* -------------------------------------------------------------------------- */

interface Row {
  position: number;
  name: string;
  code?: string | null;
  team?: string | null;
  points: number;
  wins?: number | null;
  /** Joined on by the API from F1's own driver listing; absent in demo mode. */
  headshot_url?: string | null;
}

/* -------------------------------------------------------------------------- */
/* ONE PORTRAIT SYSTEM, NOT TWO.                                              */
/*                                                                            */
/* The Final Classification cards resolve a face by looking the driver up in   */
/* `session.drivers` — records the backend has already enriched from F1's own  */
/* listing, with the fallbacks and the URL normalisation that live there. That */
/* works, everywhere, and has for versions.                                    */
/*                                                                            */
/* This table had its own second system: a name-join done in the standings     */
/* endpoint. Two implementations of "find this driver's face" is one too many, */
/* and the second one was the one that failed — it is skipped entirely in demo */
/* mode, and it matches on a full name where the first matches on a code.      */
/*                                                                            */
/* So when a session is on screen, its drivers come in as `roster` and the     */
/* lookup is the SAME lookup the classification uses. The name-join stays as   */
/* the fallback for the Historical page, which has a season but no session —   */
/* one path, with a second only where the first cannot reach.                  */
/* -------------------------------------------------------------------------- */

export function Standings({ year, compact, roster }: {
  year: number;
  compact?: boolean;
  /** The session's own enriched drivers, when a session is on screen. */
  roster?: Driver[];
}) {
  const [type, setType] = useState<"driver" | "constructor">("driver");
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<DataSource>("mock");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.historyStandings(year, type)
      .then((r) => {
        if (!alive) return;
        setRows(r.standings as Row[]);
        setSource(r.source as DataSource);
      })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, type]);

  // by code, exactly as the classification does it
  const byCode = useMemo(
    () => new Map((roster ?? []).map((d) => [d.code, d])),
    [roster],
  );

  const lead = Math.max(1, ...rows.map((r) => r.points ?? 0));
  const shown = compact ? rows.slice(0, 10) : rows;

  return (
    <div>
      <Tabs data-tour="standings-switch" items={[
        { id: "driver", label: "Drivers", icon: <Users size={14} /> },
        { id: "constructor", label: "Constructors", icon: <Trophy size={14} /> },
      ]} active={type} onChange={(t) => setType(t as "driver" | "constructor")} className="mb-4" />

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: compact ? 6 : 10 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
        </div>
      ) : shown.length ? (
        <ol className="space-y-1">
          {shown.map((r) => (
            <StandingRow key={`${r.position}-${r.name}`} row={r} lead={lead}
              constructor={type === "constructor"}
              driver={r.code ? byCode.get(r.code) : undefined} />
          ))}
        </ol>
      ) : (
        <EmptyState title="No standings available"
          hint={source === "mock" ? "Demo mode has no championship table for this season." : undefined} />
      )}
    </div>
  );
}

function StandingRow({ row, lead, constructor, driver }: {
  row: Row; lead: number; constructor: boolean;
  /** The session's own record for this driver, when there is one. */
  driver?: Driver;
}) {
  const paint = useLivery();
  const { num } = useLocale();
  const team = constructor ? row.name : (row.team ?? "");
  const tint = paint(teamColour(team));
  const top = (row.position ?? 99) <= 3;
  const pct = ((row.points ?? 0) / lead) * 100;

  return (
    <li className={cx("den-row group/row relative flex items-center gap-3 overflow-hidden rounded-xl px-3 transition-colors duration-[--dur-2]",
      "hover:bg-white/[0.03]")}>
      {/* the livery, as the row's own left edge */}
      <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-full transition-all duration-[--dur-2] group-hover/row:inset-y-0"
        style={{ background: tint, opacity: top ? 1 : 0.55 }} />

      <span className={cx("w-6 shrink-0 text-right font-mono tabular-nums",
        top ? "text-[15px] font-bold text-ink" : "text-[13px] text-ink-faint")}>
        {row.position}
      </span>

      {constructor ? (
        <ConstructorMark team={row.name} color={tint} size={22} />
      ) : (
        /* the face beside the name. A championship is a list of people, and it
           had been reading like a spreadsheet of them. The avatar falls back to
           team-coloured initials on its own, so a season F1 has published no
           portraits for still gets a row that looks deliberate. */
        <DriverAvatar size={top ? 32 : 27} driver={driver ?? {
          number: "", code: row.code ?? "", name: row.name,
          team: row.team ?? "", team_color: teamColour(row.team ?? ""),
          headshot_url: row.headshot_url ?? null,
        }} />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cx("truncate", top ? "text-[15px] font-semibold text-ink" : "text-[13.5px] text-ink")}>
            {row.name}
          </span>
          {!constructor && row.team && (
            <span className="truncate text-[11.5px] text-ink-faint">{row.team}</span>
          )}
        </span>
        {/* how far behind the leader, which is what a table like this is for */}
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="draw-in block h-full rounded-full"
            style={{ width: `${pct}%`, background: tint, opacity: top ? 0.95 : 0.6 }} />
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className={cx("block font-mono tabular-nums",
          top ? "text-[15px] font-bold text-ink" : "text-[13px] text-ink-muted")}>
          {num(row.points ?? 0)}
          <span className="ml-1 text-[10.5px] font-normal text-ink-faint">pts</span>
        </span>
        {!!row.wins && (
          <span className="mt-0.5 block text-[10.5px] tabular-nums text-ink-faint">
            {row.wins} {row.wins === 1 ? "win" : "wins"}
          </span>
        )}
      </span>
    </li>
  );
}
