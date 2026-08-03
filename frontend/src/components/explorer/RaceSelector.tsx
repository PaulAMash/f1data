"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, History, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
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
  useEffect(() => {
    let live = true;
    api.current().then((c) => { if (live) setThisYear(c.year); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Race Explorer is scoped to whatever season is loaded (the current season by
  // default) — there is no season dropdown here; finished seasons live in Seasons.
  useEffect(() => {
    api.races(value.year).then((r) => setRaces(r.races)).catch(() => setRaces([]));
  }, [value.year]);

  // A session is offered only once it has actually started — so an in-progress
  // weekend shows Practice 1 as soon as it runs, and the race appears on race
  // day, never before. Without per-session times we fall back to the event date.
  const now = Date.now();
  const startedSessions = (r: GrandPrix): string[] => {
    const names = r.sessions?.length ? r.sessions : SESSION_TYPES;
    const times = r.session_times ?? {};
    return names.filter((s) => {
      const t = times[s];
      if (t) return new Date(t).getTime() <= now;
      return !r.date || new Date(r.date).getTime() <= now;
    });
  };

  /* A Grand Prix appears as soon as its first session has run (fixes ongoing
     weekends being hidden until race day). Undated events are kept.

     `completed` is the server's own answer and is checked first, because a
     session-time table can be missing or stale while the date never is — see
     service.mark_completed for why that decision lives there rather than here. */
  const availableRaces = races.filter(
    (r) => r.completed !== false || startedSessions(r).length > 0);

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
  const sessions = currentRace ? startedSessions(currentRace)
    : races.length ? [] : SESSION_TYPES;

  // If the selected session hasn't happened for this event (e.g. picking an
  // in-progress weekend while "Race" is selected), snap to the latest one that has.
  useEffect(() => {
    if (currentRace && sessions.length && !sessions.includes(value.session)) {
      onChange({ ...value, session: sessions[sessions.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.gp, races]);

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
          options={(sessions.length ? sessions : [value.session]).map((s) => ({ value: s, label: s }))} />
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

