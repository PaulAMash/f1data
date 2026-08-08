# Pitwall IQ — UX review

A standing critique of the product as a whole, kept in one place and updated per release
rather than forked per version. Findings are ordered by how much they cost the reader.

Last pass: **V80**. The derivations finally run on every path a session can arrive by, the
event band measures the whole column rather than the chip in it, and the results table
stops printing "P14→P14 —" to say that nothing happened.

---

## Fixed in V80

### 1. The charts were blank because the entry list was — *the root cause*

Localhost worked and production did not, and the screenshot said why before any code was
read: the event markers were there, the legend was there, and the plot between them was
empty. That combination is only reachable one way. `session.positions` must be **non-empty**
(or the chart would have taken its early return and shown a message instead), while
`session.drivers` must be **empty** — because every series in that chart is built by walking
`drivers`. An empty entry list produces zero `<Line>` elements and collapses the Y axis to a
domain of `[1, 0]`, which is a full set of chart chrome around nothing at all. The
classification table beside it was unaffected for the same reason it was in V79: those rows
carry their own names and colours and never consult the entry list.

So the question was never "why does recharts fail in production". It was "why does a session
reach the browser with no entry list", and the answer is the one V79 half-fixed. There are
three ways a session can arrive — a fresh fetch, the demo simulator, and the **cache** — and
the derivations only ever ran on the first. V79 fixed the demo path and did not look at the
cache. A cached session is a session that skipped the pipeline: the entry list, the position
trace, FIA order and the audit verdict are all computed on the way *in* and frozen into the
file, and on the way back out none of them run again. Locally that is invisible, because a
laptop's cache is minutes old and was written by the code you are running. In production the
cache long outlives the deploy that filled it, so an entry written before a fix keeps that
bug for as long as the entry lives — a month here.

Re-deriving on read costs nothing (no network, no provider knowledge) and makes every fix
retroactive: the next read of a stale entry heals it. The frontend now carries the same
guarantee independently (`lib/sessionShape`), rebuilding the entry list from the
classification, then from the trace, before any panel sees the session — because the browser
is served a payload it did not compute, by a deployment it does not control, possibly from a
cache older than either, and a facet fifteen call sites depend on should not be assumed at
each of them. Verified by stripping `drivers` at the API boundary and confirming all 16
position lines still render in their correct team colours.

### 2. The event band measured the chip and the column is not the chip

V78 packed the chips, V79 lifted the hover cards clear, and the markers still touched —
because a column is the chips for that lap **plus the "L57" caption underneath naming it**.
The caption is the bottom of the column and nothing had ever measured it, so a column lifted
onto row 1 hung its caption straight down into row 0's chip. That is precisely the Red Flag
sitting on the Safety Car's lap number in the report, and chip-to-chip was provably clear the
whole time, which is why two releases of chip measurements never found it.

The row step is now derived from the tallest column actually being drawn — chips, stack gaps,
caption and clearance — rather than typed as a constant. That also fixes a case no constant
could: several events on the *same* lap stack inside one column, making it taller than any
number chosen in advance. The check was widened to match: it now measures every element in
the band, captions included, instead of only the chips.

### 3. The classification printed data where it should have made a point

`P14→P14 —` spends three tokens and an arrow to say that nothing happened, and the arrow is
the loudest glyph in the cell while pointing at a number identical to the one it came from. A
row where nothing happened should be the quietest row in the column. Meanwhile, where
something *did* happen, "up eight" — the only interesting figure — was the smallest and
faintest part of the cell, ranked below the two positions it was derived from.

One rule now, in one shared component: **the delta is the story, the two positions are the
evidence.** A change leads with the signed number in the colour of its direction and keeps
`P17→P9` behind it as quiet support. No change prints the position once with a neutral hold
mark and nothing else. The gainers/losers cards already worked this way and now match it
exactly.

`DRIVE-THRU` was neither the penalty's name nor the sport's abbreviation for it — a
hyphenated truncation invented for the badge, which is what made it read as raw data. Timing
screens have had conventions for this for fifty years, so the badges use them: `DT`, `SG`,
`DSQ`, `+5s`. Each kind also gets its own mark rather than one gavel on all eight, so a badge
can be recognised before it is read, which is the entire point of a badge in a dense table.
The full official wording still lives one hover away, unchanged.

---

## Fixed in V79

### 1. Every line chart in the product drew nothing — *the root cause*

The Position Chart plots `session.positions`, and so does everything derived from it. That
facet was only ever set by whichever adapter happened to supply it, plus one opportunistic
top-up from Jolpica. Nothing guaranteed it, and — the part that made it invisible — it is
not one of the essential facets the V78 gate checks. So a session with no position feed
passed as **complete**, rendered in full, and drew axes, gridlines and neutralisation bands
over an empty plot. Bar charts and tables were fine throughout, because they come from the
classification, which is essential and therefore guaranteed. A chart with no line looks
exactly like a chart that broke, and there was nothing on the page to say which it was.

It never needed a source. `Lap.position` already carries where each car was at the end of
each lap, and the lap table **is** essential — the gate guarantees it for every race and
sprint. The trace is now rebuilt from data already in hand, at no network cost, marked
`derived` so the Sources panel says where it came from. Measured on the demo race with the
position feed removed: 0 points before, 1,106 after. It also fixed a cascade nobody had
noticed — overtake inference needs a trace to work over, so a missing position feed had
been quietly reporting races in which nobody passed anybody. Same race: 0 overtakes before,
58 after.

Two things made this a production-only bug, and both are now closed:

* **The demo path skipped the pipeline it stands in for.** Mock sessions returned straight
  from the simulator — no derivations, no ordering, no audit. The simulator populates every
  facet, so demo mode could not exercise the case where one is missing. The offline half of
  post-processing is now shared by both paths, so a gap in the real pipeline shows up in the
  demo one too.
* **The remaining thin case now says so.** When no position exists anywhere, the chart names
  the hole instead of drawing an empty grid. The guard that used to cover this told every
  session the same thing — "practice and qualifying have no lap-by-lap running order" —
  which is true for practice and simply false for a Grand Prix. A wrong reason is worse than
  no reason: it sends the reader, and anyone debugging it, somewhere else entirely.

### 2. The API shipped 380 KB uncompressed

No compression middleware, on a payload whose lap table is 83% of the bytes and is the most
compressible thing here — the same driver codes and compounds a thousand times over. Gzip
takes the demo race from **383,757 bytes to 33,325**, an 11.5x reduction, for one line.

It survived this long because it costs nothing where it was tested. Over loopback a third of
a megabyte is free; between a browser and a hosted API it is seconds, and the frontend talks
to the API host directly rather than through the CDN, so nothing upstream was compressing it
either. Two further round trips went with it:

* **A finished Grand Prix will never change, and was being re-fetched anyway.** Sessions now
  carry `Cache-Control` — a day for a season that is history, five minutes for the one being
  raced. The frontend was sending `cache: "no-store"` on *every* call, which made the
  server's opinion irrelevant and re-downloaded a 2024 race on every tab change and every
  Back. Explicit refresh still bypasses everything, because Re-run carries a different URL.
* **A link that names the race no longer asks which race is on.** `current()` gated the
  session fetch, so every arrival paid two sequential round trips before the expensive one
  started — one of them to be told what the URL already said.

Worth being straight about the part that is not code: on Render's free tier the instance
spins down when idle, and the first request after that pays a cold start of 50 seconds or
more. That will dominate every measurement here until the plan changes, and no amount of
payload work will hide it. The ephemeral filesystem compounds it — the cache is wiped on
every deploy, so the first visitor after a release also pays a full uncached fetch of every
upstream source.

### 3. The event markers were packed; their hover cards were not

V78 packed the chips so they can never overlap, and stopped at the chips. Each one owns a
208px card — three times the width of anything the packer was measuring — and none of it was
measured by anything. Hovering the Safety Car put a card straight over the Red Flag you were
comparing it against, and a marker in the closing laps opened a card that hung off the end
of the chart with its text cut in half.

A card is not a chip and the fix exploits the difference. A chip's position is data: it has
to sit at its lap or it is lying, so chips are still never moved. A card is transient
explanation, so it moves — up past every row in the band rather than just its own, and
clamped inside the plot instead of centred come what may.

Underneath that was a third bug the eye could not have found. Packing keeps the *chips*
apart, but each chip sits in a full-height column box as wide as its widest child, and those
boxes still overlap when two events are close. The box painted last takes the pointer — so
below about 1100px the Safety Car and the Red Flag stopped responding to hover entirely,
with nothing on screen to explain why. Their cards were unreachable, which is a worse
failure than an ugly one. Nothing in a column is interactive except the chip, so the column
no longer takes the pointer.

Asserted, not eyeballed, across 1440/1100/900/700/560px in both modes: zero chip overlaps,
zero unreachable chips, zero cards covering a chip, zero cards leaving the plot.

---

## Fixed in V78

### 1. A fixed forgiveness list was making the gate race-specific — *the root cause*

V77 declared overtakes, the race-control log and pit stops the three facets whose true
value can be zero, and used that same list to decide whether a session gates. That
conflated two different questions. Whether a zero count is legitimate is a property of the
specific race — Monaco with no overtakes, a race with a genuinely uneventful race-control
log — not a property of the facet. A list broad enough to forgive Monaco's silence also
forgave Miami's, and a list narrow enough to catch a genuinely broken feed on one facet
caught a genuinely empty one on another. Each fix for one race was, by construction, a
regression for whichever race relied on the opposite reading of the same facet — which is
why Monaco and Miami kept trading places across releases instead of both staying fixed.

`complete` now follows only `essential_missing` — results, the entry list, and lap times
for a race or sprint, the facets a session cannot be reconstructed without.
`_MAY_BE_EMPTY` still exists and still governs the *wording* a facet gets in `missing`
("answered, zero" versus "never answered"), but it no longer has any say over whether the
page renders. Two tests prove the two things that used to trade off against each other now
hold simultaneously: `test_monaco_and_miami_are_both_complete_at_once` builds a
Monaco-shaped session (empty overtakes) and a Miami-shaped session (empty race control,
empty pit stops) side by side and asserts both `.complete` in the same test, and
`test_widening_or_narrowing_may_be_empty_cannot_change_the_gate` mutates `_MAY_BE_EMPTY` —
empty, one facet, three facets — and asserts `complete` never moves. Verified in the
running app too: the mock session renders in full with nothing gated, and a session with no
route to any data source still gets the unavailable screen, naming the essential facets
that never arrived.

