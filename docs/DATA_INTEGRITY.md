# Data integrity

Pitwall IQ is a data product. A missing value is acceptable; an incorrect value
presented as a fact is not. This document records the audit that V109 performed
on the shared pipeline, the rules that came out of it, and where the remaining
uncertainty lives. It is the reference for anyone adding a source, a
derivation, or a sentence.

## The principle

Every value the backend exposes is one of five things, and the code must never
silently promote one into another:

| State | Meaning |
|---|---|
| **Authoritative** | Stated by a trustworthy source, or a deterministic calculation over authoritative inputs. |
| **Derived** | Computed deterministically from authoritative inputs (a gap in seconds from a gap string; a window from status codes). |
| **Provisional** | Present, but the sources have not settled the final fact (a running order before the classification is published). |
| **Unknown** | The sources do not establish it. Represented as `None`, never as zero, `false`, "Finished" or a guess. |
| **Conflicting** | Two authoritative sources disagree and the system cannot safely reconcile. Recorded in `SourceReport.conflicts`; nothing position-dependent is merged. |

Forbidden promotions: unknown → guessed, provisional → final, conflicting →
arbitrary winner, inferred → authoritative, missing → zero / false /
"Finished", weak proxy → definitive event, temporal proximity → cause.

## The pipeline, and where a fact can go wrong

```
provider → adapter → DataSourceManager (merge, reconcile, audit) → cache
        → offline finalizer (every read) → analysis (normalize, pace, strategy, facts)
        → API → website / iOS
```

The audit walked every stage for places that **create, transform, infer, merge,
overwrite, default, format, cache or recalculate** a value. Findings, with the
rule that closed each:

### Neutralisations (Safety Car / VSC / red flag) — the V109 headline

| Was | Now |
|---|---|
| Any race-control line containing "SAFETY CAR" opened a window — a stewards' "5 SECOND TIME PENALTY - SAFETY CAR INFRINGEMENT" deployed one. | A window opens only on the FIA's own deployment line, recognised by its exact form anchored at the start of the line (`SAFETY CAR DEPLOYED`, `VIRTUAL SAFETY CAR DEPLOYED`), and closes only on its own ending line (`… IN THIS LAP`, `… ENDING`). A car event or a DRS notice can never be a status. |
| Any line containing "CLEAR" closed every open window — a sector clear ended a Safety Car on its first lap ("Safety Car L3–3"). | A sector clear clears a sector. Only a track-scoped green/clear, a restart line or a Safety Car deployment resumes a stoppage. |
| Red flags were not windows at all; the restart Safety Car read as a second, unexplained Safety Car. | `RED` is its own window, opened by the red flag line, closing whatever was out; the restart Safety Car closes it. |
| The cause was the best incident-shaped line within three laps of the window's first lap, attached to every window it was near; failing that, the one car that retired around then. | **The event is not the cause.** `cause` is set only when the deployment line itself states one (`cause_source`, `cause_message` carry the evidence). Incident lines logged from the lap before the window to its last lap are attached as `incidents`, with the cars exactly as the FIA named them, and every sentence says they were *logged in these laps* and that the feed *does not state what triggered it*. A retirement in a window is a retirement in a window. |
| The website re-derived windows from per-lap status codes and merged them with the backend's list, most-severe-wins — a second inference in the browser. | Windows are built once, in `analysis/neutralizations.py`, and every client draws that list. The per-lap status the pace model reads is stamped *from* the windows for a source with no codes of its own (OpenF1), and read *as evidence* only for a source that codes its laps (the archive). |
| Windows were built once by the adapter and frozen in the cache. | Rebuilt from the session's own log and coded laps on every read (`_derive_neutralizations` in the offline finalizer), so a record cached with wrongly paired windows is right on its next read and written back once. |

Every window carries `source` (`race_control`, `track_status`, `mock`),
`confidence` (`medium` when a boundary lap had to be carried from the previous
line), and `end_known` (`false` when no ending line closed it; it then runs to
the last lap the log knows and the sentence says so).

**Cars slowing down is never a neutralisation.** Nothing in the pipeline infers
a Safety Car, VSC or red flag from lap times, gaps or positions.

### The position trace, laps and retirements — the V110 headline

| Was | Now |
|---|---|
| OpenF1's `position` feed publishes a car's initial placement and then a row only when its position changes. The adapter mapped each row to the lap it fell in and never carried the state forward, so a car holding station had no position for those laps. The website's line ended where the car last moved; the app read a car absent from a lap as retired on it — nineteen classified finishers rendered as DNF. | A position is a state: the adapter carries the last published position across every later lap the car completed (`_timeseries_to_lap(carry=True)`), and the offline finalizer does the same for cached records (`normalize.densify_positions`), so the trace has one point per car per completed lap and none beyond it. A gap is a measurement and is never carried. |
| The V107/V108/V109 fixture emitted a position row per car per lap, so the sparsity never reached a test. | The fixture publishes changes only, like the feed. |
| "Laps completed", when no result source stated it, was the highest lap number in the lap or position data — including the partial row the feed publishes for the lap a car stopped on. | Derived only from lap rows with a lap time. The official count, when stated, is never overridden. |
| The static archive route labelled every car the timing frame did not flag as retired "Finished". | `Provisional`; the frame's `Retired` flag stands. |
| A SafetyCar-category line this parser could not read vanished silently. | Reported on the session's notes and in the log, so a form not modelled here shows up on the first session that carries it. |

