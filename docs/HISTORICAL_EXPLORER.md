# Historical Data Explorer

The `/history` page's Historical Data Explorer lets you pick a **year → Grand Prix →
session** and see real results, 1950–present.

## Data source & honesty

Broad historical coverage comes from **Jolpica/Ergast**:

| Session | Availability |
|---|---|
| Race | ✅ results (position, driver, constructor, time/gap, laps, grid, points, status, fastest lap) |
| Qualifying | ✅ classification with Q1/Q2/Q3 where available |
| Sprint | ✅ where the event had a sprint (2021+) |
| Practice 1/2/3 | ❌ not carried by Jolpica/Ergast → shown as an honest "not available" state |

The Explorer **never fabricates** data. If a session type isn't available from the
source, or the source is unreachable, it says so and offers a retry — it does not fall
back to fake rows.

## Endpoints

```
GET /api/historical/seasons                              → [{year, events}]
GET /api/historical/events?year=YYYY                     → [{name, round, ...}]
GET /api/historical/sessions?year=YYYY&event=NAME        → {available[], unavailable[], note}
GET /api/historical/results?year=YYYY&event=NAME&session=Race
     → {available, rows:[{position, driverCode, driverName, constructorName,
                          time, gap, laps, points, status, grid, fastestLap, sessionBest}],
        source, confidence, note}
GET /api/historical/source-report?year=&event=&session=  → provenance + row count
```

## UI behaviour

- Selectors auto-fetch results on change; a Refresh button re-fetches.
- Loading shows a skeleton; unavailable/empty shows a plain-English note; source
  errors show a retry.
- **Simple mode** shows a clean classification (Pos / Driver / Constructor / Time).
- **Advanced mode** adds laps, grid, points, status, and a source/confidence line.
- On phones the results render as stacked cards instead of a wide table.