### 2. Event markers on the Position Chart used a lap-count threshold to solve a pixel problem

Two markers were called "near" each other if they landed within 6% of the race distance,
and near markers alternated between exactly two rows. Both halves were wrong the moment
three race-control events landed close together — an ordinary safety-car-into-red-flag
sequence, not an edge case. A lap-count threshold has no relationship to where a lap
actually renders (`lapToX` does), so two events distant enough to count as "far" by the
percentage could still land closer on screen than one chip is wide; and two rows is a
constant while how many events can cluster is not, so a third close event landed back on
the first event's row and sat directly on top of it.

The band now measures instead of guessing: each column gets its actual pixel footprint from
`lapToX` and the widest chip it holds, and a classic interval-scheduling greedy places each
column in the first row whose previous occupant it clears, opening a new row only when
every row already in use is still occupied at that x. There is no row ceiling — four events
inside ten laps spread across four rows rather than collapsing two onto each other. A
second, smaller bug turned up under pixel measurement rather than a screenshot: the row
step was 22px, and a rendered chip is taller than that (about 22.5px in advanced mode), so
two stacked rows touched by half a pixel regardless of how cleanly they cleared
horizontally. The step is now sized to the chip it actually has to clear in each mode, not
a number that happened to look right at one width.

---

## Fixed in V77

### 1. The gate was in the tree, not above it — *the root cause*

V76 put the verdict where the panels are rendered, which made it one more component
deciding for itself. So the header, the season and session pickers, and the tab bar all
rendered *around* a card explaining that the session could not be shown — and the reader
got a tab strip for tabs that would never fill.

A decision that governs the whole page has to be taken before the page. It is taken once
now, above everything, and an incomplete session returns a **different page** rather than a
different panel. Nothing below that line runs, so there is no component left that could
render half of itself.

Asserted rather than eyeballed: with a session marked incomplete, the document contains no
`[data-tour="tabs"]`, no pickers, no `[data-tour="panel"]`, no `<table>`, no chart surface,
and the string "partial" appears nowhere. With a complete session, all of them are back.

### 2. Two facets were being forgiven that should not have been

V76 taught the audit that an answer of "none" is an answer, and listed overtakes, the
race-control log and pit stops as facets whose true value can be zero. Overtakes belongs
there — Monaco genuinely finishes with nobody passed on track. The other two do not: a
modern race always produces race-control messages, and a race in which nobody pitted has
not happened since refuelling ended. An empty one of those is a feed that failed, and
forgiving it is what let a session through holding panels with nothing to draw.

`_MAY_BE_EMPTY` is `{"overtakes"}`. Their era boundaries already cover the seasons that
never recorded them.

### 3. The championship is deliberately outside the gate

Those standings are a property of the season, not of the session, and they remain true when
a session is not. The unavailable page offers them as one of its three ways forward, so a
reader is never stranded by the gate that protected them.

---

## Fixed in V76

### 1. Monaco was holding every fact it needed and being called partial — *the root cause*

V75 fixed Monaco's entry list, and the screenshot proves it: the names are there, the
winner is named, the margin is there. What remained was **overtakes** — and Monaco is the
sport's own example of a Grand Prix where barely a car is passed on track.

`_audit_report` recomputed every facet's presence from `bool(list)`, which threw away the
provenance saying a source had already answered. **An answer of "none" became
indistinguishable from no answer at all.** The overtake derivation ran over a complete
position trace, found nothing, correctly recorded itself as the source — and the audit
overwrote that with `source: "none"` and filed it under missing.

A facet whose true value can be zero — overtakes, the race-control log, pit stops — is
present when something answered for it, whatever the count. Everything else is still empty
only when nothing supplied it. Not a Monaco fix: a street race with no passes, a race with
no safety car and a race nobody pitted in all stop being reported as gaps.

### 2. The gate is strict now — *the product rule*

V75 split facets into essential and enriching and gated on the essential ones, which left a
session missing something real still rendering with a chip on it. `complete` is now simply
`missing == []`.

That is only fair because two rules run before it, and both exist to stop the product
inventing a gap: a feed that had not been invented yet is not missing (the era boundaries —
a 1975 Grand Prix has no lap times and never will), and a question asked and answered
"none" is not missing either. Without those, strict would declare most of the sport
unavailable. With them, everything still listed in `missing` is a real absence.

### 3. "Partial data" no longer exists in the interface

The chip beside the title and the banner above the tabs are both gone, along with the
component behind them. There is nothing left for them to mark: a session the product is not
certain of does not render, and one that does render has nothing to disclaim. A chip saying
"some of this may be wrong" was always the product asking the reader to do its job.

`essential_missing` survives as diagnosis rather than as the gate — the unavailable screen
leads with it, because "the entry list never arrived" is a more useful sentence than
"something is missing", and falls back to naming whatever is genuinely absent.

---

## Fixed in V75

### 1. A Grand Prix rendered as a column of car numbers — *was high, and it was ours*

Monaco showed "12" where "Verstappen" belongs, "?" under every row, and a winner card
reading "12 won the Monaco Grand Prix". The upstream sources were not at fault. **The entry
list was only ever backfilled as a side effect of backfilling the results**: the merge step
filled `drivers` inside `if not session.classification`, so a source that returned results
*without* an entry list left `drivers` empty and nothing else ever looked.

It is a facet in its own right now, with its own step, and the cheap path handles it
completely: every classification row already carries a code, a name, a team and a colour —
which *is* an entry list. Rebuilt from what we hold, at no network cost, and marked
`derived` so the sources panel says where it came from rather than implying a driver feed
answered. Jolpica is asked only for the sessions that have no classification either.

### 2. A finisher sat between two retirements — *was medium, systemic, and not Barcelona's fault*

Albon finished and was listed P18, between DNFs at 17 and 19. Each adapter ordered its own
rows correctly by its own provider's convention — live timing gives a retirement no
position at all; the results archive numbers retirements straight on after the finishers —
and then the enrichment step took the classification from one and the retirement flags from
the other. The order was decided in three places and the merge mixed conventions.

`order_classification` decides it once, after every merge, from the facts on the rows:
classified finishers first in their existing order, then retirements ranked by how far they
got. Finishers are renumbered contiguously — closing the gaps a retirement used to hold, so
the printed position and the row's place agree — and retirements lose their number, which
is what NC means and what the DNF badge beside them already said. Verified in the running
app: 16 rows, every finisher above every retirement.

### 3. "Partial" could not carry the decision it was being asked to make — *was the brief*

One boolean covered both "no weather trace" and "no entry list". So Monaco said partial and
rendered anyway, and Miami — missing its own pieces — said nothing, because what it lacked
was derived rather than a facet. Neither answer told a reader whether to trust the page.

The facets are split by what a session cannot be reconstructed **without**: results, the
entry list, and for a race or sprint its lap times. `essential_missing` is empty or it is
not, and `complete` follows from it. Enriching facets that are absent stay in `missing`,
stay explained in the sources panel, and never gate anything — a 2024 race with no weather
is a complete and trustworthy read of that race. The era rule still wins over both: a 1975
Grand Prix has no lap times and never will, and demanding them would declare half the
sport's history unavailable.

### 4. An incomplete session gets the unavailable screen, not a page with holes in it

A fetch that failed and a fetch that succeeded without the pieces the page is built on are
the same thing to a reader. They were handled in two places and only one of them was
designed. One screen now serves both, and when it is the second case it says which feeds
did not arrive — "the entry list and the lap times never arrived, and a race cannot be read
without them" — rather than a chip that asks the reader to guess how much to believe. It
sits over a slow ambient trace, because a dead panel confirms the suspicion that something
broke and a room still running says the product is fine and the session is not.

### 5. Haas and Cadillac stop sharing a colour

Sampled from the supplied references: Haas `#969c9f`, keeping the cool cast its reference
shows; Cadillac `#7b7b7e`, neutral and materially darker. They had carried a byte-identical
hex, so two teams shared one rail, one bar and one line on every chart.

---

## Fixed in V74

### 1. Two providers, two spellings, two identities — *was the brief, and the root cause*

The championship table showed grey placeholder shields for Racing Bulls, Alpine and
Cadillac while the pace board two tabs away showed all three branded. Nothing was wrong
with the badge. **The two pages were reading different providers, and the providers do not
agree on what a team is called.** A session comes from live timing and says "Racing Bulls",
"Alpine", "Red Bull Racing"; a championship table comes from Jolpica and says "RB F1 Team",
"Alpine F1 Team", "Red Bull".

Every one of those strings keyed its own slug, its own asset lookup and its own colour.
`teamIdentity` even stripped the "F1 Team" suffix — but only to build a fallback code, and
never retried the lookup with it removed. So "Alpine F1 Team" resolved to the slug
`alpine-f1-team`, found no asset, and drew a shield.

A provider's spelling is an input now, never an identity. Resolution runs in order of
confidence: exact name or alias, then with the provider's suffix noise removed, then a
known name found inside a sponsor-laden one. "Oracle Red Bull Racing", "Red Bull",
"RB F1 Team", "MoneyGram Haas F1 Team", "BWT Alpine F1 Team" and "Stake F1 Team Kick
Sauber" all land where they should, and a name nobody has a record for still yields a
usable slug, code and readable name rather than a hole.

### 2. One name, whatever the provider called it

`TeamIdentity` carries a canonical `name`, and every surface renders that instead of the
raw string. No page says "RB F1 Team" while another says "Racing Bulls", and "Haas F1
Team" — which tells a reader of a Formula 1 product nothing — is just Haas.

### 3. Three livery tables, and they had drifted apart

`constructors.ts`, the Jolpica adapter and the mock simulator each held their own colours.
That is how Audi ended up rendering on Kick Sauber's inherited green in the championship
while the session feed drew the same team red on the pace board.

The frontend record is authoritative now: **the badge no longer takes the caller's word for
the livery.** A record we hold wins; the caller's colour is the fallback only for a
constructor we have no record of — a 1998 Jordan — where their feed is the only source
there is. Both backend tables were aligned to match, so the two sources agree at origin as
well.

