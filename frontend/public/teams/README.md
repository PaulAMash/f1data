# Constructor marks

Drop a constructor's mark here as `<slug>.webp` and it appears everywhere at
once — the championship table, the pace boards, the constructor table, the
driver gallery, the focus card and the comparison. There is no registry to
update and no code that enumerates which teams have files: `ConstructorBadge`
resolves the path from the constructor's name, probes it once per session, and
falls back to the drawn shield when there is nothing there.

Run `./scripts/fetch-team-logos.sh` from `frontend/` to populate the current
grid.

## Slugs

The slug is `teamIdentity(name).id` in `src/lib/constructors.ts`. For the 2026
grid:

| Constructor          | File                  |
| -------------------- | --------------------- |
| Mercedes-AMG Petronas| `mercedes.webp`       |
| Scuderia Ferrari     | `ferrari.webp`        |
| McLaren Racing       | `mclaren.webp`        |
| Red Bull Racing      | `red-bull.webp`       |
| Racing Bulls         | `racing-bulls.webp`   |
| Alpine F1 Team       | `alpine.webp`         |
| Haas F1 Team         | `haas.webp`           |
| Audi Revolut F1 Team | `audi.webp`           |
| Williams F1 Team     | `williams.webp`       |
| Aston Martin F1 Team | `aston-martin.webp`   |
| Cadillac Formula 1   | `cadillac.webp`       |

A team whose name changes gets a new slug, which is the point: "Kick Sauber"
and "Audi" are different keys, so a 2024 row can never end up wearing a 2026
badge. Historical seasons need no files and are not meant to have any.

## What the badge does with the file

It reads the mark's natural aspect ratio once and normalises on that, so no
per-asset tuning is needed:

* **Near-square** (0.86–1.16) is treated as a mark that already carries its own
  padding — a roundel, a shield, a composed badge — and is given the whole
  circle, so it aligns with the container rather than floating inside a second
  one. The container's livery wash is dropped, because an opaque roundel hides
  it anyway.
* **Anything else** is a bare emblem or wordmark, and is fitted so its longest
  edge occupies 74% of the badge. Equal longest edges is what the eye reads as
  equal size; `object-fit: contain` on its own is what makes a wide mark look
  half the size of a square one.

If a mark still reads wrong beside its neighbours — usually baked-in whitespace
— add an entry to `OPTICAL` in `src/lib/constructors.ts`. Judge that at 24px
next to the others, not by looking at the file.

Transparent backgrounds are preferred but not required; both kinds render
correctly. Ship at least 96px on the long edge so the 38px badge stays crisp on
a 2× display.
