"use client";
import {
  AlertTriangle, ArrowDownWideNarrow, Clock, Gauge, Medal, Ruler, Sparkles,
  Target, Thermometer, TrendingUp, Zap,
} from "lucide-react";
import type { Driver, QualifyingSummary, RaceSession } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import { EmptyState } from "@/components/ui/misc";
import { fmtLap } from "@/lib/format";

/**
 * The Saturday experience. Qualifying answers one question — who earned the
 * grid, and why — so nothing here implies the Grand Prix has happened:
 *  - story: what the session told us, in cards (pole, margins, surprises…)
 *  - laps:  how it unfolded — segments, evolution, deleted laps, interruptions
 *  - pace:  one-lap and constructor speed
 */
export function QualifyingView({
  qualifying, session, section,
}: { qualifying: QualifyingSummary; session: RaceSession; section: "story" | "laps" | "pace" }) {
  if (!qualifying) return <EmptyState title="No qualifying data" />;
  if (section === "story") return <Story q={qualifying} session={session} />;
  if (section === "laps") return <LapAnalysis q={qualifying} session={session} />;
  return <QualiPace q={qualifying} session={session} />;
}

const driverOf = (session: RaceSession, code?: string | null): Driver | null =>
  session.drivers.find((d) => d.code === code) ?? null;