Two corrections came with it, both flagged in V72 and V73 and both now explicitly asked
for: **Audi is red**, off Kick Sauber's green; **Alpine is blue**, with the sponsor's pink
demoted to the accent it always was.

### 4. Demo mode now spells teams the way the real provider does

`_MOCK_CONSTRUCTORS` used clean names, which is exactly why three releases of sweeps never
saw this: the bug needs Jolpica's spellings to appear, and demo mode did not have them. It
does now — "RB F1 Team", "Alpine F1 Team", "Cadillac F1 Team", "Red Bull" — so anything
that regresses the resolution is visible on the first screen a developer opens.

---

## Fixed in V73

### 1. Cadillac completes the grid

Eleven of eleven current constructors now carry their official mark. Like V72, the release
is one file: no component, no mapping, no threshold, no special case.

### 2. The championship table asked for a driver's logo — *was ours, and it was live*

The audit's HTTP assertion caught it, and nothing else would have. Pressing **Constructors**
on the standings flips `type` immediately while the fetch resolves a moment later, so for
one render the **drivers'** rows were being drawn as constructors: nineteen driver names
went into the constructor badge, which asked the server for `/teams/max-verstappen.webp`,
took a 404 apiece, and briefly painted a drawn shield reading "MAX" where a team's mark
belongs.

It also poisoned the badge's module-level probe cache with driver names for the rest of the
session — the cache that exists precisely so a resolved constructor never flickers again.

The rows now carry the type they *are*, and a mismatch renders the skeleton, because rows
that do not match the type is what "still loading" actually looks like. `loading` alone was
one render too late: pressing the tab re-renders before the effect that sets it runs. Zero
4xx across the whole audit afterwards.

### 3. The demo grid still fielded Kick Sauber — *was low, and it was the last placeholder*

The simulated 2026 season listed Kick Sauber, which for 2026 is Audi. The badge behaved
correctly — different constructor name, different key, no mark, drawn shield — but the
practical effect was one placeholder left in the current-season experience with every asset
present. Renamed in the simulator, the mock championship and the question-answering alias
table, where "sauber" and "kick" stay as aliases so an old query still resolves.

### 4. The tool now catches a colour collision, not just a missing file

Cadillac and Haas both carry `#b6babd`, so their badges are the same grey disc — and the
livery is not only the badge, it is that team's rail, its bars and its line on every chart.
`check-team-logos.mjs` reads `constructors.ts` and reports duplicates rather than keeping a
second copy of the colours that could drift.

---

## Fixed in V72

### 1. Five more constructors, and no second implementation

Alpine, Haas, Audi, Williams and Aston Martin render their official marks everywhere the
current season shows a constructor. The release is five files and a documentation update:
no component changed, no mapping was edited, no page learned a new name. That was the
point of building it this way in V70 and measuring rather than guessing in V71, and it is
the first release where the system was exercised as designed rather than being written.

Cadillac is the last one outstanding. Historical is unchanged — 1998 and 2015 render zero
badges and issue zero requests to `/teams`, checked again rather than assumed.

### 2. The rollout is visible in one place

`node scripts/check-team-logos.mjs` now reports 10/11 present. Its header claimed to report
opaque coverage and ink luminance, which it never did — those need the pixels decoded, and
the badge already measures both on a canvas at runtime. Reproducing it in the build tooling
would be a WEBP decoder plus a second copy of the classification to keep in step, so the
comment was corrected to describe what the script actually answers rather than the script
grown to match the comment.

---

## Fixed in V71

### 1. Five constructors have their own marks — *was the brief*

Mercedes, Ferrari, McLaren, Red Bull Racing and Racing Bulls now render their official
marks in the championship table, both constructor pace boards, the advanced constructor
table, the driver gallery, the focus card and the driver comparison. The other six render
the drawn shield, which is a designed state rather than a gap, and V72/V73 need only add
files.

### 2. A square mark is not a composed badge — *was ours, and it would have shipped broken*

V70 decided from the aspect ratio whether an asset already carried its own background: a
square file was assumed to be a composed roundel, given the whole circle, and had its
livery background removed on the grounds that an opaque roundel hides it anyway.

Every one of the five marks is a transparent silhouette on a **square** canvas. Under
V70's rule all five would have been handed the full circle with the background taken away
— four of them are pure white ink, so on paper they would have rendered as nothing at all.

The question is measured now instead of inferred. The mark is drawn to an offscreen canvas
once per session and its **opaque coverage** decides the case: a roundel filling its square
covers π/4 ≈ 78% of it, these five cover 17–41%, and the threshold sits at 70% in the gap
between them. Aspect ratio still decides the fit, which is all it was ever able to answer.

### 3. "Use the team colour" is necessary and not sufficient — *the interesting part*

A team colour is whatever the team chose and a mark is whatever the mark is. Mercedes'
petronas green is luminous and its star is white: at full strength that is white on
near-white, brand-accurate and completely empty.

So the livery sets the hue and the mark's own measured ink sets how far that hue is taken.
White ink is dropped onto a deep field, dark ink lifted onto a pale one, each landing near
5:1 contrast — Mercedes `#27f4d2` → `rgb(20 125 108)`, McLaren `#ff8000` → `rgb(175 88 0)`,
Ferrari essentially unchanged at `rgb(224 0 43)` because it was already dark enough to
carry a white shield. Eleven teams whose colours run from Ferrari red to Haas gunmetal
come out looking like one set, and nothing is configured per team.

The field does **not** follow the theme, because the mark's ink does not either. A badge
that restyled itself per theme would be a brand that restyled itself per theme.

### 4. The light-mode rule swallowed every modifier — *caught by the sweep, one release after documenting it*

`:root[data-theme="light"] .cbadge` counts three simple selectors; `.cbadge.is-field`
counts two. The theme rule won and the first light-mode screenshot of this release showed
all five marks as white ink on a pale wash — invisible. This is exactly the swallow V69
found on the welcome instruments, written into the design system as a rule, and then
repeated in the theme it was not authored in. Each modifier is restated at a weight that
can win, and the base light rule now comes last in the block so it cannot read as the
general case.

### 5. The staged rollout got a tool rather than a checklist

`node scripts/check-team-logos.mjs` reports, for all eleven slugs: present or on the
shield, pixel size against the 96px the largest badge wants on a 2× display, and how the
badge will classify the file. It replaced a fetch script whose upstream is no longer the
source of truth.

---

## Fixed in V70

### 1. A constructor had no identity where a driver had a face — *was the brief*

Every driver in this product is a portrait in a circle. Every constructor beside them was
a 10px coloured dot, a 2.5px livery sliver, or nothing — so a row carrying both read as a
photograph next to a piece of punctuation. Constructors now wear their own mark in a
circle of the same diameter, set the same way, in the current championship table, both
constructor pace boards, the advanced constructor table, the driver gallery, the focus
card and the driver comparison.

One component does all of it. `ConstructorBadge` resolves `/teams/<slug>.webp` from the
constructor's name, probes it once per session, normalises it, and falls back to the drawn
shield when there is nothing there. Nothing enumerates which teams have files, so a new
mark is a file drop and no code change.

### 2. `object-fit: contain` is not normalisation — *the hard part of the brief*

"Mercedes shouldn't look tiny while Ferrari fills the container" is a real problem and
contain does not solve it: contain guarantees nothing overflows, which means a wide mark
touches both side edges while a square one touches all four, and the wide one reads as
half the size. The badge decides from the asset's own aspect ratio, with no per-team table:

* **Near-square (0.86–1.16)** is a mark that already carries its own padding — a roundel, a
  shield, a composed badge — so it gets the whole circle and aligns with the container
  rather than floating inside a second one. The livery wash is dropped with it, because
  nothing of it can be seen behind an opaque mark.
* **Anything else** is fitted by its longest edge, and that edge is allowed to grow from 74%
  to 92% of the badge as the mark gets thinner. **A circle is not a square**: a thin mark
  has no corners to cut, and lives along the diameter where there is materially more room.
  Measured at 38px, a 4.3:1 wordmark went from 28px wide to 35px — the difference between
  "half the size of its neighbour" and "the same size".

### 3. Two components each had an opinion about the container — *was ours*

The old mark drew its own shield at `size × 1.1`, so a constructor was 10% taller than the
portrait beside it and rows carrying both never quite lined up. The badge owns the circle
now and the shield is handed the space that is left. Every badge in the product reports an
exactly square footprint at every size from 18 to 38.

### 4. Pending, present and absent were three different shapes — *found while building*

Showing the shield first and swapping to the mark a frame later is a badge that changes
under the reader's eye, which is the one thing a badge must never do. All three states
paint into the same circle: pending is the circle with its wash and nothing in it, and
what arrives — mark or shield — arrives into the space that was already there. The probe
cache is a module constant, so a constructor resolved once is answered synchronously for
the rest of the session and never flickers again.

### 5. The focus card ignored the colour-vision setting — *was medium, and found in passing*

`FocusCardShell` took `driver.team_color` raw rather than through `useLivery()`, so in all
three colour-vision modes the most prominent card in the product — its rail, its wash, the
ring around the portrait, the eyebrow — was the one surface still painted in colours those
readers cannot separate. Found because the constructor badge would have inherited the same
bug. One line; the whole card is correct now.

### 6. Historical stays text-only — *verified, not assumed*

Past seasons render zero badges and issue zero requests to `/teams` — checked at 1998 and
2015, drivers' and constructors' tables both. The gate was already the right one: the
standings take `portraits` from the caller, and the Historical page passes it only for the
season in progress.

---

## Fixed in V69

### 1. The welcome background went black whenever the reader touched a control — *was high*

Expanding any of the four disclosure rows, or switching text size, made the whole ambient
field blink. The cause was not React and not the animation: **setting a canvas's `width` or
`height` erases it**, and that is the spec, not a bug. The `ResizeObserver` fired on every
layout change and reassigned both, wiping the buffer, and the next paint was one animation
frame away — one black frame, every time, on the most expensive-looking surface in the
product. `size()` now returns whether anything actually changed, no-op resizes never touch
the canvas at all, and a real resize repaints on the same tick rather than waiting for
`requestAnimationFrame`. Sampled luminance across 59 frames of an expand: `161 → 161`.

