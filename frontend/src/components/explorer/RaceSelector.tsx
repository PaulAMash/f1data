"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronDown, History, RefreshCw } from "lucide-react";
import { ModeToggle } from "@/components/layout/NavBar";
import { api } from "@/lib/api";
import type { GrandPrix } from "@/lib/types";
import { cx } from "@/lib/format";

const SESSION_TYPES = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Sprint", "Race"];

export interface Selection { year: number; gp: string; session: string; }

export function RaceSelector({
  value, onChange, onRefresh, loading, showModeToggle = true,
}: {
  value: Selection; onChange: (s: Selection) => void; onRefresh: () => void; loading: boolean;
  showModeToggle?: boolean;
}) {
  const [races, setRaces] = useState<GrandPrix[]>([]);

  // Race Explorer is scoped to whatever season is loaded (the current season by
  // default) — there is no season dropdown here; past seasons live in Historical.
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

  // A Grand Prix appears as soon as its first session has run (fixes ongoing
  // weekends being hidden until race day). Undated events are kept.
  const availableRaces = races.filter((r) => startedSessions(r).length > 0);

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
          <span className="ml-2 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            current
          </span>
        </span>
      </div>

      <Field label="Grand Prix" className="col-span-2">
        <Select value={value.gp} onChange={(v) => onChange({ ...value, gp: v })} wide
          options={(availableRaces.length ? availableRaces : [{ name: value.gp } as GrandPrix]).map((r) => ({ value: r.name, label: r.name }))} />
      </Field>

      <Field label="Session">
        <Select value={value.session} onChange={(v) => onChange({ ...value, session: v })}
          options={(sessions.length ? sessions : [value.session]).map((s) => ({ value: s, label: s }))} />
      </Field>

      <button onClick={onRefresh} disabled={loading}
        className="pill-btn h-[38px] justify-center self-end" title="Refetch (bypass cache)">
        <RefreshCw size={14} className={cx(loading && "animate-spin")} /> Refresh
      </button>

      {showModeToggle && (
        <span className="self-end"><ModeToggle /></span>
      )}

      <Link href="/history"
        className="pill-btn h-[38px] self-end text-ink-muted hover:text-ink sm:ml-auto"
        title="Browse previous seasons in Historical">
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

function Select({ value, onChange, options, wide }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; wide?: boolean;
}) {
  return (
    <span className={cx("relative inline-flex w-full items-center sm:w-auto", wide ? "sm:min-w-[220px]" : "sm:min-w-[120px]")}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-white/10 bg-base-800 px-3 py-2 pr-8 text-sm text-ink outline-none focus:border-white/25">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-base-800">{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-ink-faint" />
    </span>
  );
}
