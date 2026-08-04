"use client";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Users } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton, EmptyState } from "@/components/ui/misc";
import { ConstructorBadge } from "@/components/ui/ConstructorBadge";
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
/* TWO TIERS, AND THE LINE BETWEEN THEM IS WHETHER THE ASSETS EXIST.          */
/*                                                                            */
/* A championship table spanning seventy-seven seasons cannot carry portraits. */
/* F1 publishes them for the current grid and, patchily, for a few years back; */
/* for 1961 there is nothing. What that produced was the worst of both — a     */
/* 1961 table of grey initials in circles, which reads as a page that FAILED   */
/* to load its images rather than as a page that never had any.                */
/*                                                                            */
/* So the historical tiers do not attempt it. They are typographic: a heavier  */
/* numeral, more air per row, the livery rail, and the points set as the       */
/* figure they are. That reads as a deliberately minimal table rather than an  */
/* unfinished one, and it is the same table at every scale of asset            */
/* availability — which is the only way to be consistent across seven decades. */
/*                                                                            */
/* The CURRENT season keeps its faces, because they all exist and a grid you   */
/* recognise is the whole argument for portraits in the first place.           */
/* -------------------------------------------------------------------------- */

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

export function Standings({ year, compact, roster, portraits = false }: {
  year: number;
  compact?: boolean;
  /** The session's own enriched drivers, when a session is on screen. */
  roster?: Driver[];
  /** Faces and constructor marks. True only where the assets all exist. */
  portraits?: boolean;
}) {
  const [type, setType] = useState<"driver" | "constructor">("driver");
  /* THE ROWS CARRY THE TYPE THEY ARE.
     `type` flips the instant the tab is pressed and the fetch resolves a moment
     later, so for one render the DRIVERS' rows were being drawn as
     constructors: nineteen driver names went into the constructor badge, which
     asked the server for /teams/max-verstappen.webp, got a 404 apiece, and
     briefly showed a drawn shield reading "MAX" where a team's mark belongs.
     It also poisoned the badge's module-level probe cache with driver names for
     the rest of the session. Pairing the rows with their own type means a
     mismatch renders the skeleton — which is what is actually true while the
     other table is still loading. */
  const [loaded, setLoaded] = useState<{ type: "driver" | "constructor"; rows: Row[] } | null>(null);
  const [source, setSource] = useState<DataSource>("mock");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.historyStandings(year, type)
      .then((r) => {
        if (!alive) return;
        setLoaded({ type, rows: r.standings as Row[] });
        setSource(r.source as DataSource);
      })
      .catch(() => { if (alive) setLoaded({ type, rows: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, type]);

  const rows = loaded?.type === type ? loaded.rows : [];

  // by code, exactly as the classification does it
  const byCode = useMemo(
    () => new Map((roster ?? []).map((d) => [d.code, d])),
    [roster],
  );

  const lead = Math.max(1, ...rows.map((r) => r.points ?? 0));
  const shown = compact ? rows.slice(0, 10) : rows;

  /* FACES WHERE THE FACES EXIST, and nowhere else.
     "The current season has portraits" is an assumption, not a fact — it is
     false in demo mode and false the week a new driver is announced. So the
     caller says whether portraits are ALLOWED for this season and the data says
     whether there are any: a column of team-coloured initials is the "grey
     placeholder" this was supposed to stop, and one row of initials among
     nineteen faces is worse than either. All or none. */
  const haveFaces = portraits && rows.some(
    (r) => (r.code ? byCode.get(r.code)?.headshot_url : null) || r.headshot_url);

  return (
    <div>
      <Tabs data-tour="standings-switch" items={[
        { id: "driver", label: "Drivers", icon: <Users size={14} /> },
        { id: "constructor", label: "Constructors", icon: <Trophy size={14} /> },
      ]} active={type} onChange={(t) => setType(t as "driver" | "constructor")} className="mb-4" />

      {/* `loading` alone is one render too late: pressing the tab re-renders
          with the new type before the effect that sets it has run. The rows not
          yet matching the type IS the loading state, so it is read as one. */}
      {loading || loaded?.type !== type ? (
        <div className="space-y-1.5">
          {Array.from({ length: compact ? 6 : 10 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
        </div>
      ) : shown.length ? (
        <ol className="space-y-1">
          {shown.map((r) => (
            <StandingRow key={`${r.position}-${r.name}`} row={r} lead={lead}
              constructor={type === "constructor"} portraits={type === "constructor" ? portraits : haveFaces}
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

function StandingRow({ row, lead, constructor, driver, portraits }: {
  row: Row; lead: number; constructor: boolean;
  /** The session's own record for this driver, when there is one. */
  driver?: Driver;
  portraits: boolean;
}) {
  const paint = useLivery();
  const { num } = useLocale();
  const team = constructor ? row.name : (row.team ?? "");
  const tint = paint(teamColour(team));
  const top = (row.position ?? 99) <= 3;
  const pct = ((row.points ?? 0) / lead) * 100;

  return (
    <li className={cx("den-row group/row relative flex items-center overflow-hidden rounded-xl transition-colors duration-[--dur-2]",
      "hover:bg-white/[0.03]", portraits ? "gap-3 px-3" : "gap-4 px-3.5")}>
      {/* the livery, as the row's own left edge */}
      <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-full transition-all duration-[--dur-2] group-hover/row:inset-y-0"
        style={{ background: tint, opacity: top ? 1 : 0.55 }} />

      {/* Without a portrait the numeral IS the anchor, so it grows into the
          space the face used to hold and the row takes the air with it. */}
      <span className={cx("shrink-0 text-right font-mono tabular-nums",
        portraits ? "w-6" : "w-8",
        top
          ? cx("font-bold text-ink", portraits ? "text-[15px]" : "text-[19px]")
          : cx("text-ink-faint", portraits ? "text-[13px]" : "text-[15px]"))}>
        {row.position}
      </span>

      {/* Nothing in this slot at all for a historical season — not a
          placeholder, not initials in a circle. An empty column is a design
          decision; a column of fallbacks is a failure to load. */}
      {portraits && (constructor ? (
        /* The same circle, at the same size, as the face in the drivers' table
           beside it — a championship should not change shape when you change
           which championship you are reading. */
        <ConstructorBadge team={row.name} color={tint} size={top ? 32 : 27} />
      ) : (
        /* the face beside the name. A championship is a list of people, and it
           had been reading like a spreadsheet of them. */
        <DriverAvatar size={top ? 32 : 27} driver={driver ?? {
          number: "", code: row.code ?? "", name: row.name,
          team: row.team ?? "", team_color: teamColour(row.team ?? ""),
          headshot_url: row.headshot_url ?? null,
        }} />
      ))}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cx("truncate text-ink",
            top
              ? cx("font-semibold", portraits ? "text-[15px]" : "text-[16px] tracking-[-0.01em]")
              : cx(portraits ? "text-[13.5px]" : "text-[14.5px]"))}>
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