Lap semantics, one meaning per word (also in `analysis/normalize.py`):

- a **lap row** is a lap the feed published; the lap a car stopped on appears as a row with no lap time;
- a **completed lap** is a lap row with a lap time;
- `laps_completed` is the official count when stated, the completed-lap count otherwise; a retirement's is its retirement lap;
- a **position point** is where the car was at the end of a completed lap; a car has none for a lap it did not complete;
- the **race distance** is the leader's lap count.

**Retirement is decided by a result source and nothing else.** Not by the trace ending, not by a missing lap, not by a missing packet, not by a missing status. Until a result source has classified a row its status is `Provisional` and `retired` is false; the clients read `retired` and only `retired` (`docs/API_CONTRACT.md`).

### Pit stops

| Was | Now |
|---|---|
| OpenF1 `pit_duration` and Ergast `duration` (pit entry to exit) were written as the stop duration and drawn as stationary time. | Lane time is `pit_lane_time`; the stationary estimate derived from it is labelled; the best-stop card carries `lane_s` for a lane measure. (V108) |
| A twenty-minute stay under a red flag averaged into "pit loss" (1,298 s). | A lane duration beyond 180 s is a stoppage: kept as an entry, excluded from every cost. (V108) |
| A tyre change under a red flag added a stint and was counted as a stop. | A stint that begins inside a red-flag window or at its restart is not a stop; a pit-lane entry inside a red-flag window is dropped from the stop list. |
| `under_vsc` / `under_safety_car` were set only by the simulator; real sessions never had them. | Stamped from the canonical windows on every read, so the cheap-stop analysis and the app read one answer. |
| A session with no stint feed and no pit feed reported zero stops per car. | `pit_data_reliable=false`, stop counts are not claimed in any sentence, `facts.pit_data_reliable` says so. |

### Classification

| Was | Now |
|---|---|
| `ClassificationRow.status` defaulted to `"Finished"`; FastF1 and Jolpica mapped an empty status to "Finished". | The default is `"Provisional"`; an empty archive status is a row nobody classified, and `classification_is_official` treats it as such. |
| A non-empty classification list was "the result". | Present is not official (V107): a running order is flagged provisional, recognised by shape for old caches, reconciled from whichever source publishes the official record. |
| The settling source's fields were the record; a field it never carried (grid, classified time, retirement reason) stayed empty. | Field-level completion from any other source (`_fill_official_fields`), never overwriting, with `SourceReport.awaiting` naming what is still owed and driving re-checks on the upstream cadence. (V108) |
| A second source's gap/points were merged regardless of whether it agreed on the position. | Gap and points are taken only when both sources agree on the position; a disagreement is written to `SourceReport.conflicts` and shown in the sources panel. |
| Blanks: `None`, `""`, `NaN`, `NaT`, `0`. | `None`/`""`/`NaN`/`NaT` are absences and never overwrite; `0` is a value (a pit-lane start is grid 0). |

### Driver identity

One canonical display name per driver, built from the provider's own parts
(`first_name` + `last_name`) and re-cased where only a shouted `full_name`
exists (`canonical_name`); no surface derives a surname by taking the last word
of a provider string, and no client changes case. The code (TLA) is the
identity key across sources; a name is never used as one except as a last
resort in the headshot lookup, which cannot corrupt a record.

### Text layer

Every generated sentence is checked against this rule: **it may state a field
the record holds, and it may not fill a gap with a heuristic.**

- The winner sentence: `from P19` from the grid, `from pole` for 1, `from the
  pit lane` for 0, nothing when unknown. Never "P?", never "from pole" for
  `None`. (V108)
- Turning points: the event, then what the log holds, then no more; a red flag
  is "Race stopped"; a window with an unpublished end says so.
- The Ask engine ties a neutralisation to a driver only when race control did
  (`cause`); an incident line naming them is reported as logged.
- Qualifying interruptions: `cause` from the red-flag line itself; a nearby
  incident is `logged`, and the website says "the red-flag line itself does
  not say why".
- Strategy verdicts ("a 4-place strategy gain") compare pace rank to finish;
  they are labelled as Pitwall IQ's own reading, not as fact about intent.

### Calculations — one implementation

