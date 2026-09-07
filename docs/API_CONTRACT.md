# API contract for the website and the iOS app

Both clients read `GET /api/session` (and the landing page reads `/api/featured`).
This is what each shared field means, which fields a client must render rather
than derive, and the guarantees the backend holds (checked by
`backend/tests/test_api_contract.py`). The iOS app's source is not in this
repository; the section at the end lists what its decoding must and must not do.

## Classification (`session.classification[]`)

| Field | Meaning | Guarantee |
|---|---|---|
| `retired` | **The one retirement signal.** True only when a result source classified the car as not finishing (OpenF1 `dnf`/`dns`/`dsq`, an archive status that is not Finished / +N Lap). | Always present, always a boolean. Never derived from a trace, a missing lap, or a missing packet. |
| `status` | `Finished`, `+1 Lap`, `DNF`, `DSQ`, … from the result source; `Provisional` while no result source has classified the row. | Never empty. `Provisional` is not a retirement. |
| `position` | Classified position. | `null` if and only if `retired` is true. |
| `laps_completed` | The result source's lap count; when it gave none, the number of lap rows with a lap time. A retirement's retirement lap. | Integer or `null`. |
| `grid` | Starting position; `0` is a pit-lane start. | Integer or `null` (unknown). Never guessed. |
| `gap` | `"+3.857s"`, `"+1 Lap"`, `null` for the winner and for retirements. | One format from every source. |
| `points`, `race_time`, `retirement_reason` | From a result source. | `null` when no source stated them. |
| `pit_stops` | Stops from the stint feed (a stint change under a red flag is not a stop) or the pit-entry list. | `0` with `session.pit_data_reliable: false` when unknown — treat as unknown, not zero. |

## Position trace (`session.positions[]`, `session.laps[].position`)

One point per car per **completed** lap: the position at the end of that lap.
OpenF1 publishes position changes only; the backend carries the state across
the laps it held. A car has no point for a lap it did not complete, so a
retirement's trace ends at `laps_completed` and a lapped car's ends at its own
lap count.

**A car's absence from the trace at lap N means it had not completed lap N. It
does not mean it retired.** Retirement is `classification[].retired`.

## Race facts (`strategy.facts`)

Computed once. Render them; do not recount.

| Field | Meaning |
|---|---|
| `settled`, `awaiting` | Whether the classification is official; official fields still owed by a source. |
| `entries`, `finishers`, `retirements` | `finishers`/`retirements` are `null` until `settled`. |
| `winner`, `winner_name`, `winner_grid`, `runner_up` | `winner_grid` `null` when unknown. |
| `margin`, `margin_s` | The runner-up's official gap; `null` until settled. |
| `fastest_lap`, `fastest_lap_driver` | Quickest racing lap in the lap table (not the FIA award). |
| `best_pace_driver`, `best_pace`, `best_pace_gap`, `best_pace_gap_to` | Corrected clean-air pace and its gap to the next ranked car, rounded once. |
| `neutralizations` | `{safety_cars, virtual_safety_cars, red_flags, total, local_yellows, source}`. |
| `pit_data_reliable`, `race_distance_laps` | |

`pace[].gap_to_best` is the same rounded-once value per driver (`0.0` for the
fastest, `null` for unranked).

## Neutralisations (`session.track_status_windows[]`)

| Field | Meaning |
|---|---|
| `status` | `SAFETY_CAR`, `VSC`, `RED` — three events, never one for another. |
| `start_lap`, `end_lap`, `end_known` | From the deployment and ending lines (or the archive's status codes). `end_known: false` means no ending line was published. |
| `source`, `confidence` | `race_control` / `track_status` / `mock`; `medium` when a boundary lap was carried from the previous line. |
| `cause`, `cause_source`, `cause_message` | Only when the deployment line states a cause. Usually `null`. |
| `incidents[]` | `{lap, kind, drivers, message, source}` — lines race control logged in the window's laps, with the cars the line named. **Not the cause.** Render as "logged alongside". |

## Source report (`session.source_report`)

`settled`, `provisional[]`, `awaiting[]`, `conflicts[]` (two official sources
disagreeing on a position — nothing position-dependent was merged), `facets[]`
with `source` and `provisional` per facet.

## What a client must not do

- Derive DNF from the trace, from a missing lap, from a missing status, or
  from `status` text when `retired` is present.
- Count finishers or retirements itself; subtract paces itself; count windows
  itself for the headline figures. Render `facts`.
- Derive windows from per-lap `track_status`; the backend already did, from
  evidence it names.
- Turn a `null` into `0`, `false` or a default enum. `null` is unknown.
- Present `incidents` as the cause of a window.
- Change the case of a name or derive a surname from a display string.

## For the iOS app specifically

The mass-DNF chart came from two things together: the backend's trace was
sparse (fixed in V110), and the chart marked any car absent from the trace at
the selected lap as DNF. The second must change in the app: mark a car DNF
only when `classification[].retired` is true, and show a car absent from lap N
as "not yet at lap N" (a lapped car) or simply omit it. Decode `status` as a
string, `retired` as a non-optional Bool, `grid` and `laps_completed` as
optional Int, `facts` as an optional object, and never map a missing value to
`.dnf`.