/* ------------------------------ story ---------------------------------- */
function Story({ q, session }: { q: QualifyingSummary; session: RaceSession }) {
  const nameOf = (code?: string | null) =>
    driverOf(session, code)?.name ?? q.rows.find((r) => r.driver === code)?.name ?? code ?? "—";
  const rowOf = (code?: string | null) => q.rows.find((r) => r.driver === code);
  const pole = rowOf(q.pole_driver);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent-soft" /> How the grid was earned</span>} />
        <CardBody className="space-y-2.5">
          {q.story.map((s, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-ink"><span className="mr-2 text-accent-soft">•</span>{s}</p>
          ))}
          {q.notes.map((n, i) => <p key={i} className="text-xs text-amber">{n}</p>)}
        </CardBody>
      </Card>

      {/* qualifying-specific cards — never race verdicts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QCard icon={<Medal size={15} />} tone="accent" label="Pole position"
          value={nameOf(q.pole_driver)} avatar={<DriverAvatar driver={driverOf(session, q.pole_driver)} size={34} />}
          sub={q.pole_lap ? fmtLap(q.pole_lap) : undefined}
          why={q.pole_margin != null ? `${q.pole_margin.toFixed(3)}s clear of the front row.` : "Quickest single lap of the session."} />
        <QCard icon={<Ruler size={15} />} tone="speed" label="Closest margin"
          value={q.closest_pair ? `${q.closest_pair.a} vs ${q.closest_pair.b}` : "—"}
          sub={q.closest_pair ? `${q.closest_pair.delta.toFixed(3)}s (${q.closest_pair.positions})` : undefined}
          why="The tightest gap anywhere in the top ten." />
        <QCard icon={<Zap size={15} />} tone="amber" label="Biggest surprise"
          value={nameOf(q.biggest_surprise?.driver)}
          avatar={q.biggest_surprise ? <DriverAvatar driver={driverOf(session, q.biggest_surprise.driver)} size={34} /> : undefined}
          why={q.biggest_surprise?.reason ? q.biggest_surprise.reason + "." : "No clear over-delivery today."} />
        <QCard icon={<TrendingUp size={15} />} tone="speed" label="Biggest improvement"
          value={nameOf(q.biggest_improvement_driver)}
          avatar={q.biggest_improvement_driver ? <DriverAvatar driver={driverOf(session, q.biggest_improvement_driver)} size={34} /> : undefined}
          sub={rowOf(q.biggest_improvement_driver)?.improvement ? `−${rowOf(q.biggest_improvement_driver)!.improvement!.toFixed(2)}s` : undefined}
          why="Found the most time from first run to last." />
        <QCard icon={<Gauge size={15} />} tone="accent" label="Fastest sectors"
          value={nameOf(q.fastest_sector_driver)}
          avatar={q.fastest_sector_driver ? <DriverAvatar driver={driverOf(session, q.fastest_sector_driver)} size={34} /> : undefined}
          why="Owns the most session-best sectors." />
        <QCard icon={<Thermometer size={15} />} tone="amber" label="Track evolution"
          value={q.track_evolving ? "Getting faster" : "Stable"}
          why={q.track_evolving
            ? "Grip kept improving — late runs were worth chasing."
            : "Lap times held steady through the session."} />
        <QCard icon={<ArrowDownWideNarrow size={15} />} tone="default" label="Early elimination"
          value={nameOf(q.early_elimination?.driver)}
          avatar={q.early_elimination ? <DriverAvatar driver={driverOf(session, q.early_elimination.driver)} size={34} /> : undefined}
          why={q.early_elimination?.reason ? q.early_elimination.reason + "." : "No headline names out early."} />
        <QCard icon={<Target size={15} />} tone="speed" label="Most consistent"
          value={nameOf(q.most_consistent_driver)}
          avatar={q.most_consistent_driver ? <DriverAvatar driver={driverOf(session, q.most_consistent_driver)} size={34} /> : undefined}
          why="Smallest spread across their push laps." />
      </div>

      <GridTable q={q} session={session} pole={pole?.best_lap ?? null} />
    </div>
  );
}

function GridTable({ q, session, pole }: { q: QualifyingSummary; session: RaceSession; pole: number | null }) {
  const hasSegments = q.rows.some((r) => r.q1 || r.q2 || r.q3);
  return (
    <Card>
      <CardHeader title="The grid, as earned"
        info={<InfoTip label="Reading qualifying" text="Ordered by qualifying classification. Gap is to pole on best laps. Q1/Q2/Q3 show each knockout segment's best where the data provides it — eliminated drivers simply have no later-segment time." />} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pl-5 pr-2">Pos</th><th className="py-2 pr-2">Driver</th>
              {hasSegments ? (
                <>
                  <th className="py-2 pr-2">Q1</th><th className="py-2 pr-2">Q2</th>
                  <th className="py-2 pr-2">Q3</th>
                </>
              ) : (
                <th className="py-2 pr-2">Best lap</th>
              )}
              <th className="py-2 pr-5">Gap to pole</th>
            </tr>
          </thead>
          <tbody>
            {q.rows.map((r) => (
              <tr key={r.driver} className="border-b border-white/[0.04]">
                <td className="py-2 pl-5 pr-2 tabular-nums font-semibold">{r.position ?? "—"}</td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                      name={r.name} team={r.team} teamColor={r.team_color} size={26} />
                    {r.knocked_out_in && <Badge tone="neutral">out in {r.knocked_out_in}</Badge>}
                  </span>
                </td>
                {hasSegments ? (
                  <>
                    <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(r.q1)}</td>
                    <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(r.q2)}</td>
                    <td className="py-2 pr-2 tabular-nums text-speed">{fmtLap(r.q3)}</td>
                  </>
                ) : (
                  <td className="py-2 pr-2 tabular-nums text-speed">{fmtLap(r.best_lap)}</td>
                )}
                <td className="py-2 pr-5 tabular-nums text-ink-muted">
                  {r.best_lap && pole ? (r.best_lap === pole ? "pole" : `+${(r.best_lap - pole).toFixed(3)}`) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------- lap analysis ------------------------------ */
function LapAnalysis({ q, session }: { q: QualifyingSummary; session: RaceSession }) {
  const nameOf = (code?: string | null) =>
    driverOf(session, code)?.name ?? code ?? "—";
  const segs = ["Q1", "Q2", "Q3"].filter((s) => q.segment_bests[s]);
  const improvers = [...q.rows]
    .filter((r) => r.improvement && r.improvement > 0)
    .sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0)).slice(0, 6);
  const pb = q.pole_sector_breakdown;

  return (
    <div className="space-y-4">
      {/* segment progression — how much faster each knockout round got */}
      {segs.length > 0 && (
        <Card>
          <CardHeader title="Session progression"
            info={<InfoTip text="The best lap of each knockout segment. The drop from Q1 to Q3 is fuel burn, fresh softs and track evolution combined." />} />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              {segs.map((s, i) => (
                <div key={s} className="rounded-xl border border-white/[0.06] bg-base-800/50 p-4">
                  <div className="label">{s} best</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{fmtLap(q.segment_bests[s])}</div>
                  {i > 0 && q.segment_bests[segs[i - 1]] && (
                    <div className="text-xs tabular-nums text-emerald-300">
                      −{(q.segment_bests[segs[i - 1]] - q.segment_bests[s]).toFixed(3)}s vs {segs[i - 1]}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {q.track_evolving && (
              <p className="mt-3 text-sm text-ink-muted">
                The track kept gaining grip — median lap times fell through the session, so the
                final runs in each segment carried the most weight.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* pole lap breakdown vs the "perfect lap" */}
        <Card>
          <CardHeader title="Pole lap breakdown"
            info={<InfoTip text="The pole sitter's best sectors against the session-best in each sector. Matching all three means the pole lap was also the theoretical perfect lap." />} />
          <CardBody>
            {pb && pb.pole.some(Boolean) ? (
              <div className="space-y-2">
                {pb.pole.map((s, i) => {
                  const best = pb.session_best[i];
                  const isBest = s != null && best != null && s <= best;
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="w-16 text-ink-muted">Sector {i + 1}</span>
                      <span className="tabular-nums font-semibold">{s ? s.toFixed(3) : "—"}</span>
                      {isBest
                        ? <Badge tone="good">session best</Badge>
                        : best != null && s != null && (
                          <span className="text-xs tabular-nums text-ink-faint">+{(s - best).toFixed(3)} vs best</span>
                        )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-ink-faint">Sector times aren&apos;t available for this session.</p>}
          </CardBody>
        </Card>

        {/* biggest improvements through the session */}
        <Card>
          <CardHeader title="Biggest improvements"
            info={<InfoTip text="How much each driver gained from their early runs to their final best — a read on who extracted the track's evolution." />} />
          <CardBody className="space-y-2">
            {improvers.length ? improvers.map((r) => (
              <div key={r.driver} className="flex items-center gap-2">
                <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                  name={r.name} team={r.team} teamColor={r.team_color}
                  size={24} className="w-40 shrink-0" />
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-emerald-400/80"
                    style={{ width: `${Math.min(100, (r.improvement! / (improvers[0].improvement || 1)) * 100)}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-emerald-300">
                  −{r.improvement!.toFixed(2)}s
                </span>
              </div>
            )) : <p className="text-sm text-ink-faint">No meaningful in-session improvements detected.</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* interruptions */}
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber" /> Interruptions</span>} />
          <CardBody className="space-y-1.5">
            {q.red_flags.length ? q.red_flags.map((m, i) => (
              <p key={i} className="rounded-lg border border-rose-400/15 bg-rose-400/[0.05] px-3 py-1.5 text-xs text-rose-200">{m}</p>
            )) : <p className="text-sm text-ink-faint">A clean session — no red flags.</p>}
          </CardBody>
        </Card>

        {/* deleted laps */}
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Clock size={14} className="text-ink-muted" /> Deleted laps</span>}
            info={<InfoTip text="Laps removed by race control, usually for exceeding track limits — a deleted lap can decide an elimination." />} />
          <CardBody className="space-y-1.5">
            {q.deleted_laps.length ? q.deleted_laps.map((m, i) => (
              <p key={i} className="rounded-lg border border-white/[0.05] bg-base-800/50 px-3 py-1.5 text-xs text-ink-muted">{m}</p>
            )) : <p className="text-sm text-ink-faint">No laps were deleted.</p>}
          </CardBody>
        </Card>
      </div>
      <p className="text-xs text-ink-faint">
        Analyzing {nameOf(q.pole_driver)}&apos;s pole and the field&apos;s runs — the race is still to come.
      </p>
    </div>
  );
}

/* ------------------------------- pace ---------------------------------- */
function QualiPace({ q, session }: { q: QualifyingSummary; session: RaceSession }) {
  const timed = q.rows.filter((r) => r.best_lap);
  const poleT = timed[0]?.best_lap ?? 0;
  const maxGap = Math.max(0.001, ...timed.map((r) => (r.best_lap ?? 0) - poleT));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="One-lap pace"
          info={<InfoTip text="Best lap each driver set, ranked. Bars show the gap to pole." />} />
        <CardBody className="space-y-2">
          {timed.map((r) => (
            <div key={r.driver} className="flex items-center gap-2">
              <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                name={r.name} team={r.team} teamColor={r.team_color}
                size={24} className="w-40 shrink-0" />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full"
                  style={{ width: `${Math.max(8, 100 - (((r.best_lap ?? 0) - poleT) / maxGap) * 70)}%`, background: r.team_color }} />
              </span>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted">{fmtLap(r.best_lap)}</span>
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Constructor pace"
          info={<InfoTip text="Teams ranked by their quickest car's best lap — the one-lap machinery order." />} />
        <CardBody className="space-y-1.5">
          {q.team_ranking.map((t, i) => (
            <div key={t.team} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-base-800/50 px-3 py-2">
              <span className="w-4 tabular-nums text-ink-faint">{i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="flex-1 text-sm font-medium">{t.team}</span>
              <span className="tabular-nums text-xs text-ink-muted">{i === 0 ? "quickest" : `+${t.gap.toFixed(3)}s`}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function QCard({ icon, label, value, sub, why, tone, avatar }: any) {
  const t = { accent: "text-accent-soft", speed: "text-speed", amber: "text-amber", default: "text-ink" }[tone as string];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-base-800/60 p-4">
      <div className="flex items-center gap-1.5 text-ink-faint"><span className={t}>{icon}</span><span className="label">{label}</span></div>
      <div className="mt-1.5 flex items-center gap-2.5">
        {avatar}
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold tracking-tight text-ink">{value}</div>
          {sub && <div className="text-xs text-ink-muted">{sub}</div>}
        </div>
      </div>
      <div className="mt-2 text-[11px] leading-snug text-ink-faint">{why}</div>
    </div>
  );
}
