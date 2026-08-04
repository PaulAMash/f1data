# Constructor marks

Drop a constructor's mark here as `<slug>.webp` and it appears everywhere at
once — the championship table, the pace boards, the constructor table, the
driver gallery, the focus card and the comparison. There is no registry to
update and no code that enumerates which teams have files: `ConstructorBadge`
resolves the path from the constructor's name, measures the file once per
session, and falls back to the drawn shield when there is nothing there.

Run `node scripts/check-team-logos.mjs` from `frontend/` to see which marks are
present, how large they are, and how the badge will treat each one.

## Slugs

The slug is `teamIdentity(name).id` in `src/lib/constructors.ts`.

| Constructor          | File                  | Shipped |
| -------------------- | --------------------- | ------- |
| Mercedes-AMG Petronas| `mercedes.webp`       | V71     |
| Scuderia Ferrari     | `ferrari.webp`        | V71     |
| McLaren Racing       | `mclaren.webp`        | V71     |
| Red Bull Racing      | `red-bull.webp`       | V71     |
| Racing Bulls         | `racing-bulls.webp`   | V71     |
| Alpine F1 Team       | `alpine.webp`         | V72     |
| Haas F1 Team         | `haas.webp`           | V72     |
| Audi Revolut F1 Team | `audi.webp`           | V72     |
| Williams F1 Team     | `williams.webp`       | V72     |
| Aston Martin F1 Team | `aston-martin.webp`   | V72     |
| Cadillac Formula 1   | `cadillac.webp`       | —       |

A team whose name changes gets a new slug, which is the point: "Kick Sauber"
and "Audi" are different keys, so a 2024 row can never end up wearing a 2026
badge. Historical seasons need no files and are not meant to have any.

## What the badge does with the file

It draws the mark to an offscreen canvas once and measures three things. None
of it is configured per team.

**Coverage** — the opaque fraction — decides what kind of asset this is. Below
70% it is a bare mark: it gets padding and a field of the team's colour behind
it. At or above 70% it is a composed roundel that already carries its own
background, so it is rendered full-bleed with only a hairline, and no field is
added. (A circle inscribed in its square covers π/4 ≈ 78%; the marks shipped so
far cover 17–41%, so the threshold sits in open space between the two cases.)

**Ink** — the mean luminance of the mark — decides how far that field is taken.
A white mark is dropped onto a deep version of the livery and a dark mark is
lifted onto a pale one, each landing at roughly 5:1 contrast. This is why
Mercedes' luminous petronas green becomes a deep green behind its white star
rather than white-on-near-white, and why the field does not change between light
and dark mode: the mark's ink does not change either.

**Aspect ratio** decides the fit. A near-square mark is fitted to 74% of the
badge; a thinner one is allowed up to 92% as it thins, because a circle has more
room along its diameter than the inscribed square does. Equal longest edges is
what the eye reads as equal size — `object-fit: contain` on its own leaves a
wide mark looking half the size of a square one.

If a mark still reads wrong beside its neighbours — usually baked-in whitespace
— add an entry to `OPTICAL` in `src/lib/constructors.ts`. Judge that at 24px
next to the others, not by looking at the file.

## Supplying assets

* **Transparent background preferred.** The badge supplies the team colour; a
  mark that ships its own opaque background will be detected as composed and
  rendered as-is, which is also correct but gives up the consistent field.
* **At least 96px on the longest edge.** The largest badge in the product is
  38px, which is 76 device pixels on a 2× display; every mark shipped so far is
  48px and softens slightly there. They are crisp at 27px and below, which is
  every table row. Fine linework suffers most — the Aston Martin wings resolve
  to about 1% opaque coverage at 48px, which reads correctly but has nothing
  left to give.
* **Square canvas, mark centred, no padding of its own.** The badge does the
  padding, and baked-in whitespace makes a mark read smaller than its
  neighbours.
