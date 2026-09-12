# V108 — The primary source that never served a session

**Version:** V108 (backend only). Built on the V106 baseline
(`663350da46d80544113126a092a982eda14ff5e2`). The abandoned V107–V110 line is not
revived; nothing here is taken from it.

**Symptom reported:** the 2026 Bahrain Grand Prix fails to load on pitwalliq.com
and in the iOS app, for every session.

## Root cause — ours

`backend/app/adapters/openf1_adapter.py`, `_lap_windows`, closed each driver's
last lap window with

```python
end = rows[i + 1][1] if i + 1 < len(rows) else (ds + (dur or 100))
```

`ds` is a `datetime`, `dur` a float: the addition raises `TypeError`
("unsupported operand type(s) for +: 'datetime.datetime' and 'float'"). Every
real session has lap rows with a start time, so **every OpenF1 fetch raised
here**, was logged as `source openf1 failed (error)`, and the source chain fell
through to the F1 live-timing archive and then to Jolpica. The line dates from
V50 and is unchanged through V105 and V106: the documented primary source for
2023+ never served a single session. Nothing exercised `fetch_session` with a
lap table, because every fixture either had no laps or no `date_start`.

The product kept working — degraded — because the fallbacks covered for the
primary. Bahrain 2026 is the weekend where they could not: with OpenF1 dead by
construction, the request depended entirely on the archive and Jolpica, and
whichever of those had nothing for Bahrain left nothing to fall back from. What
each fallback answered for Bahrain in production is recorded by the diagnostic
script shipped with the bundle (`pitwall-diagnose.sh`); it could not be observed
from the build environment, whose egress policy blocks pitwalliq.com, the Render
backend and every provider host.

## Fix

Five small changes, all in the backend, no schema change, no GP-specific code.

1. **`openf1_adapter._lap_windows`** — the window closes with
   `ds + timedelta(seconds=dur or 100)`. This alone restores OpenF1 as the
   primary for every 2023+ session.
2. **`openf1_adapter._timeseries_to_lap(..., carry=True)` for positions** —
   OpenF1 publishes the initial placement and every change; a car that held P4
   for thirty laps has one sample. The last known position now carries across
   the laps it was held, so the primary's trace has one point per completed lap
   per car (as the archive's already did). Gaps are measurements and are not
   carried. Without this, a client that reads "absent from the trace" as
   "retired" would have shown mass retirements the moment the primary came back.
3. **`jolpica_adapter._resolve_round`** — the word-score fallback only accepts
   a round that answers the request (every identifying word of the name appears
   in the round's description, accents folded). Before, "Bahrain Grand Prix in
   Malaysia" — OpenF1's placeholder meeting — scored one word on April's Bahrain
   and was served April's laps and classification under October's name.
4. **`jolpica_adapter.fetch_session`** refuses practice, sprint and sprint
   qualifying: Jolpica publishes the Grand Prix's results and qualifying only,
   and was serving the race classification under a "Practice 1" or "Sprint"
   title whenever the primary had nothing.
5. **`data_source_manager._merge_missing_facets`** fills from Jolpica for races
   only, so a hollow sprint cannot inherit the Grand Prix's laps.

## Scope

Every session of every 2023+ weekend is served by OpenF1 again, in both
weekend formats. The wrong-session guards apply to any event name a source does
not carry (placeholders, renamed rounds) and any session type a source cannot
represent. Nothing names Bahrain.

## Tests

- `backend/tests/test_openf1_primary.py` — the exact root cause on
  Bahrain 2026 rows, the carried position, the adapter end to end, the chain
  serving Bahrain from the primary, the API answering every Bahrain session.
- `backend/tests/test_season_matrix_2026.py` — the 2026 season (24 rounds,
  normal and sprint formats, three pre-season tests, the duplicate Bahrain
  placeholder, two rounds in one country) through the real pipeline: every
  session from the primary under its own name; the placeholder never answered
  with another round's data; a Bahrain no source can answer refused with
  `no_source_coverage`, not redirected and not cached; a sprint requested on a
  non-sprint weekend refused; practice never served as the race.
- `backend/tests/world_2026.py` — the provider-shaped season behind both.

Full backend suite: see the bundle README for the run.

## Deployment

Backend only. The frontend, the iOS app and their deployments are unchanged.
See the bundle README for the exact commands.

## Known follow-ups (not in V108, evidence in the bundle README)

- When the merged calendar's name for a round (Jolpica's) differs from OpenF1's
  unique name, the served `grand_prix` label and the cache key follow OpenF1's
  name, so the cache never hits for that round. No 2026 round is known to
  differ; the case is modelled, not observed.
- A Jolpica-served Qualifying is the Grand Prix's classification with Q1/Q2/Q3
  merged in; a qualifying record built from `qualifying.json` would be truer.
- A session whose primary answers a hollow shell is cached for thirty days as
  `complete: false`; the cache heals archive facets only.
- OpenF1's `pit_duration` is pit-lane time and is labelled as the stop; the
  archive's stationary times are more precise for 2025+.
- OpenF1's `full_name` shouts surnames ("Kimi ANTONELLI"); the archive did the
  same, so this is not a regression, but a canonical name would be better.