### 2. American spelling was a one-way door — *was high*

British → American worked. American → British did nothing, anywhere, for the rest of the
session. The bridge caches each node's authored text so that going back is a *restore*
rather than a second conversion — but the two `WeakMap`s were created **inside** the effect,
so the moment the preference changed the effect re-ran, the caches were thrown away, and the
American text it had just written became the new authored baseline. Hoisted to module scope,
they survive the re-run. The reverse dictionary and its regex were deleted outright: the
product is written in British English, American is a rendering of it, and a second map is a
second thing that can disagree with the first.

Verified across the application, not just the welcome screen: Home changes 3 word-runs and
Settings 12, `title` attributes included, and British restores byte-identically twice in a
row.

### 3. The welcome screen scrolled on ordinary laptops — *was medium*

A landing page you have to scroll to read has not landed. The first act now measures itself
and scales to the viewport, down to a floor of 0.68, below which it stops shrinking and
allows a scroll rather than becoming unreadable — and the trust card became two columns
rather than two stacked rows, which is both the honest structure (they are two subjects) and
the single largest height saving available. No scroll and no clipping at 1920×1080 through
1280×720; 1024×640 degrades to a scroll without ever cutting anything off.

### 4. Home hid its own evidence until you scrolled — *was medium, and ours*

The statistics band under the hero was a scroll reveal, and the reveal observer runs with a
`-12%` bottom margin — at 900px the band sits just under that line, so the proof of "we read
every lap" was invisible on arrival and appeared only if you scrolled and came back. It
belongs to the hero's arrival, not to a section you travel to. Fully in view at `scrollY: 0`
at every size from 1920×1080 down to 1280×720.

### 5. Nothing on Home said there was more below it — *was medium*

Not a bouncing chevron: that says "there is more" and nothing else, and it is the first
thing on a landing page that looks like a template. It carries the **name** of what is next
— the same `01 · Read a race` the section below wears — under a hairline whose light travels
downward on a slow loop, as if the page were being fed from above. The reader meets that
label again four hundred pixels later, so the cue teaches the page's structure instead of
merely pointing past it, and it removes itself the moment they act on it.

### 6. The DNF card repeated its own heading back at the reader — *was low*

"Did not finish / Retired — after lap 41 / Reason: Retired". For almost every car the
source's stated reason *is* the word "Retired", so the row added a third line saying the
thing the card was already called. One row now, because there is one fact: the lap. A named
reason ("Hydraulics", "Collision damage") replaces that line rather than sitting under it.

### 7. The classification ended on a caption — *was low*

V68 put a "where the championship stands" handoff under the Race Story leaderboard, back
when the standings had just moved and the reader needed telling where. They meet the scope
switch at the top of the page now, before they read anything, so a second pointer at the
bottom explains a control they have already used. A results table is the strongest thing on
that page; it should end on the last row.

### 8. Light mode painted the whole field one grey — *found in passing*

`:root[data-theme="light"] .wc-inst-code` outweighs `.wc-inst-code.is-lead` on specificity,
so on paper the welcome screen's field strip lost the leader highlight — the only thing that
strip says. The same swallow was eating `.wc-inst-v.is-good` and `.is-warn`, which is why a
green flag read as plain ink in the light room. A light override written for a base state has
to restate every modifier it outweighs; an audit script now exists for the pattern and finds
no others.

### 9. The scroll cue could take focus after it had gone — *found in passing*

It fades to `opacity: 0` and `pointer-events: none`, which stops the mouse and not the Tab
key: a control you cannot see was still a stop in the tab order. It leaves the tab order and
the accessibility tree together now. Its `aria-label` also went — the spoken name was "Read
on" while the visible words were "Read a race", which is a WCAG 2.5.3 failure and a control a
voice user cannot ask for by the name written on it.

---

## Fixed in V68

### 1. The Final Classification lost its hover cards — *was high, and ours*

V67 wrapped the DNF and penalty badges in an `overflow-hidden` track to stop two penalties
on one driver making that row taller than every other. It fixed the alignment and clipped
both badges' tooltips away — the time-penalty explanation vanished entirely, and what
survived was the bottom edge of a card whose body had been sliced off, which is the
"strange purple halo". Both are portalled now, like every other tooltip in the product, so
no ancestor can crop them; the track keeps the row's height without clipping anything, and
the DNF card gained the retirement reason where the source publishes one.

### 2. Old races were reported as having a data problem — *was high*

A 1975 Grand Prix was reported as missing its lap times, tyre stints, weather and
race-control log. None of those were recorded, by anybody, in 1975. The same category error
V67 fixed for qualifying was still being made along the era axis, and it is the honest
answer to "why do some races still return incomplete data": mostly they do not — we were
calling an era-appropriate absence a gap. Facets now carry the season each feed actually
begins in, a session predating one says so in a sentence, and a 2024 race missing the same
feeds is still partial. Four tests hold the line.

### 3. The failure screen read as a broken app — *was medium*

Warning triangle, apology, three pills and a `<details>` called "What we tried". It is a
status panel now: which session, why not, whose problem it is — named provider by named
provider, with what each one said — and what to do next. Most failures are a provider
having an afternoon, and saying so plainly is the same promise the welcome screen makes.

### 4. The welcome screen asked three questions and implied that was all — *was the brief*

It now covers experience, appearance, tour, language, units, clock, motion, text size and
colour vision — and got shorter to read, because the shape carries the difference: three
hardware cards for the answers that change what the product is, everything else behind one
line that opens if you want it. The defaults are still accepted in a single press, and the
footer names Settings rather than gesturing at it.

### 5. Nothing explained how Pitwall IQ gets its data — *was medium*

One card on the first act of the welcome screen, before any question is asked: what it
reads, that it names the source of every figure, and what happens when a provider is down.
The Beta message shares that card rather than being a second banner elsewhere — they are
the same sentence from two sides. The "v1" label went with it; it claimed a maturity
nothing had earned.

### 6. The championship still had no natural home — *was medium*

A tab beside Ask said it belonged to one session. Seasons was right for 1974 and wrong for
the title race somebody is following this week. It is a scope switch on Explore now —
Session or Championship — because that page already owns a season and the championship is
the other thing it is about. Seasons became what its name says: every season that has
finished, with the season in progress deliberately absent from its picker.

### 7. The logo and the Home tab were the same control — *was low*

The tab went rather than the logo's behaviour: removing the behaviour would have left a
logo that looks pressable and is not, and the nav row now carries five destinations, which
is exactly when its first slot should not be spent on the place the corner already goes.

### 8. Nothing said what was coming — *was low*

Drivers, Teams and Re-run sit in the nav as disabled tabs that read as a plan rather than
as breakage: legible, marked `soon`, each with a hover card saying what it will be, none of
them focusable or pressable.

### 9. The championship picker stopped at 2018 — *found in review, was low*

Nine seasons, on a page whose own heading says seventy-seven. Generated from 1950 to the
last finished season now, so it never needs editing again.

### 10. The season chip contradicted itself — *found in review, was low*

A deep link to 2024 rendered "2024 CURRENT", because the chip was unconditional. It only
appears on the season that is actually current.

### 11. Three surfaces still said "Historical" — *found in review, was low*

The nav was renamed in V67; the previous-season note, the selector's tooltip and the footer
were not. All three say Seasons.

---

## Fixed in V67

### 1. The tutorial shifted the page under its own spotlight — *was high*

The highlight measured its target during the scroll and then stopped watching, leaving
`scroll` and `resize` listeners that do not fire when the LAYOUT changes under a stationary
page. On the Race Explorer it always does: the session lands a beat after the tour opens,
the heading stops saying "Loading", a chip appears beside it, a note may appear under it —
and everything below drops twenty-four pixels while the outline stays put. Measured: the
target moving 141 → 165 with the ring left behind.

The rect is now read every frame for the life of the beat and written only when it has moved
(so a stationary target costs no renders), and the correction runs on a shorter curve than
the journey between beats — a twenty-four-pixel glide over half a second is not a
correction, it is a second animation. Worst tracking error through a deliberately delayed
session load: 4px.

Separately, the tour no longer scrolls to centre on every beat. It scrolls only when the
target is outside a comfortable band, and then by the least it can. Measured over all seven
beats at 1440×900: the page does not move at all.

### 2. Partial data was decided by whichever source answered first — *was high*

Every adapter declared its own facet list, so a facet an adapter never declared could never
be reported missing. A race fetched through the archive with no position trace reported
COMPLETE, and the reader got a Race Story with no timeline and no explanation — which is the
"Monaco is missing data but doesn't say so" report, and it was never about Monaco.

The report is settled once now, at the end of the pipeline, from the session that was
actually built: one canonical facet list, filtered by what the category can have. Five tests
pin it — a facet no adapter declared is still missing, a complete session is never flagged,
the audit is idempotent, it preserves the adapter's provenance, and a qualifying hour is not
missing things it cannot have.

### 3. The two classifications were two different tables — *was medium*

One printed "DNF" in the position column and then repeated the status twice more; the other
printed an em dash. One hid the classified position of every retirement in Grid→Finish, so
the same car read as P18 in one table and as nothing in the other. Neither sorted, so a
classified finisher could appear mid-way through a run of retirements. And two penalties on
one driver wrapped onto a second line, making that row taller than every other.

One standard, in `lib/classification.ts`, used by both: order by classified position;
"NC" where there is none, never a status; retirements recede; badges on their own track.

### 4. The Driver focus dialog opened 453px down the page — *was high*

`position: fixed` is only fixed to the viewport while no ancestor has a transform — and every
arrival animation in the product used `fill-mode: both`, which holds `transform: none` for
ever as the computed matrix. Practically every panel was a containing block. The dialog
opened below the fold against a page it had itself locked, so it could not be scrolled back.

Entrances use `backwards` now, and dialogs go through one shell that portals to `document.body`,
centres in the viewport, locks the page, closes on Escape and on the backdrop. Verified: the
overlay is exactly 0,0,1440,900 and its parent is BODY.

### 5. The Historical classification trapped the mouse wheel — *was medium*

