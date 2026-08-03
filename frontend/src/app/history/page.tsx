"use client";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { HistoricalExplorer } from "@/components/history/HistoricalExplorer";
import { useIsAdvanced } from "@/lib/mode";
import { usePrefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import type { DataSource } from "@/lib/types";
import { cx } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { Standings } from "@/components/history/Standings";

/** Accurate, non-misleading source label. Only flags non-archive data (sample);
 *  real archive results carry no badge at all. */
function SourceTag({ source }: { source: DataSource }) {
  const advanced = useIsAdvanced();
  if (!advanced || source !== "mock") return null;
  return <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-ink-faint">Sample data</span>;
}

const YEARS = Array.from({ length: 9 }, (_, i) => 2026 - i);

export default function History() {
  const { prefs, ready } = usePrefs();
  const [year, setYear] = useState(2025);
  const [touched, setTouched] = useState(false);
  /** The season in progress — the one this page has to open on by default. */
  const [current, setCurrent] = useState<number | null>(null);

  /* THIS PAGE OPENS ON THIS YEAR.
     It is called Seasons and it carries the championship, so the first thing it
     shows has to be the championship people are actually following. It used to
     open on a hard-coded 2025 while calling itself "the archive", which is how
     a reader concluded the current standings were somewhere else entirely.

     Order of precedence: a season the reader named in Settings, then the season
     actually in progress, then whatever a link asked for — and none of them
     once the reader has used the picker, because a default is a starting point
     and not an override. */
  useEffect(() => {
    let live = true;
    api.current().then((c) => { if (live) setCurrent(c.year); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!ready || touched) return;
    const asked = typeof window !== "undefined"
      ? Number(new URLSearchParams(window.location.search).get("year")) : 0;
    const want = asked || prefs.season || current;
    if (want) setYear(want);
  }, [ready, touched, prefs.season, current]);
  /* The table fetches its own rows — see components/history/Standings. What is
     left here is the one thing this page knows and the component does not:
     whether the archive answered at all, which is what the source badge is
     about. One probe rather than a duplicate of the component's fetch. */
  const [source, setSource] = useState<DataSource>("mock");
  useEffect(() => {
    api.historyStandings(year, "driver")
      .then((r) => setSource(r.source as DataSource))
      .catch(() => setSource("mock"));
  }, [year]);

  return (
    <div className="min-h-screen">
      <NavBar active="history" />
      <div data-tour="history" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* The archive earns the same header the Race Explorer has. It was a
            14px label over a 20px heading — the plainest page in the product,
            introducing the largest thing in it. */}
        <header className="mb-7">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            <span className="font-mono text-accent-soft">1950</span>
            <span className="h-px w-6 bg-white/[0.14]" />
            Seasons
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-white to-ink-muted bg-clip-text text-3xl font-bold tracking-[-0.03em] text-transparent sm:text-4xl">
            Every season, every result
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Championship standings and official classifications for every Grand&nbsp;Prix
            that has been run — this season included, and seventy-six before it.
          </p>
        </header>

        {/* Functional data explorer: year → Grand Prix → session → results */}
        <div className="mb-4">
          <HistoricalExplorer />
        </div>

        <div>
          {/* standings */}
          <Card>
            <CardHeader
              title={`${year} championship`}
              info={<InfoTip text="Points and wins for the selected season. The bar is the gap to the leader, not the points total." />}
              right={
                <div className="flex items-center gap-2">
                  <SourceTag source={source} />
                  <Select value={year} ariaLabel="Season"
                    onChange={(y) => { setTouched(true); setYear(y); }}
                    options={YEARS.map((y) => ({
                      value: y, label: y === current ? `${y} · this season` : String(y),
                    }))} />
                </div>
              }
            />
            <CardBody>
              {/* Faces only where every face exists — see components/history/Standings */}
              <Standings year={year} portraits={year === current} />
            </CardBody>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