`analysis/facts.py` computes the race-level numbers once: winner, grid, runner-up,
margin (string and seconds), entries, finishers, retirements, fastest racing
lap, best corrected pace and its gap to the next car, neutralisation counts
(including local yellows), race distance, pit-data reliability. Each is `None`
when the record cannot establish it — finishers and retirements only once the
classification is official. `DriverPaceSummary.gap_to_best` is rounded once in
the backend. The website reads `strategy.facts` and `gap_to_best`; the landing
page's `/api/featured` reads the same facts. The 0.461 / 0.462 disagreement
was the website subtracting two already-rounded paces in the browser and the
app doing its own arithmetic.

Still computed in the website, deliberately: presentation-only formatting
(`fmtGap`, lap time formatting), penalty badges parsed from the race-control
log (each badge links to the line it came from, and no domain fact depends on
it), and the "decisive mechanism" cards, which are labelled detections over
the session's own stops and positions. The iOS app should read the same
`facts`, `gap_to_best`, `track_status_windows` (with `incidents`) and
`awaiting` fields; it needs no logic of its own for any of them.

### Cache

- Names, grids, gaps, pit-stop semantics, windows, lap statuses and pit-stop
  neutralisation flags are re-derived offline on every read, so a record cached
  by an older build is right on its next read; the file is written back once
  when the identity (names, grids, windows) or readiness changed.
- Unsettled records and settled records still owed a field are re-asked on the
  upstream cadence, for exactly what they are owed, and touched when nothing
  was gained.
- No global TTL was reduced. `CACHE_VERSION` did not need bumping: every new
  field has a default and every derivation is recomputed on read.

## Provenance table

| Fact | Authoritative source | Fallback | Notes |
|---|---|---|---|
| Entry list, names | OpenF1 `drivers` (first/last name), archive `DriverList`, Jolpica `Driver` | classification rows | canonical case applied on read |
| Final positions, status, retirement, gap, points, laps | OpenF1 `session_result`; FastF1 results; Jolpica results | provisional running order until one publishes | reconciled field by field; positions from the settling source |
| Starting grid | OpenF1 `starting_grid`; FastF1 `GridPosition`; Jolpica `grid` | — | filled from any source that has it; `awaiting: grid` until one does |
| Classified race time | Jolpica `Time.millis`; FastF1 `Time` | — | lead-lap finishers only |
| Retirement reason | Jolpica status; FastF1 Status | — | never inferred from the log |
| Laps, positions | OpenF1 `laps` + `position`; FastF1 laps; Jolpica laps (1996+) | — | positions rebuilt from laps if the feed is absent |
| Neutralisation windows | FIA race-control deployment/ending lines; archive per-lap status codes | — | never lap times; `source` on every window |
| Incidents | FIA race-control lines, participants as named | — | never a cause unless the deployment line states it |
| Pit-lane time | OpenF1 `pit_duration`; Jolpica `duration`; archive `PitLaneTime` | — | > 180 s is a stoppage, not a cost |
| Stationary time | archive `PitStopTime` (2025+) | labelled estimate from lane time | never the lane time |
| Weather, race control, stints | OpenF1; archive | — | absence explained, never gating |
| Race facts | computed once from the above | — | `None` when not establishable |

## Session types and what "settled" needs

| Type | Essential | Settled when |
|---|---|---|
| Race, Sprint | results, drivers, laps | the classification carries a field only a result has (gap / time / points / retirement / non-default status) and no essential facet is provisional |
| Qualifying, Sprint Qualifying | results, drivers | the results facet is not provisional (the adapter's own word; a running order without times is flagged) |
| Practice | drivers | nothing to settle; complete when the entry list exists |

Rows, positions, HTTP 200 and "some analysis ran" are none of these.

## Remaining uncertainties

Stated so nobody mistakes the pipeline's silence for certainty:

- **Why a neutralisation happened.** The FIA log almost never states it. The
  record lists what was logged in those laps; it does not say which line was
  the trigger, and neither does Pitwall IQ. A user who wants the cause gets the
  incidents and the words "the feed does not state what triggered it".
- **Red-flag windows from OpenF1.** The resumption is inferred from the first
  later line that resumes the session (a track-scoped green/clear, a restart
  line, or a Safety Car deployment). A log with none of those closes the
  stoppage at its last known lap with `end_known: false`.
- **Lines without a lap number.** The FIA feed is chronological; a line
  without a lap is placed on the lap of the line before it and the window is
  marked `confidence: medium`. A log whose first lines carry no lap places
  nothing.
- **The official fastest-lap award** is not published by any configured
  source; `facts.fastest_lap` is the quickest racing lap in the lap table and
  is labelled as that.
- **Pit stop counts without a stint feed** come from the pit-entry list; with
  neither, they are unknown and not claimed.
- **Real-provider verification.** The providers are unreachable from the
  environment this was built in. Every rule is verified against fixtures shaped
  like the providers' documented responses and against the V107-era record;
  the first live session after deployment is the first real exercise of the
  OpenF1 race-control path and should be checked against the FIA's own log.