It carried `.modal-scroll` — a rule for a box inside an overlay, `overflow-y: auto` plus
`overscroll-behavior: contain`. With no height limit it could never scroll, but `contain`
stops the wheel chaining out whether or not the box can use it, so the pointer resting
anywhere over the results killed scrolling for the page. It takes `overflow-x` and nothing
else now.

### 6. Light mode's coloured hairlines were invisible — *was medium*

`--tint` inverts, so 137 structural hairlines written `white/[0.06]` flip cleanly and keep
their weight. A COLOURED hairline does not: a broadcast red at 30% on black is a bright edge,
and the print red at 30% on white is pale pink. Key moments, strategy borders, turquoise
accents and every thin accent ring are raised in light mode and only in light mode — same
hues, at the weight they were always supposed to read at. The tyre compounds and the
key-moment colours now go through the same adapter the liveries do, which is what finally
fixed the hard compound disappearing on paper, and the temperature ramp came down out of the
top of the value scale.

### 7. Colour blindness had no answer at all — *was high*

Roughly one man in twelve cannot separate the two hues carrying most of this product's
meaning. Four palettes now: full colour, protanopia, deuteranopia, tritanopia, mapping every
livery, compound, flag, key moment and semantic token onto a ring whose members survive that
deficiency — Okabe-Ito for red-green, a red-cyan axis for tritanopia. Interpolated rather
than snapped, so colours that were distinct stay distinct; near-white left alone, so the hard
compound stays the white one; composed with the light-mode ceiling, because both readers
exist at once.

### 8. The championship sat inside the session's tabs — *was medium*

Every other tab is a reading of one session. Standings is a property of the season, and a
seventh tab beside Ask said otherwise. It lives on Seasons — renamed from "Historical",
because a reader who reads the label as "old stuff" will not look for this year's title race
behind it — that page opens on the season in progress, and the Race Story hands the reader
off to it after the result.

### 9. Navigation could go back but not forward — *was medium*

Back was a counter, which is enough for one direction and useless for two — and it could not
tell the browser's own Back button from a new navigation, so a browser-back counted as
another step AWAY from home. It is two stacks of paths now: Back and Forward as one control
with two halves, each disabled rather than hidden, truncating the forward history on a new
navigation exactly as a browser does. Verified through nine transitions including the
browser's own controls.

### 10. Permanent explanatory copy was competing with its own tooltips — *was low*

Several panels printed a sentence describing the metric directly above an info button whose
tooltip explained the same thing at greater length. One of the two was pure clutter, and it
was the one that could not be dismissed. Race control, weather, pace, the pace board,
three qualifying panels and the sources panel keep their titles and lose their subtitles;
what the subtitle genuinely carried that the heading could not — the fetch timestamp —
stays, as a timestamp.

### 11. A reduced-motion meter was fourteen identical bars — *found in review, was low*

Carried over from V66's freeze rule; it holds an uneven static reading now.

---

## Fixed in V66

### 1. The welcome screen's light mode was the dark one, painted over — *was the brief*

Switching to Light on the welcome screen left the canvas painting the dark room and every
CSS layer above it painting paper: a white scrim over a black field, which is exactly what
"the dark mode inverted" describes. It came right on reload, which was the tell.

The cause was a scoping mistake with a general lesson. `WelcomeField` captured the palette
once per effect run and keyed the effect on `prefs.theme` — and **React runs a child's
effects before its parent's**, so it read `<html>` before `PrefsProvider` had written the
new theme onto it. The canvas now watches `document.documentElement` for `data-theme`,
`data-accent` and `style`, which is where the theme actually lives; the accent, written as
inline custom properties by the same provider, was never picked up before either.

With that fixed, the light room was designed rather than derived. Lamps mix toward **white**
before they are laid down (mixing toward the page colour made every wash slightly darker
than the sheet and piled three of them into a mauve bruise under the headline — measured
`rgb(219 212 220)` on a `rgb(240 242 246)` page; it is `rgb(240 235 239)` now). Compositing
is plain rather than additive. Daylight falls from the top instead of pooling in the middle.
Ink is stated at print weights in its own table rather than scaled off the dark values. And
nothing blooms: the status lamps get tight rings, the primary control gets a contact shadow
instead of a forty-pixel throw, and the halo behind the accent word becomes a highlighter.

### 2. The pace delta refreshed instead of running — *was medium*

It rebuilt its three traces from a 1.6-second `setInterval`, so the picture jumped to a new
shape and then sat still, beside a canvas running at sixty frames a second. Each trace is
now drawn once, twice as wide as the window, out of components whose periods divide that
window exactly — then translated by exactly one window width for ever. Seamless, no timer,
no re-render. The data-stream meter lost its timer for the same reason, and the tyre window
kept its tick but got a transition exactly as long as the interval feeding it.

### 3. The three doors lurched on hover and were static without it — *was medium*

Every loop in the landing windows was handed a shorter `animation-duration` on hover, which
does not accelerate an animation — it recomputes the position from elapsed time against the
new duration and jumps. Six loops per window, three windows, all jerking on the same gesture.
Nothing changes rate now; a faster pass that always runs at zero opacity fades in, the traces
thicken and the moving parts grow, all as transitions.

At rest the windows also had nothing to say: four squiggles bobbing 2.5px on a nine-second
loop is wallpaper. Each now runs a real mechanism — four cars travelling their own position
traces at four speeds, an answer leaving the node it resolved at, a read head sweeping the
seasons before the podium lands behind it.

### 4. The example questions did not ask anything — *was high*

The landing page's three example questions were links carrying `?q=`, and nothing on the
Explorer side read the parameter: pressing one opened the Ask tab with an empty box and left
the reader to type the question they had just chosen. It now types itself into the real
input and submits itself against the real session, and the answer is on screen with no
further interaction. The parameter is consumed as it is taken, so Back into the page does
not re-ask.

### 5. The tutorial's outline cut through its neighbours — *was medium*

The highlight was a fixed 8px on every side of every target plus a 22px outward glow — 24px
of accent light on whatever happened to be next to it, against a 16px gap above the session
picker and an 8px gap beside the tabs bar. The padding is now measured against the real
clearance to every neighbour that shares a band with the target, identical on all four sides,
8px where there is room and as little as 3px where there is not; most of the glow turned
inward onto the control it is explaining; and the outline takes the target's own corner
radius plus the padding, so it stays parallel to the edge it traces.

### 6. Three dead welcome-screen rules were still in the stylesheet — *found in review, was low*

`.wc-glass`, `.wc-pick` and `.wc-pick.is-quiet` had no callers left after V64 moved the
setup cards to `.wc-card`. Dead CSS with the project's own naming conventions on it is a
booby trap — V65 lost an afternoon to exactly this — so they went with the change that made
them dead.

### 7. The welcome screen drew tyre colours it had invented — *found in review, was low*

The tyre window carried its own three hexes, one of which (`#e8ecf5` for Hard) is very
nearly white and therefore invisible on paper. It uses `COMPOUND_COLOR` through `useLivery`
now — the product's existing answer to broadcast colours that do not survive a white
background — so there is one set of tyre colours rather than two.

### 8. The reduced-motion data stream was a row of identical bars — *found in review, was low*

Freezing the meter left fourteen bars at the same height, which is not a level meter at rest;
it is a loading skeleton. It holds an uneven static reading now.

---

## Fixed in V65

### 1. The tutorial flew the camera between steps — *was high*

Three beats pointed at the whole content area. Every beat now points at the specific control
its sentence is about. Measured across the full eight-beat tour, the viewport moves **23px in
total**.

### 2. The tutorial skipped Standings — *was medium*

It jumped from Ask to Sources. There is a Standings beat now, pointing at the drivers /
constructors switch.

### 3. The tutorial abandoned the reader in Ask — *was medium*

It now puts the room back: Explore, Race Story, the most recent completed race — the state the
product opens in.

### 4. The spotlight jittered and could not breathe — *was medium*

The scrim and the outline were one box, so the ring's glow shared the scrim's 9999px shadow and
any pulse re-ran the geometry transition. Split into two co-located elements on one curve, with
`will-change` keeping them on their own layer.

### 5. The tutorial card was a generic tooltip — *was low*

A step number, tighter type, and its own faint drifting field behind an opaque pane — atmosphere
that never touches the text.

### 6. Home said nothing to a reader who had asked for the tour — *was medium*

Reinstated as a genuine invitation rather than V62's version: the control breathes, a ring
expands out of it, one small label sits beside it, and **nothing is dimmed or overlaid**.

### 7. Standings portraits used a second, weaker lookup — *was medium*

Unified with the Final Classification system: the session's own enriched drivers, matched by
code.

### 8. The settings gear read as short of the corner — *was low*

Its box was exactly on the grid (measured: 104px, same as the wordmark and the panel edges) but
a 15px glyph in a 32px box sits 8.5px inside that line. Optically aligned by half the
difference.

### 9. A dead V62 CSS block was overriding a live V65 animation — *found in review, was high*

Duplicate `@keyframes cta-breathe`; the later definition wins and the survivor animated
`transform: scale()`. The home CTA was being scaled forever — it failed Playwright's stability
check, which is how it was caught. Dead block removed.

---

## Fixed in V64

### 1. The welcome screen read as a marketing page — *was the brief*

Rebuilt as seven layers: the room (drifting lamps), the feed (telemetry, packets, a ghosted
circuit, a radar sweep), the fog, seven instrument panels, a cursor light, machined hardware
cards, and the type. Everything at the periphery sits at about a third of contrast and none of
it moves under the reader's eye.

### 2. The setup cards were website cards — *was medium*

Now glass with an edge-lit top, a specular sheen positioned at the pointer's own coordinates
inside the card, an LED per answer, and a lift on hover.

### 3. Light mode was an inversion — *was high*

Designed on its own terms: the lamps multiply into an opaque base instead of adding to it,
hairlines darken instead of brightening, the cards get real shadows and white glass, and every
new class carries an explicit light-theme rule.

### 4. The card hover did nothing at all — *found in review, was medium*

`animation-fill-mode: both` on the entrance kept ownership of `transform` for the life of the
element, so the hover lift was computed and discarded every time. `backwards` hands the element
back.

### 5. The circuit glyph was a bean — *found in review, was low*

