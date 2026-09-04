"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, History, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { useFreshEffect } from "@/lib/fresh";
import type { GrandPrix } from "@/lib/types";
import { cx } from "@/lib/format";

const SESSION_TYPES = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Sprint", "Race"];

export interface Selection { year: number; gp: string; session: string; }

export function RaceSelector({
  value, onChange, onRefresh, loading,
}: {
  value: Selection; onChange: (s: Selection) => void; onRefresh: () => void; loading: boolean;
}) {
  const [races, setRaces] = useState<GrandPrix[]>([]);
  const [thisYear, setThisYear] = useState<number | null>(null);
  useFreshEffect((fresh) => {
    api.current().then((c) => { if (fresh()) setThisYear(c.year); }).catch(() => {});
  }, []);

  // Race Explorer is scoped to whatever season is loaded (the current season by
  // default) — there is no season dropdown here; finished seasons live in Seasons.
  //
  // Guarded like every other season-keyed fetch: a calendar that arrives after
  // the season has moved on would repopulate the Grand Prix list with the wrong
  // season's races, and the snap-to-latest effect below would then act on it.
  useFreshEffect((fresh) => {
    api.races(value.year)
      .then((r) => { if (fresh()) setRaces(r.races); })
      .catch(() => { if (fresh()) setRaces([]); });
  }, [value.year]);

  /* WHAT HAS ACTUALLY BEEN RUN IS THE SERVER'S ANSWER, NOT OURS.
     This used to re-derive availability here from `session_times`, with
     `completed` consulted first as a safety net. Both halves were wrong in
     the same way: `completed` was computed upstream from `date`, a field that
     means the Friday to OpenF1 and the Sunday to Jolpica — so on the opening
     day of a weekend `completed` was true, the `||` short-circuited, and the
     Grand Prix was offered with a race two days away. The client cannot fix a
     rule it is downstream of; the rule moved to app/schedule.py and the
     answer now travels on the payload as `available_sessions`. */
  const runSessions = (r: GrandPrix): string[] => r.available_sessions ?? [];

  /* AND A SESSION ON TRACK IS WORTH OPENING TOO.
     `available` was the whole list, so during Practice 1 the session a reader
     could actually hear on the television was the one session the picker
     refused to offer. It is offered now and answers with the live state —
     which Grand Prix, which session, how long it has been running, what is
     next — rather than with an analysis it does not have. Kept in the
     weekend's own order, so "the latest" below is still the latest. */
  const offered = (r: GrandPrix): string[] => {
    const run = new Set(r.available_sessions ?? []);
    const live = new Set(r.live_sessions ?? []);
    return (r.sessions ?? []).filter((s) => run.has(s) || live.has(s));
  };
  const isLive = (r: GrandPrix | undefined, s: string) =>
    !!r?.live_sessions?.includes(s);

  /* A Grand Prix appears once any of its sessions has been run or is running —
     which is what keeps a weekend in progress on the list from Friday
     afternoon, showing Practice while the race is still two days out. */
  const availableRaces = races.filter((r) => offered(r).length > 0);

  /* AND A SELECTION IS NEVER ALLOWED TO OUTLIVE THE LIST.
     Filtering the dropdown is only half the fix: the selection can also arrive
     from a `?gp=` link or from state restored by a back navigation, and the
     Explorer would fetch it regardless — which is how a reader ended up staring
     at an empty Brazilian Grand Prix in August. If what is selected is not on
     offer, we snap to the most recent race that is. */
  useEffect(() => {
    if (!races.length || !availableRaces.length) return;
    if (availableRaces.some((r) => r.name === value.gp)) return;
    onChange({ ...value, gp: availableRaces[availableRaces.length - 1].name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [races, value.gp]);

  const currentRace = availableRaces.find((r) => r.name === value.gp);
  const sessions = currentRace ? offered(currentRace)
    : races.length ? [] : SESSION_TYPES;

  /* If the selected session has not been run for this event — picking a
     weekend in progress while "Race" is selected — snap to the latest that
     has. Depends on `sessions` itself, not just on the Grand Prix: during a
     live weekend the list grows under a reader who has not touched the
     picker, and a selection made before Qualifying ran must not be left
     pointing at a session the server has since stopped offering. */
  useEffect(() => {
    if (currentRace && sessions.length && !sessions.includes(value.session)) {
      onChange({ ...value, session: sessions[sessions.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.gp, races, sessions.join("|")]);

  return (
    <div className="grid grid-cols-2 items-end gap-2.5 sm:flex sm:flex-wrap">
      {/* The season is fixed — plain text on purpose, so it can't be mistaken
          for a dropdown like the selectors next to it. */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="label flex items-center gap-1"><Calendar size={13} /> Season</span>
        <span className="flex h-[38px] items-center text-lg font-semibold tabular-nums tracking-tight text-ink">
          {value.year}
          {/* Only when it IS the current one. This chip was unconditional, so a
              deep link to 2024 rendered "2024 CURRENT" — the season label
              contradicting itself two words later. */}
          {value.year === thisYear && (
            <span className="ml-2 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              current
            </span>
          )}
        </span>
      </div>

      <Field label="Grand Prix" className="col-span-2">
        <Select value={value.gp} onChange={(v) => onChange({ ...value, gp: v })} wide
          ariaLabel="Grand Prix"
          options={(availableRaces.length ? availableRaces : [{ name: value.gp } as GrandPrix]).map((r) => ({ value: r.name, label: r.name }))} />
      </Field>

      <Field label="Session">
        <Select value={value.session} onChange={(v) => onChange({ ...value, session: v })}
          ariaLabel="Session"
          options={(sessions.length ? sessions : [value.session]).map((s) => ({
            value: s,
            // The one on track is named as such in the list itself — a reader
            // scanning the sessions should not have to open one to find out.
            label: isLive(currentRace, s) ? `${s} · Live` : s,
          }))} />
      </Field>

      <button onClick={onRefresh} disabled={loading}
        className="pill-btn h-[38px] justify-center self-end" title="Refetch (bypass cache)">
        <RefreshCw size={14} className={cx(loading && "animate-spin")} /> Refresh
      </button>


      <Link href="/history"
        className="pill-btn h-[38px] self-end text-ink-muted hover:text-ink sm:ml-auto"
        title="Browse finished seasons in Seasons">
        <History size={14} /> Previous seasons <span className="text-ink-faint">→</span>
      </Link>
    </div>
  );
}

function Field({ label, icon, className, children }: {
  label: string; icon?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="label flex items-center gap-1">{icon}{label}</span>
      {children}
    </label>
  );
}

