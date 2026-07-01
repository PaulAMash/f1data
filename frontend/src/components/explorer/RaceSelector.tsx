"use client";
import { useEffect, useState } from "react";
import { Calendar, ChevronDown, FlaskConical, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { GrandPrix, Season } from "@/lib/types";
import { cx } from "@/lib/format";

const SESSION_TYPES = ["Race", "Qualifying", "Sprint", "Practice 1", "Practice 2", "Practice 3"];

export interface Selection { year: number; gp: string; session: string; mock: boolean; }

export function RaceSelector({
  value, onChange, onRefresh, loading,
}: {
  value: Selection; onChange: (s: Selection) => void; onRefresh: () => void; loading: boolean;
}) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [races, setRaces] = useState<GrandPrix[]>([]);

  useEffect(() => {
    api.seasons().then((r) => setSeasons(r.seasons)).catch(() => setSeasons([]));
  }, []);

  useEffect(() => {
    api.races(value.year).then((r) => setRaces(r.races)).catch(() => setRaces([]));
  }, [value.year, value.mock]);

  const currentRace = races.find((r) => r.name === value.gp);
  const sessions = currentRace?.sessions?.length ? currentRace.sessions : SESSION_TYPES;

  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <Field label="Season" icon={<Calendar size={13} />}>
        <Select value={String(value.year)} onChange={(v) => onChange({ ...value, year: Number(v) })}
          options={(seasons.length ? seasons.map((s) => s.year) : [value.year]).map((y) => ({ value: String(y), label: String(y) }))} />
      </Field>

      <Field label="Grand Prix">
        <Select value={value.gp} onChange={(v) => onChange({ ...value, gp: v })} wide
          options={(races.length ? races : [{ name: value.gp } as GrandPrix]).map((r) => ({ value: r.name, label: r.name }))} />
      </Field>

      <Field label="Session">
        <Select value={value.session} onChange={(v) => onChange({ ...value, session: v })}
          options={sessions.map((s) => ({ value: s, label: s }))} />
      </Field>

      <button
        onClick={() => onChange({ ...value, mock: !value.mock })}
        className={cx("pill-btn h-[38px]", value.mock && "border-amber/40 bg-amber/10 text-amber")}
        title="Force the realistic simulated demo race instead of fetching live data"
      >
        <FlaskConical size={14} /> Demo {value.mock ? "on" : "off"}
      </button>

      <button onClick={onRefresh} disabled={loading} className="pill-btn h-[38px]" title="Refetch (bypass cache)">
        <RefreshCw size={14} className={cx(loading && "animate-spin")} /> Refresh
      </button>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label flex items-center gap-1">{icon}{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options, wide }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; wide?: boolean;
}) {
  return (
    <span className={cx("relative inline-flex items-center", wide ? "min-w-[220px]" : "min-w-[120px]")}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-white/10 bg-base-800 px-3 py-2 pr-8 text-sm text-ink outline-none focus:border-white/25">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-base-800">{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-ink-faint" />
    </span>
  );
}