A fixed viewBox cannot frame seven layouts that each occupy a different part of their box. It
is derived from the control points' bounding box now and re-fits itself for any new layout.

### 6. Two rules were setting the CTA's background — *found in review, was low*

`.cta-glow` and a `bg-accent` utility, with stylesheet order deciding. The utility came off, and
the welcome screen's better button became the product's one primary control.

---

## Fixed in V63

### 1. A brand-new visitor saw the home page first — *was high*

Reported, reproduced, and the reporter was right. The gate was a React effect, so `/` rendered
Home and only bounced after hydration. It is now in the parser-blocking head script, which runs
before the body is parsed: `location.replace` there aborts the document load. Verified from a
genuinely fresh browser profile — at 150ms the path is already `/welcome` and the home
page's `<h1>` and CTA were never in the document at all. A returning visitor is not gated, and
a first-time deep link to `/explorer` is not hijacked.

### 2. The welcome screen was a preview of the home page — *was medium*

It borrowed the hero renderer, so the racing line — the thing the home page exists to reveal —
was spent one screen early. The welcome screen draws its own room now: lighting and a hairline
lattice, no race data of any kind. The `ambient` variant came out of `HeroField` rather than
being left to be reused by mistake, and the welcome route stopped shipping the race simulator
with it (111 kB → 96.3 kB first load).

### 3. Home announced a decision made on another screen — *was medium*

V62's pill and breathing ring around *Start exploring* were removed. The home page is now
identical whether a tour is armed or not; the tour is a consequence of pressing the control.

### 4. The welcome screen could not be replayed — *was low*

Settings gained "Replay the welcome screen" beside "Replay the guided tour". It puts the flag
back; the head script does the rest on the next load of the front door.

### 5. The light theme's lamps washed the screen out — *found in review, was medium*

Additive compositing on white pushes every source toward white. The light theme paints an
opaque base and multiplies into it instead.

---

## Fixed in V62

### 1. The landing page was doing onboarding's job — *was high*

It had to be the argument for the product and the place a stranger was introduced to it, and
those want opposite things. Split into three pages with one job each: Welcome answers "what is
this", Home answers "I want to explore", Explorer answers "teach me the race".

### 2. The welcome screen introduced nothing — *was medium*

It asked two questions under a headline. It now opens on what the product is, why anyone would
use it and what makes it different — three pillars, the third of which is the one nothing else
in this category claims: every figure names its source, and anything missing is said out loud.

### 3. Setup was two disconnected steps — *was medium*

Depth, theme and the tour are now three rows on one screen, all pre-answered, with the primary
control live from the first frame. Choosing the theme changes the screen under the press.

### 4. The theme toggle was a preference pretending to be a tool — *was low*

It took permanent space in the chrome of every page to hold an answer given once. Asked on the
welcome screen, kept in Settings, removed from the bar. `ThemeToggle.tsx` deleted rather than
left orphaned, and the tour beat that pointed at it folded into the Settings beat.

### 5. Nothing told the reader the tour was waiting — *was medium*

A reader who asked for the tour landed on Home with one faint line of grey text. There is now a
pill above the control, a breathing ring around it — the only motion on the page — a line
explaining that nothing starts until they press it, and a way to decline. Verified that the
page stays fully scrollable and that the tour still does not begin on its own.

---

## Fixed in V61

### 1. Every dropdown in the product, re-checked against the standard — *was high*

Reported: the Grand Prix picker and Compare's second driver rendered behind the page or
invisibly. Reproduced at scroll offset 400 (`Grand Prix → menu: missing`), and the cause was
in the shared component rather than in either caller: a `scroll` listener that closed the menu
was firing on the very scroll that brought the trigger into view. The menu now **follows** its
trigger and leaves only when the trigger leaves the viewport. All nine pickers verified open,
in-viewport and on top, at three scroll offsets, on desktop and phone.

### 2. The Tyres chart could not show a safety car — *was high*

The neutralisation band was painted behind twenty rows of opaque bars. Rebuilt as a track-state
rail above the plot, a hatch over the bars and hard edges on the window's first and last lap;
hovering a capsule says how many cars took the cheap stop inside it. See the design-system
note.

### 3. The undercut mark said nothing — *was medium*

An 11px glyph with a `title` of "Undercut attempt". Now a stemmed marker coloured by whether
the move worked, with a hover that teaches the mechanism and states what it was worth in this
race. All of a driver's undercuts are drawn; previously only the first existed.

### 4. Race control was a list of boxes in the wrong order — *was medium*

Neutralisations were dumped above messages that preceded them. Rebuilt as one chronological
fixed-width feed with a lap column, status tags, inline neutralisation banners and filters.

### 5. Decisive moments did not say why they were decisive — *was medium*

Named mechanisms, each detected against this session's own data, with a "why it was decisive"
block that leads with the backend's context and follows with what actually happened.

### 6. Compare answered a question nobody asked — *was medium*

It auto-populated with the two quickest drivers. Now a designed empty state with duels derived
from this session's classification.

### 7. The standings had no faces — *was low*

Driver rows carry portraits, joined by name from F1's own driver listing at the API and
falling back to the team-coloured initials avatar the product already used.

### 8. Back could not reach Home — *was medium*

Rewritten to step through in-app history and stop at Home, where the control hides. Verified:
`/history → /explorer → / → hidden`.

### 9. The hero numbered its chapters 02 and 03 — *was low*

"See how it works" was removed entirely rather than replaced, and the chapters renumbered.

### 10. The tour could lock the screen with nothing on it — *found in review, was high*

Scroll input is locked when the tour starts; the card waits for its target. On a cold route
that gap is a locked page with no affordance. It now shows a holding state with a way out after
700ms.

### 11. The tour would not let the reader leave — *found in review, was high*

The scrim is `pointer-events-none` so the nav stays live, but the engine pushed the reader back
whenever the path was not its own — which made Back look broken. Walking away now ends the
tour, marks it done, and leaves the reader where they went.

### 12. Four surfaces spelled "neutralization" at a British reader — *found in review, was low*

The spelling bridge only converts authored British → rendered American. Those strings were
authored American, so both settings showed the same word. Stem added, strings re-authored, and
the glossary keyed on both spellings.

---

## Fixed in V60

### 1. Races that had not been run were offered, and loaded — *critical*

Picking the Brazilian Grand Prix in August produced an empty session. The rule
existed (`event_completed`) and exactly one caller asked it, so both calendar
endpoints returned whole seasons and both pickers offered them. It is stamped on
the model now and travels with the data — and, because a selection can also
arrive from a link or from restored state, the Explorer snaps to the most recent
race that *is* on offer rather than fetching whatever it was handed. Verified:
a deep link to `?gp=Brazilian Grand Prix` corrects itself. The demo obeys the
same rule, which it previously could not, because its fixture calendar had no
dates at all.

### 2. The first decision was the third thing on the second screen — *critical*

"Choose your experience" sat below a headline, five statistics and a scroll. It
has a screen of its own now, and the landing page — which a reader reaches after
answering — has that band removed entirely.

### 3. The tutorial took the page away before it had been looked at — *high*

It opened itself 1.4s after load. It begins on Start exploring now, which is an
unambiguous "I am ready". It also locks the reader's own scrolling (the input,
not the scrolling, so the tour can still move the page), waits for the page to
stop before showing its card, and ends on Explore whether it is finished or
skipped — rather than abandoning the reader in Settings holding no session.

### 4. Back walked the browser's history — *high*

Five presses to get home from a fourth page, and no press predictable. One level,
one destination, one press. Forward is gone with the stack it belonged to.

### 5. "See how it works" did not show how it works — *high*

It scrolled down the page: a control whose label is a question, answering it with
a section heading. It opens the five-screen demo on a real session now, which
also retires the duplicate entry point that had been sitting in Quick start.

### 6. Quick start explained a product the page had already explained twice — *high*

Three cards describing what Pitwall IQ does, under a headline describing what it
does, above three doors describing what it does. Replaced with the most recent
Grand Prix — real winner, real margin, the sentence the product wrote about it —
and three questions that open it. Not an explanation: the thing itself.

### 7. Every dropdown was drawn by the operating system — *high*

Platform radius, platform type, platform shadow, and on Chrome a menu that opened
*upward* whenever the trigger was below the fold. Replaced with one listbox used
in all six places, portalled so nothing can clip it and measured so it opens
downward unless it genuinely cannot.

### 8. Settings existed more than they were felt — *high*

Density moved the type ramp and nothing else; intensity reached the page wash and
not the four other accent-lit surfaces. Both reach everything now, and the row
rhythm of every table moves with density — which is where "more on one screen" is
actually cashed in.

### 9. The Live Preview was not representative — *medium*

A miniature of one card cannot show what density does to a timing screen or what
chart speed does to a chart, so a reader still had to leave to find out. Removed,
and its column given back to the controls, which needed it more.

### 10. Historical was the plainest screen in the product — *medium*

A 14px label over a 20px heading, introducing the largest thing in the product,
above eight grey columns. It has the header the Race Explorer has, and both its
tables now carry team liveries, a podium hierarchy and dimmed retirements.

### 11. Current-season standings existed only in the archive — *medium*

Historical has carried a championship table since it was built; the Race
Explorer — where a reader actually is when "so where does that leave the title?"
occurs to them — had none. Same component, same visual language, no second season
picker to contradict the one the page already has.

### 12. Clear focus cleared half the focus — *medium*

A driver and a key moment both dim the plot and only one of them was cleared, so
pressing it removed half the emphasis and left the reader to work out where the
rest came from. Anything that dims the plot is focus, and focus is one state.

### 13. Overlays scrolled the page behind them — *medium*

Scroll chaining is the default. The root is locked with the scrollbar gutter paid
back as padding, and every scrolling box inside an overlay contains its own
chain.

### 14. The archive could not tell a missing calendar from a missing result — *low*

Both produced "No results found for this selection" — a sentence about a
selection the reader was never able to make, under a picker showing an em dash.

---

## Fixed in V59

### 1. Light mode was unfinished, and charts were where it showed — *critical*

`lib/chartTheme.ts` was six dark-theme literals: a grey tick, a white grid line at
5.5% and a near-black tooltip. On white the grid was simply absent and the
tooltip was a black card in a daylight interface. Every value now resolves
through a variable, which Recharts writes into SVG attributes and inline styles —
both of which resolve `var()` at paint time, so the charts re-theme on the same
frame the page does.

