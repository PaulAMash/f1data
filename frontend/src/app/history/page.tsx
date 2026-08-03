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

/* THE ARCHIVE GOES BACK TO 1950, AND SO DOES THIS PICKER.
   It offered nine seasons — a number with no relationship to anything, on a
   page whose own heading says "seventy-seven seasons of them". The Historical
   Data Explorer above it has always listed the full range from the seasons
   endpoint; the championship table under it stopped at 2018 for no reason the
   data supports. Generated from the first championship season to whatever the
   current one turns out to be, so it never needs editing again. */
const FIRST_SEASON = 1950;
const yearsTo = (latest: number) =>
  Array.from({ length: latest - FIRST_SEASON + 1 }, (_, i) => latest - i);

export default function History() {
  const { prefs, ready } = usePrefs();
  const [year, setYear] = useState(2025);
  const [touched, setTouched] = useState(false);
  /** The season in progress — the one this page has to open on by default. */
  const [current, setCurrent] = useState<number | null>(null);

  /* THIS PAGE IS THE HISTORY, AND EXPLORE IS THE PRESENT.
     V67 put the current championship here, which fixed one problem and created
     another: a reader following this year's title race had to go to a page
     called Seasons to see it, and a reader wanting 1974 landed on 2026. They
     are two different activities. Following a season in progress belongs beside
     the races that are moving it — the Race Explorer has a Championship scope
     now — and this page is what it says it is: every season that has finished.

     It still opens on the most recent COMPLETED season rather than on a
     hard-coded year, and a link may name one. */
  useEffect(() => {
    let live = true;
    api.current().then((c) => { if (live) setCurrent(c.year); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!ready || touched) return;
    const asked = typeof window !== "undefined"
      ? Number(new URLSearchParams(window.location.search).get("year")) : 0;
    const latest = current ? current - 1 : null;
    const want = asked || prefs.season || latest;
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
            Official classifications and final championship standings for every season
            that has finished — seventy-six of them, back to 1950.
            This year&rsquo;s title race lives in <a href="/explorer" className="underline decoration-dotted underline-offset-2 hover:text-ink">Explore</a>.
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
              subtitle={undefined}
              info={<InfoTip text="Points and wins for the selected season. The bar is the gap to the leader, not the points total." />}
              right={
                <div className="flex items-center gap-2">
                  <SourceTag source={source} />
                  <Select value={year} ariaLabel="Season"
                    onChange={(y) => { setTouched(true); setYear(y); }}
                    /* The season in progress is deliberately absent: it is not
                       history yet, and it has its own home in Explore. Offering
                       it here as well would be the same table in two places
                       with two different framings, which is how a reader ends
                       up unsure which one is authoritative. */
                    options={yearsTo((current ?? new Date().getFullYear()) - 1).map((y) => ({
                      value: y, label: String(y),
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