The reported symptom — the Key Moments chart losing its line and keeping only its
points — was `RaceTimeline.tsx:159`, a spine stroked in `rgba(255,255,255,0.12)`.
Nineteen more dark-only literals across ten files were found by the same sweep and
given the same treatment, and two semantic colours that only ever existed as hex
(`#34d399`, `#a78bfa`) became `--good` and `--best` with a value per theme.

### 2. Team liveries vanished on white — *high, found in review*

Not a token problem: Mercedes, Williams and Haas are genuinely light colours, and
a 2px stroke of any of them on a 96%-white page is invisible. Lightness only,
light theme only, hue untouched — see *A livery is data; its lightness is not*.

### 3. Calm Motion was an off switch — *high*

It froze the timing screen, parked the tracker and stopped the cards. A reader who
asked for a quieter room was shown a still photograph. It is a tempo now: about a
third the speed, half the travel, longer transitions, and nothing stops.

### 4. Four settings-page controls did nothing — *high*

Pressing "Motion" filtered the list rather than going anywhere, so on a screen
tall enough to show every section at once the rail was inert. It scrolls now, and
a scrollspy brings the highlight back when the reader scrolls by hand — a rail
that only leads is half a rail.

### 5. The Live Preview claimed to be live and was not — *high*

It changed for Simple/Advanced and for nothing else, which is the worst possible
arrangement: a reader who changes density and sees nothing move concludes the
setting is broken rather than that the preview is. It is built from the product's
own tokens and locale helpers now, so theme, accent, intensity, density, text
size, units, clock, number grouping and spelling all arrive without being wired,
and changing chart animation replays the draw — the one setting a still image
cannot show.

### 6. There was no way back — *high*

Opening Settings from the middle of a race left the wordmark and two links to
somewhere else, so the session was lost. Back and Forward now sit in the bar,
counting navigations made *inside* the product — `history.length` would have sent
a reader who arrived from a search result back out of the product entirely, by a
control that looks like part of it.

### 7. The landing statistics were literals, two of them meaningless — *high*

"2026 · Season" is the date, not a claim. Derived from the archive now, and the
race count stops at the last complete season so the page cannot claim a Grand
Prix that has not been run. Closes item **B** from the standing list.

### 8. Being asked to choose an experience on every visit — *medium*

Shown until answered, then never again; Settings holds it permanently. The chapter
numerals below it are computed rather than typed, because the page is no longer
the same length on every visit.

### 9. The worked example demonstrated nothing — *medium*

A modal playing a hand-written transcript, on a page whose claim is that nothing
is invented. It now walks five real screens of a real session. Same twenty-five
seconds; at the end of them the reader has used the product.

### 10. The tutorial taught the furniture — *medium*

Four modals inside the Race Explorer, opening halfway through a session, with
nothing about asking a question, comparing two drivers, the archive or the
preferences. Ten beats across the whole product now, starting on the page that
says what it is for.

### 11. The Race Explorer scrolled sideways on a phone — *medium, found in review*

114px of horizontal overflow from a results table inside a panel that could not
shrink below it. `min-width: 0` on all four surface levels.

### 12. Tooltips fired on the first pixel of a hover — *low*

Crossing a row of six explained metrics opened six popups. A hover only means
"explain this" if the pointer stays; the wait is the reader's own.

### 13. The compound letter sat high in its circle — *low, reported*

`place-items: center` centres the line box, and a line box contains descender
space no capital uses. Given its own block, no line height, and the half-pixel
the descender was worth.

### 14. Two lint warnings, standing since V54 — *low*

Both were correct as written; both now say so in a comment rather than sitting in
the output where a real warning would be missed. Closes item **E**.

### 15. The footer was on the landing page only — *low*

Now on every page a reader can land on. Closes item **C**.

---

## Fixed in V58

### 1. The vertical wall — *critical*

`newRace()` reset seven gaps in one tick and the step then scrolled across the
screen for twenty-two seconds. New races are pre-rolled through a full window of
history before their first frame is drawn.

### 2. Everything moved together — *high*

The safety car was a global lane multiplier; every easing constant was shared.
Cautions now work through per-car pace convergence, and `paceEase`, `rankEase`
and `closeRate` are per car.

### 3. The pit stop was still near-vertical — *high*

Exponential payout dumps most of the debt in the first few frames. It is a
constant 2.5s of gap per second now — a twenty-second stop over eight seconds.

### 4. Cursor deformation broke every anchor — *high*

Removed entirely. The cursor affects light only. Also worth 41fps → 60.

### 5. Labels could flip sides and hide behind the nav — *medium*

One relationship for the whole life: right of the point, vertically centred,
with the card nudged clear of the chrome while the anchor stays on the data.

### 6. Sector pips never changed — *medium*

`sectorPhase` was a float, so writes landed on a named array property rather
than an element. Silent, and invisible to the type system.

### 7. The tracker whipped round — *medium*

Cars were on the race lap clock at two seconds a lap. They have their own
eighteen-second clock now, spread around the circuit by their gaps.

---

## Fixed in V57

### 1. The race was choreographed, so it could never surprise — *high*

A director staged overtakes by moving two cars past each other, which cannot
produce a battle that forms and holds. Cars now carry pace and gap; gaps
integrate pace differences; a pass is what it looks like when one gap crosses
another. See *Simulate the cause, not the effect*.

### 2. Another teleport, by a different route — *high*

A pit stop added twenty seconds to a gap in one frame — a vertical line through
the picture, and exactly the step discontinuity V56 removed from overtakes. Paid
out over three seconds now.

### 3. The tracker was a decoration filling a corner — *medium*

It is the same race the lines are: every car's place around the lap comes from
its gap, so the dots really are in the running order. Seven named circuits with
distinct character, a glass panel, and the field carried across a morph.

### 4. The panel re-rendered its rows instead of reordering them — *medium*

FLIP now, so a swap is something you watch. It also carries compound, tyre age,
DRS and a five-lap form trace — the things a strategist reads before the gap.

### 5. Races ran to impossible lap numbers — *medium*

Realistic lengths, a finish, a fade, and a different seven drivers on a
different circuit in different weather.

### 6. The cursor bend had a corner in it — *medium, found in review*

`sign(dy)·|dy|` is discontinuous at zero. Replaced with `u·e^(−u²)`.

---

## Fixed in V56

### 1. Overtakes formed hard corners — *high*

Not a rendering problem. `move()` seeded the transition with a position that
already contained the car's drift term, which was then added a second time —
a step discontinuity of up to half a lane at the start of every pass. Running
order and drift are separate quantities now. Lines are also drawn as Catmull-Rom
splines rather than 7px `lineTo` segments, so no join can form an angle.

### 2. The scan stuttered — *high*

It was running at 31fps while the rest of the scene got away with it, and a small
bright object crossing the screen shows every dropped frame. The cap is off; the
frame budget was found by measuring rather than guessing (see below).

### 3. V55's frame-rate figure was measured wrong — *correction*

"56fps" counted rAF callbacks, most of which returned immediately under the frame
cap. Real draw rate was about 28. Instrumenting the draw itself found the cost in
one place: the bloom composite was 5.1ms of a 7.1ms frame. Merging the two bloom
layers inside the small buffer, halving the bloom source's update rate and
dropping the grain's `mix-blend-mode` took the JS frame to 4.8ms.

### 4. The minimap car left the track — *medium*

It was animated along straight lines between the bezier endpoints, which is not
the curve that was drawn. Outline and marker now come from one segment list, and
the marker is placed by arc length so it also travels at constant speed. Layouts
morph into one another at the end of each lap.

### 5. The cluster read as a static panel — *medium*

Lap ticked once every 83 seconds, ERS cycled slower than anyone would watch, and
nothing indicated a change of position. Every readout now moves inside the thirty
seconds somebody might actually give it, and a place change shows an arrow for six
seconds and then stops.

### 6. Light mode was still legible-by-opacity — *medium*

The cluster and cards moved up one step on the ink ramp rather than getting more
opaque, the minimap went from 6% to 20%, and the phone's scrim was cut by a third
— near-black type on white never needed the same protection white type over
bright lines does.

---

## Fixed in V55

### 1. The hero was decoration that resembled data — *critical*

Seven sine composites cannot overtake each other, because there was no running
order for one to be ahead in. Nothing could ever happen, so nothing rewarded a
second look. Replaced with an actual simulation (`lib/raceEngine.ts`) where x is
time and the right edge is now — see *The hero is a simulation, not a drawing*.

### 2. Glow instead of atmosphere — *high*

Per-stroke haloes cannot pool light where lines overlap, which is the whole
difference next to any reference with real lighting. Bloom is now a screen-space
mip chain.

### 3. The hero ran at 15fps — *critical*

Two causes, neither in the drawing code. The full-screen `backdrop-filter` used
for depth of field cost 60fps → 16 on its own, because the compositor re-filtered
the entire hero every frame the canvas changed. Blurring during the full-screen
composite cost most of the rest. Both fixed; the page now runs at the cap with
the hero costing almost nothing even on a software rasteriser.

### 4. No footer — *medium, carried over from V54's open list*

Now states what the product is built on and that it is unaffiliated with Formula
1 or the FIA. For something built entirely on somebody else's sport, that line
had to be there.

### 5. The hero paragraph was three lines deep — *low*

One sentence now. The field behind it is already making the argument. The second control was
also renamed from "Explore the experience" to **See how it works**, which says what pressing
it does rather than describing a feeling.

---

## Fixed in V54

### 1. The hero read as an animated SVG, not as motion graphics — *critical*

The single most-seen surface in the product had a visible seam. Lines reached the right edge,
restarted, regenerated their paths, and jittered. Root cause was **two clocks** — a
`setInterval` mutating an array of positions and a CSS translation covering the gap — which
cannot stay in phase.

Replaced with a stateless field: every line is a pure function of position and time, sampled
each frame. No seam, no respawn, no reset, one clock. Four stroke passes per line (halo,
bloom, body, near-white core) give the fibre-optic quality the brief asked for.
See *Motion that has no clock* in DESIGN_SYSTEM.md.

### 2. Light mode was the dark theme with white paint — *high*

Most visibly in the hero, where the additive glow (`lighter`) turned to grey fog. Additive
blending only makes sense in a dark room; on white it can only desaturate.

The field now carries two recipes — emitted light on black, absorbed light (`multiply`) on
paper — and the same reasoning was applied to the ambient hero lamps, the focal-falloff pane
(which now diffuses toward white rather than toward the page grey), the chosen mode card's
bloom, and the ghost numerals. See *Emitted light and absorbed light are different recipes*.

### 3. Three feature cards looked like loading skeletons — *high*

Two of the three quick-start cards carried stacks of neutral grey bars, which is the universal
picture of content that has not arrived. On a landing page that is the worst possible reading.

The doors now carry real pictures of what is behind them — crossing position traces, three
measurements converging on one answer, a podium with the seasons receding behind it — and the
steps dropped their doodles for an oversized ghost numeral, because sequence is what a step
has to communicate.

### 4. The hero's second button competed with its first — *high*

"Why did Verstappen win?" asked a stranger to care about one driver in one race before they
knew what the product was, and it sat beside the one control that should win. Replaced with
**Explore the experience**, which scrolls to *Choose your experience* with *Quick start*
immediately behind it. The demonstration moved to the end of Quick start, as a quiet link.

### 5. A product-wide preference was repeated in the furniture — *medium*

Simple/Advanced sat in the nav bar on every page. A preference offered again on every screen
reads as unresolved rather than decided. Removed; it is now stated once on the landing page,
where it is explained and previewed, and permanently in Settings. The walkthrough step that
pointed at it was retargeted, because a tour that points at a control which no longer exists
is worse than no tour.

### 6. The page had no sense of progress — *medium*

Every section below the hero now shares one `SectionHead` — numeral, hairline, chapter word,
heading, line. `02 CHOOSE`, `03 START`, `04 ENTER`. It costs no chrome and tells the reader
how far down the argument they are.

### 7. On a phone, the hero's depth of field pointed the wrong way — *medium*

The focal falloff was a left-to-right gradient, which assumes the copy has a right-hand edge
to fall off toward. At 390px the copy is the full width, so the brightest part of the field
sat directly under the paragraph. Narrow screens now get the same idea rotated vertically.

### 8. The failure state said the same sentence twice — *low*

`DataUnavailable` printed the API's message and then a canned per-reason hint underneath it,
in two type sizes. When the API's message already contained the explanation — which is the
common case — it read as a bug. The hint now only appears when it adds something.

### 9. "75 years of history" — *low*

2026 − 1950 is 76. A landing statistic that is casually wrong undermines every number beside
it. Corrected.

---

## Open — recommended, not yet done

### 0a. Cadillac and Haas still share a colour — *low, one value away*

Audi and Alpine were corrected in V74. The third entry flagged in V73 remains: **Cadillac
and Haas both carry `#b6babd`**, so their badges are the same grey disc, and the livery is
not only the badge — it is each team's standings rail, its bars and its line on every
chart. Only the marks tell them apart, and below about 22px that is thin. Cadillac already
has `#ffc906` filed as its accent, which is the obvious candidate; it is one value in
`CANON`, and the audit script reports the clash on every run.

Left alone because a constructor's colour is an assertion, and this one has no
corroborating source in the product the way Audi's red and Alpine's blue did.

### 0b. Every mark is 48px, and fine linework is at its limit — *low*

The largest badge is 38px, which is 76 device pixels on a 2× display, so a 48px file
upscales about 1.2× there and softens. Every table row draws at 27px or less, where the
marks are at or below 1:1 and crisp.

Detail is the real constraint rather than size. The Aston Martin wings resolve to roughly
**1% opaque coverage** at 48px — almost the entire mark is antialiased edge below the alpha
cut. It renders correctly and reads as the wings, but there is nothing left to give, and it
is the one mark that would visibly improve at 96px or more. `node
scripts/check-team-logos.mjs` flags the size per file.

### A. A first visit can land on an empty product — *high, needs a product decision*

"Start exploring" goes to the Race Explorer, which fetches live timing data. When the archive
is unreachable the reader's first real screen is an error — an honest, well-built error with
alternatives, but an error. The failure handling is right; the exposure is wrong.

Recommendation: **bundle one complete sample session** and fall back to it, labelled clearly
as a sample, so the product is never empty on a first impression. This is a data decision as
much as a UI one, so it is flagged rather than taken.

### B. A phone gets the hero without the instruments — *low*

The tracker and the live timing panel are both hidden below 1024px, because at 390px a
circuit is a smudge and a timing row is unreadable. The phone therefore gets the racing lines
and the cards and none of the evidence that something is being measured. A phone-sized
instrument — one row, or a single live readout — would close it; three columns squeezed into
one would not.

### C. The guided tour cannot point at anything inside a modal — *low*

Every beat resolves a selector in the page, which is right for the ten it has. A future beat
about a dialog would need the tour to open it first, and `Beat` has no verb for that yet —
`tab` is the only drive it knows. Worth generalising the first time it is actually needed and
not before.

### D. The welcome screen is the only place the ambient field is used — *low*

`HeroField` now has two configurations and the second one has one caller. That is the right
number for now, but a loading screen or an empty state would both be better with it than with
a spinner, and the moment there is a third caller the variant list should become a prop bag
rather than a widening union.

### E. Density cannot reach px-based type — *low, by design for now*

Compact scales the root, so every rem-based padding, gap and size moves with it — but the
product also uses a lot of arbitrary px sizes (`text-[13.5px]`), and those hold still. In
practice this reads well: the layout tightens while small labels stay legible. It is recorded
because it is a decision, not an oversight, and a future ramp built entirely in rem would make
the control stronger.

---

## Verification notes

Four traps worth recording for anyone repeating this review.

**A full-page screenshot lies about a page with `vh` units in it.** Chromium expands the
viewport to the full document height before capturing, so a hero declared `min-h-[80vh]`
becomes 80% of *the whole page* — 1,722px instead of 720 — and everything below it appears to
have vanished into empty space. Scroll a real viewport and capture that instead.

**`get_by_role("button", name="Next")` is not specific enough on a page with data in it.** A
race card whose accessible name happens to contain the word resolved alongside the tour's
control and every click timed out, which reads exactly like a broken button and is not one.
`exact=True`, always.

**A dev server whose `.next` has been rebuilt under it serves a page that never hydrates.**
Running `npm run build` while `next dev` is up replaces the development chunks with production
ones, so the HTML renders, every chunk 404s, and no effect ever runs — which looks exactly like
a broken redirect, a broken effect or a broken component, and cost an hour twice now. If a
page renders but nothing reacts, check `/_next/static/chunks/main-app.js` before reading any
more code. Kill by PID (the process is `next-server`, not `next dev`, so `pkill -f "next dev"`
misses it), delete `.next`, and start one server.

**`add_init_script` runs on every navigation, not once.** A probe that seeds `localStorage`
unconditionally silently undoes anything the page stored between navigations — which made
"Replay the guided tour" in Settings look completely broken while the pref it writes was
provably correct one line earlier. Seed behind an `if (!localStorage.getItem(...))`.

**A probe that waits for "a dialog" will pass the wrong dialog.** The tour now renders a
holding card while it fetches its first route, and the first-run script broke on it — reporting
"0 beats advanced" for a tour that was working perfectly, because it had matched the holding
card's dialog role and stopped waiting. It cost a fix to a bug that did not exist before the
real one — the tour not releasing the reader — was found underneath it. Match on the specific
label (`aria-label^="Guided tour, step"`), never on the role.

**Half the product's primary controls are links, not buttons.** `get_by_role("button",
name="Start exploring")` times out on an `<a href>` that happens to be styled as a button, and
a 30-second timeout in a `try` block silently changes the timing of everything after it — which
is how a tour that only fails when started quickly looked like a tour that always worked.

**`PITWALL_IQ_MOCK_MODE=true` makes the whole product reviewable with no route to the data
providers.** Two versions were verified against the unavailable-session screen because the
backend was started without it — which is the correct screen, and not the one the work was
about. Start the API with it whenever the container has no egress: a full simulated race,
a championship table and a driver roster all render, and every surface a review needs is
reachable.

**A stand-in that is the wrong KIND of asset validates the wrong thing.** V70's hostile
shapes were opaque, so every square one exercised the composed-roundel path and the
aspect-ratio heuristic looked correct. The real assets are transparent silhouettes on
square canvases — the same aspect, the opposite case — and the heuristic was wrong for all
five. Vary what a stand-in *is*, not only what shape it is: opaque and transparent, light
ink and dark, before trusting any branch that claims to tell them apart.

**Verify a normalisation against shapes worse than the real ones.** The constructor badge
was checked with stand-in marks at 4.3:1, 1:3, 1.5:1 and composed square before any real
asset existed, which is what exposed both bugs worth having: `contain` alone leaves a wide
mark reading half-size, and a circle affords a thin mark more room than the inscribed
square does. Real F1 marks are all between 1:1 and 2:1 and would have hidden both. Build
the hostile set, put it in `public/`, screenshot, then delete it — the stand-ins must never
reach a commit, because an abstract shape in a badge looks exactly like broken branding.

**Headless Chromium reports `navigator.language === "en-US"`, so the product's first-run
default there is American.** A spelling probe that assumes British is the baseline compares
American with American, reports "0 words changed" and "British was not restored", and reads
exactly like the bug it was written to catch. Set the preference explicitly before the first
capture; never trust the state a fresh browser happens to boot into.

**A page with no convertible words on it neither passes nor fails a spelling test.** Two runs
were spent on `/explorer?tab=charts`, whose "Tyres" sub-tab only exists once a session has
loaded — and no session loads in a container with no route to the data providers. Diff whole
`innerText` between the two states rather than probing for one expected word: an empty diff
on a page with nothing to convert is then visibly different from a broken conversion.

**And the original one: headless Chromium at `device_scale_factor: 2` does not run smooth
scrolling at all.** A bare
`window.scrollTo({top, behavior: "smooth"})` on any page is a no-op there, while instant
scrolling works normally. It looks exactly like a broken click handler and it is not — check
at DSF 1 before believing it.
