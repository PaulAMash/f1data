# Pitwall IQ — design system

One product, one visual language. The test for any panel is:

> *If this panel appeared on a different page, would it still feel like it belongs?*

If the answer is no, it needs to change — not the page around it.

---

## The principle: show the number, don't narrate it

The Track Conditions panel set the direction. A line of text (`Dry · track 42–50°C`) is
accurate but inert: you have to parse it before you feel anything. The same reading as a
coloured meter, a sky glyph and a wind needle lands before you read a word.

Every informational panel follows the same order:

1. **glyph + label** — what this is about
2. **the answer** — in the largest type on the card, always `text-ink` white
3. **the visual** — the number shown, not described
4. **the caption** — one line, and only when it adds something the visual can't

A caption that restates the visual is deleted. Colour lives in the glyph and the visual,
never in a driver's name — a name must not change colour from one card to the next.

---

## Progressive disclosure: understand first, explore second

At rest, a panel shows **four things and nothing else**:

1. the label
2. the key metric
3. the primary visual (with its scale — never its essay)
4. **one** takeaway line, under about ten words

Everything else lives behind the chevron. A dashboard that explains everything at
once explains nothing: the reader should grasp a session in seconds and choose
what to go deeper on.

This is enforced by the system, not by discipline. `InsightCard` provides a
`DisclosureContext`, and `Meter`'s `hint`, `Tally`'s `meaning` and `DeltaBar`'s
`caption` render **only when the card is open**. A new card therefore cannot
accidentally ship a wall of text at rest — drop a `Meter` into a collapsed card
and it hides its own prose without the author thinking about it.

| Prop | When it shows | Rule |
|---|---|---|
| `takeaway` | always | one line, the *why it matters* |
| `detail` | expanded | the depth: how the metric is built, what to watch for |
| `action` | expanded | a labelled jump, never the whole card |

Scales (`scaleMin` / `scaleMax` / `markerLabel`) stay visible — they're a handful
of characters and without them the graphic is decoration.

---

## One interaction language

Learn one card, you've learned all of them:

* **A chevron, top-right** marks anything with more to say. Same glyph, same
  place, every time.
* **Click anywhere on the card** to open it. The whole surface is the target;
  it lifts on hover and highlights while open.
* **Navigation is never implicit.** A card never silently jumps somewhere — the
  jump is a labelled link inside the drawer (`action`), so clicking a card always
  does the same thing.
* **Dotted underline** means a definition on hover, everywhere in the product.
* **Selection beats hover**, always (see below).
* **Changing session returns you to its Story.** Practice → Qualifying → Race are
  three narratives, not three views of one; the Story is the front door and the
  deeper tabs are where you go next. Carrying "Pace" across dropped the reader
  into a table with no idea what had happened. Changing Grand Prix or season
  resets the same way; a `?tab=` deep link still opens where it points.

The `StoryPanel` follows the same contract: lede plus one beat, then
*"Read the full analysis · N more"*.

---

## The headline owns the sentence beneath it

The first supporting line of any session story must expand on the subject of the
lede. A headline about one driver followed by a paragraph about someone else
reads as a non-sequitur and costs the reader the thread. Secondary stories come
after the panel is expanded. Enforced in the backend narrative builders
(`_winner_expansion`, `_pole_expansion`, and the practice equivalent), not in the
UI — the data layer should never hand the interface a disordered story.

---

## Motion: alive, never busy

Movement earns its place by carrying information:

* **Bars grow into place** on mount (`useGrowIn`) — a measurement being taken.
  A pace board staggers its rows by ~22ms so it fills like a timing screen.
* **Sparklines draw themselves in** left to right.
* **Selected states breathe** in their own accent colour.
* **Glyph tiles lift** slightly on hover, so what is interactive says so.
* **Hover cards arrive** (`animate-tip-in`) from the direction they belong to
  rather than blinking on top of what you were reading.
* **`LiveDot`** is a still centre with a ring breathing out of it, for things
  that are genuinely happening — never decoration on a static value. The loading
  spinner is two rings at different speeds and directions; it is honest about
  progress it cannot measure, so it never fakes a progress bar.

Every animation is disabled under `prefers-reduced-motion: reduce`. Nothing loops
faster than ~1.8s; nothing moves that the reader didn't cause or that isn't
telling them something.

---

## Mini charts are charts

A small visualisation is held to the same standard as a large one. `Sparkline`
takes `meta` and renders a guide line, a lifted point and a floating card with
real rows — lap number, air and track temperature, trend, conditions. If a
graphic isn't worth making inspectable, it probably isn't worth drawing.

---

## Nothing is clipped by the thing it lives in

Two rules, and between them they close every cropping bug in the product:

* **A hover card is opaque.** Frosted glass works when the layer beneath is
  dimmed, and only then. The tyre tooltip floats over a wall of full-saturation
  yellow, red and white stint bars, where 3% translucency is enough to muddy
  every line of text on it — so hover cards are `bg-base-900` with no blur, and
  carry a colour band instead of a colour tint. Content never asks the
  background for permission to be legible.
* **Floating layers go through a portal.** `ui/HoverCard` renders into
  `document.body` at viewport coordinates, flipping above or below the anchor and
  clamping to the screen. Every panel worth explaining is rounded, therefore
  `overflow-hidden`, so an absolutely-positioned tooltip inside one is a crop
  waiting to happen — that is how the Track Conditions sparkline lost the top
  half of its card. `Sparkline`, `InfoTip` and `Term` all route through it.
* **Chart margins are never negative.** A negative `left` claws back the gutter
  Recharts leaves for the axis by pulling the plot *outside* the SVG viewport,
  which crops the axis and the first data point. `CHART_MARGIN` is the shared
  value; if a chart needs to sit tighter, the axis `width` comes down instead.
  Y axes carry `padding` so a 2.4px line on P1 isn't drawn at half weight on the
  boundary.

One trap worth writing down: a keyframe that animates `transform` **overrides an
inline `transform`**. Placement and entry animation must therefore live on
different elements — outer div positions, inner div animates. Combining them
silently drops the flip and opens the card off the bottom of the screen.

---

## Opening something moves only that thing

`InsightGrid` is `items-start`. Grid items stretch by default, so expanding one
card dragged its whole row to the new height and left the untouched cards with a
void under their last line — the reader's eye pulled to empty space in a card
they hadn't clicked.

Every drawer in the product opens on the `grid-template-rows: 0fr → 1fr`
transition (`InsightCard`, `StoryPanel`, `StrategyExplainer`), so the browser
interpolates a height nobody had to measure and the content below moves once,
smoothly, instead of jumping.

---

## Absence is a finding, not a placeholder

"Unknown", "Unknown Type" and `?` are the vocabulary of the implementation, not
of the reader. Two obligations follow:

1. **Try to recover it first.** Most placeholders are our derivation losing data
   the source did publish. A stint's compound was read off the first lap of the
   stint — the out-lap, the lap timing feeds most often leave blank — so one gap
   greyed out a whole stint. `recover_stint_compounds` fills the stint from its
   own laps and the laps from their stint, majority-wins, inventing nothing.
2. **Say what's missing, in their words.** What survives recovery genuinely was
   not recorded, so it reads "Not recorded", draws as a hatch rather than a solid
   grey block, carries a sentence explaining that the laps are real and the
   compound simply wasn't published, and is excluded from counts like "how many
   different tyres did they run?".

---

## Type: information-dense, still comfortable

Nothing meaningful renders below **11px**. Uppercase micro-labels sit at 11px;
scales and captions at 11–12px; supporting prose and drawer content at 12–13px.
A dashboard is read for hours, not glanced at once.

Contrast is held to the same standard. `ink-faint` carries every micro-label,
scale and caption in the product; at `#5f6b84` it measured **3.6:1** on the panel
surface — legible in a screenshot, tiring over an hour — so it is now `#7d8aa5`
(**5.5:1**). There is no fourth, quieter grey: `text-ink-faint/70` is a shade of a
shade, and the answer to "this should be quieter" is a different *size* or
*weight*, never less contrast. Chart axes are the same story — `AXIS_TICK_COLOR`
in `lib/chartTheme`, one value, not six inline declarations.

---

## An event's colour is what it did to the race

Grey is the colour of chrome. A beat that decided a Grand Prix must not wear it,
and an undercut must not look like the same sort of thing as a tyre gamble.
`lib/raceEvents` classifies every strategy beat by **consequence**, which is the
only classification a reader can use at a glance:

| Class | Meaning | Colour |
|---|---|---|
| `pivot` | the race turned here | amber |
| `gain` | a call that won time or places | speed teal |
| `loss` | a call that cost time or places | rose |
| `read` | true and useful; nobody gained or lost by it | violet |

Neutralisations keep their learned broadcast colours (SC orange, VSC yellow, red
flag red). One table drives the Position chart's Key Moments, the Race Story
timeline and the Strategy page, so an undercut is the same colour and the same
word wherever you meet it.

**And every moment states its consequence.** "HAM undercut on NOR" says a thing
happened; it does not say whether it worked, what it was worth, or why it is on
a list of six moments that decided a race — so the reader has no way to judge it
and skims past. `undercutStory` builds the line from the event's own data: who
was jumped, how many places, and whether it still held at the flag. A moment
that cannot state its consequence does not belong on the list.

---

## Affordance is a promise

A tester in user testing repeatedly clicked things that weren't interactive.
That is a signalling failure, not a tester failure — and the cause was that
static cards and pressable cards used the same hover treatment.

* **Lift means press.** `hover:-translate-y-px` + `cursor-pointer` (the
  `.pressable` / `button.chip` / `.pill-btn` vocabulary) appears on actionable
  surfaces and nowhere else. V45 removed it from several static cards it had
  crept onto — the segment tiles, the sector tiles, the weather phases.
* **Tint means tracking.** A quiet background change with no lift and no cursor
  change is how a long row says "you are on this line" without claiming to be a
  button.
* **`cursor-help` means it explains itself** — the timeline marks, the glossary
  terms — and never that clicking does something.

---

## Icons move when you reach for them

Never at rest: an icon that animates unprompted is a distraction; one that
animates when you reach for it is feedback. `IconTile` takes an `anim`, and each
option is keyed to what the glyph depicts, so the motion means something — a
crown catches the light, a flag waves, an arrow travels, a gauge sweeps. All of
them are one-shot, hover-only, and off under `prefers-reduced-motion`.

---

## Loading is the first impression

A generic spinner says "a computer is busy". `RaceLoader` says "you are in a
Formula 1 product" before a word of the page has rendered, which matters because
on a cold session it is the first thing anyone sees and they see it for up to a
minute. Everything in it is a real thing on a real car, drawn in SVG with no
assets to download: a slick with a coloured tread band, a five-spoke rim, a
carbon brake glowing through the spokes, tarmac running beneath, speed lines off
the back. Four motions deliberately out of phase so it never strobes.

---

## Portraits: one provider, one curated exception

The backend resolves every driver from Formula1.com's own driver listing — no
per-driver code, follows team changes, new drivers appear the moment F1
publishes them. It can only serve what F1 has published, though, so a driver
without an asset renders as initials: correct, and still a hole in a grid where
every other face is there.

`lib/portraits` is that hole filled by hand, and it is checked **first** — a
curated asset we can see beats a remote one we can't. Anything added there must
be cropped to the shipped framing (head ≈47% of the frame, ≈7% headroom above
the hair, shoulders filling the bottom edge — measured off the real assets, not
guessed) so it is indistinguishable from its neighbours at every size. Keep the
list short: each entry is a promise to maintain a photo by hand, and it should
come out the moment F1 publishes theirs.

---

## Colour carries hierarchy; grey carries everything else

A grid of cards whose glyphs were eight different colours printed all eight
labels in the same grey, so the eye had nothing to sort by. A card's micro-label
now takes `TONE_LABEL[tone]` — the tone it already wears, pulled toward ink until
it clears 4.5:1.

The rule this follows: **introduce no colour that isn't already on the surface.**
Tinting a label to match the glyph beside it costs nothing in noise and buys a
page you can scan in one pass. Inventing a ninth accent to "add interest" does
the opposite.

---

## A visual must explain itself

A bar that only shows a fill is decoration. Before shipping any visualisation,
answer all four:

1. **What is it measuring?** → the label, wired to the glossary.
2. **Against what?** → `scaleMin` / `scaleMax`. A meter without endpoints is a mood ring.
3. **Compared with whom?** → `marker` + `markerLabel` (usually the field average).
4. **Why should the reader care?** → `hint`, one line, in plain English.

`Tally` has the same obligation: `meaning` states what a single mark represents
("one mark = a sector under yellow"). `Sparkline` takes `labels` so its two ends
are named. Never present a normalised 0–100 score without saying what 100 is.

---

## Micro-learning is automatic

`Explain` wraps any string that matches the glossary in `ui/Term`, and every
micro-label in the system (`VisualLabel`, `Meter`, `Tally`, `StatStrip`,
`InsightCard`) routes through it. Consequently:

* Adding a term to `GLOSSARY` lights it up everywhere it already appears.
* Wrapping is **opt-out** (`plain`), not opt-in — the failure mode we guard
  against is jargon shipping without an explanation.
* When a label reads differently from the term it teaches, pass `term` /
  `labelTerm` with the glossary key.

If you put a Formula 1 word in front of a user, it belongs in the glossary.

---

## Composition: aligned, not templated

A page of identical tiles reads as a template and invites the eye to skim past
it. Two devices break the rhythm without breaking the grid:

* **Feature panels** — `TrackConditionsPanel` spans the full width; it is a band,
  not a tile.
* **Feature cards** — `<InsightCard feature>` spans two columns with a larger
  portrait and value, marking where a section starts.

Everything still snaps to the same columns and the same gap. Captions use
`mt-auto` so a row of cards with different content still bottom-aligns.

**Conditions have exactly one home**: the full-width panel directly beneath the
story, on Practice, Qualifying, Sprint and the Race. Nobody should re-find the
same information when they change session.

---

## Selection beats hover

When a user has deliberately selected something, hover may only *reinforce* it —
never dim it, never move it. Exploring the page must not make the chosen thing
look less chosen than its neighbours.

Neutralisations are **periods, not instants**: selecting a Safety Car or VSC
lights the whole lap range (`.moment-band`, which breathes) with both edges
marked, and every label states the range — `LAPS 34–37`, never `LAP 34`.

---

## Surfaces

Two levels, and the radius encodes which one you're on:

| Class | Radius | Use |
|---|---|---|
| `.card` / `.panel` | `2xl` | anything sitting on the page background |
| `.tile` | `xl` | anything nested inside one of those |

Nothing invents a third surface. If a component renders its own `.panel`s, the page must
**not** wrap it in another `Card` — that double-frames it. `PaceAnalysis`, `QualifyingView`,
`PracticeView` and `DriverComparison` all frame themselves.

---

## Components

| Component | Role |
|---|---|
| `ui/InsightCard` | **The** informational card. Race, Practice and Qualifying all use it — there is no per-page variant. |
| `ui/StoryPanel` | The editorial opener: kicker, lede, key-figure rail, supporting paragraphs. Replaces bulleted summaries everywhere. |
| `ui/Visuals` | The visual vocabulary — `Meter`, `DeltaBar`, `Tally`, `PositionShift`, `Sparkline`, `SectorChips`, `StatStrip`, `IconTile`. |
| `ui/StatTile` | A value with no portrait and no visual — InsightCard's quiet sibling, same surface. |
| `charts/PaceBoard` | One pace ranking for every session type. |
| `charts/TrackConditions` | Visual weather, plus `ConditionsCard` for any card grid. |

### InsightCard

```tsx
<InsightCard
  icon={<Medal size={14} />} tone="accent" label="Pole position"
  value="Max Verstappen" driver={driver} sub="1:01.095"
  visual={<Meter label="Margin to P2" value="0.058s" pct={12} tone="accent" />}
/>
```

`visual` is strongly preferred over `caption`.

### PaceBoard

One hero for whoever set the benchmark, then the field **starting at #2** — the hero never
repeats itself in its own list, while still setting the scale every bar is measured against.

`views` is generic on purpose:

* Race / Qualifying → **Drivers · Constructors** (two cuts of one metric)
* Practice → **One-lap pace · Long-run pace** (two different metrics — pass
  `prominentSwitch`)

`measures` always states what the active view is measuring, so the toggle can never be
mistaken for the other kind.

### StoryPanel

The story explains what the session **meant**; the card grid states the **facts**. If a
story line restates a card, it is removed from the backend narrative rather than hidden in
the UI — see `analysis/qualifying.py` and `analysis/practice.py`.

---

## Weather belongs everywhere

Weather shapes tyre choice, grip, long runs and pit strategy, so `ConditionsCard` appears on
Practice, Qualifying, Sprint and the Race — the same panel, never a paraphrase of it.

---

## Terminology

Use **Constructors**, not Teams, wherever it is technically correct: pace views, rankings,
charts, comparisons, statistics and labels. `team_color` and other data-layer field names
stay as the sources define them.

---

## Motion & accessibility

Animations are defined in `globals.css` and every one is disabled under
`prefers-reduced-motion: reduce`. Focus rings are global (`:focus-visible`). Meters and bars
animate width only, never layout.

---

## Diagnostics are a product surface

The panel that reports whether things are working is held to the same standard as the rest
of the app — arguably a higher one, because it is read when something is already wrong.

**Every failure is a result, never a crash.** The one card whose job is reporting
unreachable things was the one card that couldn't survive an unreachable thing: a missing
`.catch()` turned a failed probe into an unhandled rejection and a full-screen framework
error overlay. A failed check renders *in the card*, next to the checks that succeeded, and
says whose fault it is — Pitwall IQ's own backend, or an F1 source.

**A diagnostic must answer faster than the thing it is diagnosing.** Probes run
concurrently and on their own short timeout (`probe_timeout`, not `fetch_timeout`): the
endpoint costs the slowest single source, not the sum of all of them. Three 30-second
probes in sequence is a 90-second endpoint behind a button, and a browser that gives up
first reports "cannot reach the API" — which is how a slow probe came to look like a dead
backend.

**Say what failed, in a sentence a person can act on.** `adapters/probe_detail.py` is the
single vocabulary for every source. `HTTPSConnectionPool(host='api.openf1.org', port=443):
Max retries exceeded (Caused by Pr` — truncated mid-word — is a stack-trace fragment shown
to an end user. "blocked by an HTTP proxy before the request reached api.openf1.org" names
the cause *and* who can fix it. An HTTP status means the host is up and talking to us;
calling that "unreachable" is a lie, and it is the lie that cost two days of hunting an
outage that was really a bot rule on a User-Agent.

---

## "Partial data" has to be able to be false

A warning that is always on carries no information. Three separate causes had it lit on
essentially every session:

1. **Category errors.** A qualifying hour has no overtakes, no strategy pit stops and no
   lap-by-lap position trace. `_FACET_APPLIES` prunes facets a session type cannot have —
   they were never data we failed to get.
2. **A facet nobody backfilled.** Tyre stints, weather and race control exist only in the
   F1 live-timing archive, which was wired as a fallback and never as an enrichment source.
3. **Frozen verdicts.** The cache is thirty days deep, so a session fetched during an
   outage kept reporting that outage for a month. Cached sessions are healed on load and
   re-saved only when something is actually gained.

When data really is missing, the chip explains **why** (`SourceReport.missing_reason`):
a source that wasn't answering, or a year F1 never published that feed for. "Partial data"
with no cause reads as a defect in the app; the same chip naming the source reads as the
truth about the session.

**Optional enrichment must stay optional.** A source that has just failed twice is skipped
for ten minutes (`_Breaker`) rather than re-asked on every page view. The session is already
loaded before the ask, so the entire cost of a dead host would otherwise be paid by the
user, repeatedly, for the same answer.

---

## A data layer carries no server framework

`pitwall` is distributed as a single-file MCP **server script**. Its module body runs
`from mcp.server.fastmcp import FastMCP` and constructs a server, so a bare `import
pitwall` requires the entire MCP SDK — to read static JSON files over HTTPS. We are not
running a server; we are reading files.

On a machine where that SDK was missing, every archive call raised `ModuleNotFoundError`,
and the app reported **"F1 live-timing archive: not answering."** The host was fine. The
bug was ours, in our own import, for two days.

`adapters/pitwall_runtime.py` is the single owner of that import. It prefers the real SDK
whenever it loads and otherwise installs a stub covering exactly the import-time surface
the script touches. Every `import pitwall` in the app goes through `load_pitwall()` — there
were nine bare ones, which is why the same failure had nine shapes and no single place to
fix it. A test asserts none come back.

**A dependency that isn't there is a different colour from a host that won't answer.**
The status panel has three states because they need three different actions:

| | means | who fixes it |
|---|---|---|
| green — *reachable* | the source answered | nobody |
| red — *not answering* | the source is down or refusing us | wait, or check their status |
| amber — *couldn't check* | we never got as far as asking | **you**, here, now |

Amber always names the command. Rendering that third case in neutral grey as "not probed"
is precisely how a missing Python package spent two days impersonating an F1 outage.

**The server never boots silently into a degraded state.** If the archive client can't
load, startup logs a warning saying which data will be missing from every session —
because an app that starts cleanly while a whole source is dead teaches its operator that
"partial data" is normal.

---

## Motion must describe the thing that is moving

The first icon set transformed whole glyphs: a flag rotated 11°, a chart rotated 18°, a crown
scaled 118%. Every icon moved the same three ways regardless of what it depicted, so the
motion carried no meaning. A wobble is a wobble.

You cannot draw a graph left-to-right, or ripple cloth, by transforming the box the artwork
sits in. `components/ui/MotionIcon.tsx` therefore draws its own glyphs, so every part that
should move is an addressable element:

| glyph | what moves | why that |
|---|---|---|
| flag | cloth in bands, each a beat behind the last | a wave *travels*; a whole flag flapping is a lever |
| trend / chart | `stroke-dashoffset`, head held back | a line chart is *drawn* |
| timer | the hand, on `steps(12)` | a smooth sweep is a dial; a tick is a stopwatch |
| gauge | needle overshoots, then settles | a needle has mass |
| thermometer | the column, out of the bulb | on a real one, nothing else moves |
| weather | rays turn, cloud drifts across | two independent motions, as in the sky |
| crown / medal | a highlight travels through a clip | metal catches the light |
| bolt | full brightness, then decay | lightning does not fade in |

They are drop-in replacements for the lucide glyphs they succeed — same 24×24 box, same 2px
round-capped stroke, same `currentColor` — so they sit beside any remaining stock icon
without looking like a different set. Nothing moves at rest: motion begins when the reader
reaches for the card, and is removed entirely under `prefers-reduced-motion`.

**Animate a CSS property, not an SVG attribute.** `stdDeviation` on `feGaussianBlur` is an
attribute, so a `@keyframes` block naming it silently animates nothing. `filter: blur()` is
a real CSS property and applies cleanly to an SVG group.

---

## Loading is a shot, not an illustration

The wheel turned everything at one constant rate forever, which is how a machine moves. The
rewrite gives it mass: it spins **up**, holds, and eases off across a four-second phrase, and
that same phrase drives the motion blur, the brake glow and the road — which is what makes
five animations read as one object. Suspension travel is damped, the contact patch squashes
under load, and rubber smoke leaves the patch on staggered delays. No two periods divide into
each other, so the loop never lands on itself or strobes.

---

## Headline first, details second

A card at rest answers three questions and stops: **what happened**, **when**, and **why it
matters**. Key Moments used to spend two clamped lines of prose on the third, so a row of
moments was a wall of half-finished paragraphs the reader had to read *before* deciding what
was worth opening.

Why-it-matters is now a measurement — `+1 place`, `4 laps neutralised`, `22 laps` — and the
explanation opens with the drawer, which is what the chevron was already promising.

**The measurement comes from structured fields, never from parsing the sentence.** A regex
over prose is a bug waiting for the day someone rewords it. When two sources describe the
same event, the one carrying the number wins: undercuts are read before the generic insight
list precisely because only they carry `positions_gained`. And when there is no number, the
chip is absent — better than padding a card with words that measure nothing.

The same rule sends evidence to the frontend in pieces. `dotd_reason` joins three facts with
semicolons; `dotd_factors` keeps them apart, because a panel can only show three chips if it
is handed three things.

---

## Constructor identity

Teams are recognised before they are read, so the gallery leads with an emblem. It used to
spend that space on the words "2 cars" — true of every constructor since 1950, and therefore
information about none of them.

Real logos are trademarks and we hold no licensed files, so `ConstructorMark` draws an honest
one instead: a motorsport shield in the team's own livery, split by its **second** colour,
which is what separates the two teams who share a blue. Colour is how anyone identifies an F1
car at 300km/h.

It is drop-in ready. `logoSrc()` points at `/teams/<id>.svg` and the mark is **probed**, not
error-handled — an `<img>` whose src 404s fires `error` before React attaches a handler, so
an `onError` fallback loses the race and the browser's broken-image glyph plus its alt text
end up in the layout. Loading it detached means a missing asset is simply never shown. Add a
licensed file at that path and it is used immediately, exactly the way the curated driver
portrait works.

---

## Two themes, one set of names

Every colour token resolves through a CSS variable, so the whole product re-skins from one
attribute on `<html>` and no component knows a theme exists.

The load-bearing line is in `tailwind.config.ts`:

```ts
white: "rgb(var(--tint) / <alpha-value>)"
```

137 hairlines, washes and dividers are written `white/[0.06]`. On a light background every
one would be invisible. Redefining what `white` *means* per theme inverts all of them at
once, at exactly the weight they were tuned to — instead of 137 edits that would each need
re-tuning. The handful of places that mean *actually* white use `text-pure`.

The light theme is built **by role, not by inverting numbers**: 950 is the page, 900 is a
panel, and the raised steps get lighter as they rise — so `bg-base-800` still means "one
step proud of the panel" in both. A pure-white panel on a pure-white page would lose that,
which is why the page is a warm grey. Accent and speed are re-picked, not reused: `#ff3b3b`
vibrates on white and `#00e0c6` is barely a colour there.

**Theme is not read from the OS.** Motion is — reduced motion is an accessibility need, and
the OS is where people state it once for everything. Colour scheme is a taste, and Pitwall
IQ was designed dark, so a first visit opens in the identity it was built in. One click
changes it for good.

**No flash.** A blocking script in `<head>` applies the stored theme before first paint.
Reading it in an effect paints the default first and corrects a frame later, which is the
most common way a themed app gives itself away.

**Switching is a reveal, not a repaint.** The View Transitions API gives us the old frame as
an image, so the new theme grows as a circle out of the control that was pressed — cause and
effect in one gesture. Browsers without it get the plain swap; nothing is conditional on it.

---

## A rolling wheel turns at constant speed

V49's loader varied its speed across the loop and stuttered. The cause is worth keeping:
**an easing function applies to every keyframe segment, not to the animation as a whole.**
Five keyframes meant five separate ease-in-outs per loop, and because the last one eased
*out*, the wheel decelerated to a stop and snapped back to full speed at the boundary.

So the steady state is exactly one `linear` rotation — it cannot stutter, because there is
nothing in it to stutter. Momentum is expressed **once**, by a second rotation nested inside
the first that starts held back and eases to identity: the wheel spins up and then blends
into the constant roll, and because it ends at identity the loop stays perfect however long
it runs. Everything else (brake heat, suspension, smoke, sparks, rim gleam) runs on its own
period, none of which divide into the others.

---

## The landing page is three beats

Not a feature list. **What it is** — one line over a telemetry trace that draws itself once
and stops, because a looping background competes with the text on top of it. **How you want
it** — the mode choice, made by looking at two live previews of the actual panels rather
than reading two descriptions. **Where to go** — three doors, one line each.

The mode choice is the point of the page. It used to be a toggle repeated on every screen,
which asked the reader to guess what "Advanced" meant and then forgot the answer on refresh.

**Preferences are one store.** Mode, theme, motion and whether the walkthrough has run live
in `lib/prefs.tsx`, persist to `localStorage`, and apply globally. Settings is their
permanent home, and every option there is a **choice** — two cards stating what each gives
you — rather than a switch that asks the reader to guess.

---

## The walkthrough points at real things

Four steps, one line each, each spotlighting an element already on screen with the reader's
own session in it. A modal describing the tabs teaches nothing; a hole cut around the actual
tabs teaches by pointing. If a step needs a paragraph, the interface underneath it needs the
work instead.

It is trivial to leave (Escape, the backdrop, a permanent Skip), never runs twice unless
asked for again from Settings, and skips any step whose target isn't on screen rather than
spotlighting nothing.

---

## Two selections can be active at once

Opening a Key Moment used to dim the whole plot surface — including the focused driver's
line and its halo — so choosing a driver and then a moment made the driver silently
disappear. One selection was overriding the other and nothing told the reader two filters
were even on.

**A moment dims the context, never the selection.** A focused driver keeps full strength and
its glow whatever else is chosen; only the cars nobody asked about recede further. The rule
generalises: when two filters are active, they compose — the one applied most recently never
cancels the other.

---

## The token layer

Pages stopped being designed one at a time when the language moved into variables. Nothing
in the product invents a value outside these scales.

**Motion — four durations, three curves.** Timing carries meaning, so the duration says what
kind of event this is: a press must answer before you have let go (`--dur-1`, 110ms), a hover
is a response (`--dur-2`), a disclosure is a movement you watch (`--dur-3`), a room change is
a journey (`--dur-4`). `--ease-out` is the house curve — fast start, settling finish, the way
a physical object arrives. `--ease-spring` overshoots and is reserved for things that
*arrive* (a check landing, a card being chosen); on a hover it makes the interface feel loose.

**Elevation — three levels, and level is a statement.** Every panel used to carry the same
border, background and shadow, so a page of eight gave the eye nothing to sort by:

| | when |
|---|---|
| `.panel` | the default. Most things are this. |
| `.panel-raised` | one step proud — the primary panel on a screen. |
| `.panel-hero` | the one thing that matters most here. Gradient and a real shadow. **Never more than one per view.** |
| `.tile` | nested inside any of the above; radius encodes the nesting. |

Hierarchy comes from weight and space, not from louder borders.

**A press goes below rest.** `active:translate-y-0` merely cancelled the hover lift — the
control returned to where it started, which reads as nothing happening. Every actionable
surface now drops *below* rest and scales a hair, inside `--dur-1`, so the feedback lands
before the click finishes. Static information still does none of it.

---

## Nothing simply appears

`.route-in` for a page, `.rise-in` for anything arriving inside one, `.reveal` for sections
that arrive as you scroll to them — all on the house curve, so a section landing feels like
the page landing, only smaller. Route transitions live in `app/template.tsx`, which Next
remounts on every navigation (`layout.tsx` would persist and never re-run).

The motion is deliberately small. A page that slides in from the side announces itself and
gets tiring by the fourth navigation; a page that simply arrives feels like the same
application showing you something else.

**A reveal must never be able to hide content.** `useReveal` applies the hidden resting state
only after it has mounted, so a failed script or a missing IntersectionObserver leaves the
section visible the whole time. A reveal that starts at `opacity: 0` in the stylesheet is one
broken script away from an empty page.

---

## The accent is the reader's, the data's colours are not

`--accent` was already a variable, so offering a choice of accent costs a lookup rather than
a theme — five options, each contrast-checked against both themes, written as variables
rather than as ten stylesheet rules that would have to stay in step.

It retints navigation, actions and selection. It deliberately does **not** touch the tone
palette in `Visuals.tsx`. Green means a place gained and red means a place lost; if picking a
violet accent could restain a gain chip, the colour would stop being information. **A
preference may change how the product looks. It may never change what a colour means.**

---

## The hero is the product's own subject

A landing page gets one image, and a stock photograph would be decoration. `HeroVisual` draws
a Grand Prix as light: five position traces across a dark canvas, each with a bloom layer
beneath it so the strokes read as *emitting* rather than as lines painted on a rectangle,
with the annotations a race engineer would actually be watching pinned to the moments that
matter.

Three things make it read as film rather than as a chart:

- **It builds.** Nothing is on screen at t=0. Canvas, then traces drawing left to right over
  two seconds, then nodes landing, then labels — the order a shot would be cut in.
- **It breathes.** Once built, the only continuing motion is a short bright dash travelling
  each trace on a long staggered cycle, plus an 18-second drift in the ambient light. It
  never loops visibly, because a background that performs competes with the headline on it.
- **It has depth.** Bloom under, vignette over, labels floating above both.

`.build > *` applies the same idea to a whole page: children stagger in so a race assembles
itself top to bottom. The delay is capped at six children — past that the reader is waiting
rather than watching.

---

## A flourish must fail to "no flourish", never to a wrong number

The count-up statistics shipped reading **0**. They started at zero and waited for an
IntersectionObserver that, for elements already on screen at first paint, never fired. The
page confidently displayed "0 RACES" and "0 DRIVERS" about a product with 24 and 500+.

Two changes, and the second is the principle:

1. It measures `getBoundingClientRect()` on mount and counts immediately if the element is
   already in view, using the observer only for the "scrolled to later" case it is actually
   good at.
2. **The state initialises at the target value**, and the animation sets it to zero only when
   it genuinely starts. Now the worst case is a number that appears without counting.

Decoration is allowed to not happen. It is never allowed to make the product lie.

The same rule caught a second bug in the same file: the hero traces referenced `--t-accent`
and friends, which were never declared anywhere, so every stroke resolved to `none` and only
the white highlight was visible. Colours now bind to palette variables that exist.

---

## The hero is a race, not a drawing

V52's hero was five hand-written bezier paths that drew themselves once and then held still
forever. It looked good for about fifteen seconds — exactly as long as it takes to notice
that nothing is ever going to change.

V53's hero was a small race simulation: it kept an array of lap positions, shifted it left
every 3.4 seconds, generated a new column on the right, and ran a CSS translation to cover
the gap. It was a genuine improvement on a still picture, and it was still wrong — see
*Motion that has no clock* below for why, and for what replaced it.

**Seed deterministically.** The opening grid was seeded with `Math.random()`, so the server
rendered one set of lap times and the client rendered another: a hydration mismatch, which
React repairs by throwing the server's markup away. That is why nothing in a first render
may be random — a rule the current field keeps for free, because it holds no state at all.

**Depth of field, not a card.** The race spans the full width *behind* the copy, and one
`backdrop-filter` pane sits between them, masked so it is opaque behind the headline and
gone by the right-hand edge. The mask decides how much of the pane exists at each x, so the
blur itself falls off across the page — text floating in front of a living visualisation
rather than a bordered panel beside it.

---

## A hero's second button guides; it does not compete

The first version scrolled the page down one section, which is not worth a hero control. The
second — "Why did Verstappen win?" — opened `SampleStory`, a twenty-second demonstration in
which evidence arrives one beat at a time and the verdict lands only once the working is on
screen. Better content, wrong place: it asked a stranger to care about one driver in one race
before they knew what the product was, and it sat beside the single control that should win.

A hero has exactly one primary action. The second control's job is to tell everyone who is
not ready for that action where to go next — so it now says **Explore the experience** and
scrolls to *Choose your experience*, with *Quick start* immediately behind it. The
demonstration moved to the end of Quick start, as a quiet link rather than a button, at the
point where "show me" is genuinely the reader's next thought.

**Drive the scroll, don't delegate it.** `scrollIntoView` decides where to stop from
`scroll-margin`, and `focus()` during a smooth scroll moves the scroll anchor — two mechanisms
that must agree for the landing to be exact. `ExploreCue` computes the offset itself and
focuses the section only once the scroll has finished, so there is nothing to agree about.
Focus matters here: a keyboard user who presses the button must arrive at the section, not
merely watch the page move.

---

## Settings previews itself

Every control on that page changes the product, and the only way to see what a choice did
was to leave the page and go look. The control centre puts navigation on the left, controls
in the middle, and a **live preview on the right that is a real Pitwall IQ panel** rendered
with the current preferences: Simple/Advanced rewrites it, the accent recolours it, the theme
relights it, larger text enlarges it — while the reader is still deciding.

**Nothing on that page is a switch that does nothing.** The sections a bigger product would
carry (Account, Data, Notifications) are deliberately absent rather than present and dead, and
"larger text" scales the root font size so the whole ramp grows proportionally — labels and
figures included — rather than enlarging body copy and leaving the interface behind.

---

## Motion that has no clock

The hero read as "an animated SVG" rather than as motion graphics, and every complaint about
it was a symptom of one cause: **two clocks**. A `setInterval` shifted an array of lap
positions; a CSS animation translated the group to cover the gap. Two timers cannot stay in
phase, and every drift surfaced as the snap, the jitter, the visible regeneration of paths.
Worse, every path had a real beginning and a real end, so something always had to be born at
one edge and killed at the other.

The field holds no state now. Each line is a pure function of position and time:

```
y(x, t) = lane + Σ Aₖ · sin(x·fₖ + t·sₖ + φ)
```

sampled fresh across the viewport every frame. The picture moves because `t` advances, not
because anything was moved. That single change removes the entire class of defect:

- **no seam** — there is no join to hide, because there is no join;
- **no respawn** — nothing is created or destroyed, so nothing can pop;
- **no reset** — the frequencies share no common factor, so the composite never returns to a
  previous state and the loop cannot be seen;
- **no jitter** — one clock, `requestAnimationFrame`, and the sample is exact at any `t`.

**Fibre optic, not a stroke.** A line is drawn four times — a wide halo, a broad bloom, the
body, and a hair of near-white core — and a brighter packet travels each line on its own
cycle. Four passes are what make a line look like it is *carrying* light rather than being
painted with it, and that is the whole reason this is worth a canvas.

**Reduced motion still gets a picture.** Under `calm`, `t` stops advancing and the field is
drawn once — the composition survives, the movement does not. A motion preference should cost
the reader the animation, never the artwork.

---

## Emitted light and absorbed light are different recipes

The light theme "felt like the dark version with white paint", and the hero was the proof: on
paper the additive glow turned to grey fog.

That is not a tuning problem, it is a physics one. Additive blending (`lighter`) is how light
behaves in a dark room — overlaps get brighter, and a colour laid over black has somewhere to
go. On white there is nowhere brighter to go, so the same operation can only *desaturate*.

So the field carries two recipes rather than one set of opacities:

| | dark | light |
|---|---|---|
| composite | `lighter` — light is emitted | `multiply` — light is absorbed |
| halo/bloom | glow around the line | a coloured shadow under it |
| core | a hair of near-white | a second pass of the same hue, so the centre deepens |
| overlaps | brighten | darken |

The ink metaphor is exact: two multiplies of one colour give a darker centre for free, which
is why the light recipe needs no second colour. The same reasoning applies everywhere the two
rooms differ — the ambient hero lamps are nearly removed on paper, the focal-falloff pane
diffuses toward *white* rather than toward the page grey, and the chosen mode card keeps its
ring but drops almost all of its bloom, because a bloom on white reads as ink bleeding through
rather than as a card being lit.

**Rule.** When a theme looks wrong, ask whether the effect is describing light or describing
pigment before reaching for the opacity.

---

## Artwork, or nothing — never a skeleton

Three feature cards carried small chart doodles. Two of them were grey bars on a dark panel,
which is the universal picture of *content that has not loaded yet*. A landing page cannot
afford to look like it is still fetching, and a first impression is exactly where that mistake
costs the most.

The rule that came out of it: **decoration must be legible as decoration.** Anything that
resembles placeholder geometry — a stack of neutral rounded bars, a grey rectangle where text
should be — is worse than an empty card.

So the doors carry real pictures of what is behind them, each readable in about a quarter of a
second: crossing position traces; three coloured measurements converging into one answer; a
podium with the seasons receding behind it. Nothing is grey, nothing is a bar of the size and
spacing that text would occupy. The steps gave their doodles up entirely and took an
oversized ghost numeral instead — sequence is what a step has to communicate, and a numeral
communicates it without pretending to be data.

---

## Chapters, not sections

A long landing page reads as an endless one unless the reader can tell where they are. Every
section below the hero now shares one `SectionHead`: a numeral, a hairline, a one-word chapter
name, the heading, and a line. `02 CHOOSE`, `03 START`, `04 ENTER`.

It costs no chrome and it is the cheapest progress indicator there is — the reader can see how
far down the argument they are and how much is left, which is the difference between scrolling
with intent and scrolling to find the bottom.

---

## A preference is stated once, not repeated in the furniture

Simple/Advanced lived as a segmented control in the nav bar, on every page, forever. That was
the wrong rank for it twice over. A nav bar is for identity, navigation, and the controls that
change the room you are in; and a preference that is offered again on every screen stops
reading as *decided* and starts reading as *unresolved* — the interface asking the same
question over and over.

Display mode is now stated in the two places a preference belongs: **once on the landing page**,
where it is explained, previewed and confirmed, and **permanently in Settings**, alongside
theme, motion and text size. The bar keeps only the theme toggle and the way into Settings.

The walkthrough was retargeted with it. A tour step that points at a control which no longer
exists is worse than no tour at all, so the "change the depth whenever" step now points at
Settings and says what is inside it.

---

## The hero is a simulation, not a drawing

V54 replaced array-shifting with pure functions of time — smooth, seamless, and
still fundamentally decorative. Seven sine composites cannot overtake each other,
because there is no running order for one to be ahead in. Nothing could ever
*happen*, which is why the hero stopped being interesting after four seconds.

`lib/raceEngine.ts` is a small race: seven cars, a continuous running order, and
a director that stages moments into it. The renderer draws whatever the
simulation is doing and invents nothing. The consequence worth the whole rewrite:

> **X is time, and the right edge is now.**

Every car's position is recorded on a fixed 0.1s tick. The curve at any x is
where that car was `age(x)` seconds ago, read back with Catmull-Rom
interpolation. The field does not "scroll" — history simply gets older and slides
left, exactly as a live timing trace does. An overtake is authored at the live
edge and then travels the full width of the screen as a thing that already
happened, which is the difference between motion and narrative, and it is free
once time is the x axis.

**A card is pinned to a moment, not to a position.** Annotations are born at the
live edge and ride the history leftward at exactly the rate the data does,
because they are attached to a time. They retire before they can reach the
headline. Never more than two at once.

**Nothing is random in the sense a reader would resent.** The PRNG is seeded with
a constant, so the sequence is identical on the server and the client — no
hydration mismatch — and identical between reloads. It is simply long, and no two
moments carry the same parameters. A beat that fired in the last three is not
eligible to fire again.

**Pre-roll before first paint.** At t=0 every car sits exactly on its grid slot,
so the opening frame would be seven straight lines. Thirty seconds are simulated
before the first paint, then the staged moments are cleared — the hero opens
mid-race with shape already in the history, and with nothing half-finished on
screen at the moment the reader arrives.

---

## Glow is per-object; atmosphere is per-scene

This is the single largest visual difference between what we had and any
reference with real lighting in it, and it is not a tuning problem.

Every version up to V54 gave each line its own blurred copy — a halo, a bloom, a
core, drawn per path. Light in a real room is **additive across the whole scene**:
where two bright things overlap, the air between them gets brighter than either.
Per-stroke haloes cannot do that, because each stroke only knows about itself.

Bloom is now a screen-space pass, the way a renderer does it:

1. draw the scene once into a `0.42x` buffer, and once more into a `0.15x` mip
2. blur **those**, then composite both back upscaled
3. draw the scene again, crisp, on top

Light therefore pools where the field converges and thins where it spreads.

**Blur small, upscale big.** Blurring during the full-screen composite means
convolving a million pixels twice a frame. Doing it while the image is still a
`0.42x` buffer is the same picture for a twentieth of the work, because the
bilinear upscale afterwards is itself a smoothing operation. This one change was
23fps → the cap.

---

## Depth of field is the absence of the sharp copy

The focal falloff used to be a full-screen `backdrop-filter` pane in the DOM.
Measured on its own, it cost more than everything else on the page combined —
**60fps to 16** — because the compositor re-filtered the entire hero on every
frame the canvas changed.

It now lives inside the canvas: the crisp pass is painted through a horizontal
gradient that does not exist on the left, so behind the headline only the blurred
bloom survives. Same falloff, no compositing, and it is physically the correct
model — out of focus *is* "the sharp copy is missing". What remains in CSS is a
plain gradient scrim that darkens for legibility and gives the compositor nothing
to think about.

**A falloff measured in fractions of the width assumes there is a width.** On a
phone those same numbers put the entire sharp pass in the last hundred pixels and
the hero empties out, so narrow screens keep the field sharp throughout and hand
legibility to the vertical scrim instead. A depth of field needs a foreground and
a background to separate; one column has neither.

### The performance rule this produced

> Before optimising what you are drawing, check what the compositor is doing with
> it. A `backdrop-filter` or a `mix-blend-mode` over a surface that changes every
> frame is re-evaluated every frame, and it will not appear anywhere in your
> drawing code.

Grain and the vignette moved to static composited layers for the same reason:
they were being redrawn sixty times a second for a result that never changed.

---

## Thirty frames a second, on purpose

Nothing in the hero moves quickly — the fastest thing on screen is a data packet
crossing in two seconds — and film has told stories at twenty-four for a century.
Capping the render loop at 31fps halves every cost in it and is invisible at these
speeds. The simulation still advances on real elapsed time, so the race does not
run at half speed; only the drawing does.

---

## An instrument that never moves is a claim that nothing is being measured

The cluster in the corner is deliberately at the threshold of readability. Its
job is not to inform — the pages behind it do that — it is to make the claim that
something is being measured continuously, and a static number makes the opposite
claim. So every value in it is real simulation state: the gap shown really is the
gap between the first two lines on screen, and the flag really does go yellow
when the director throws one.

This is the line between atmosphere and a hacker UI. Fake numbers that scroll are
set dressing; real numbers from a real model are an instrument. The visual
language is the product's own — hairlines, tabular figures, the same tokens as
every panel — and never terminal green.

**Under reduced motion the composition survives and the movement does not.** The
field draws one frame, no packets, no cards. A motion preference should cost the
reader the animation, never the artwork.

---

## Two quantities that must never be one

`Car.pos` is where a car is drawn. `Car.base` is where it is in the running
order. They differ by the slow drift that makes the trace breathe.

Keeping only `pos` looked economical and produced the single worst artefact in
the hero: staging a move seeded `from` with a value that already contained the
drift, and the next frame added the drift *again*. Every overtake therefore
opened with an instantaneous jump of up to half a lane — the hard corner that
appeared wherever two lines crossed.

> **A step discontinuity cannot be smoothed by anything downstream.** No spline,
> no easing curve, no amount of sampling will hide it, because the data really
> does contain a jump. Fix the quantity, not the picture.

---

## Curves, not segments

Sampling a curve every 7px and joining with `lineTo` draws a polygon, and
wherever the field turned quickly the polygon showed. Lines are now Catmull-Rom
splines converted to cubic beziers, which are C1 continuous by construction: no
join anywhere can form an angle, whatever the data does.

It is also *cheaper*. 18px samples through a curve read smoother than 7px samples
through straight lines, so the fix removed work rather than adding it. The
blurred bloom pass samples at half that again — nothing survives the blur.

---

## How to measure a frame

V55 reported "56fps" for a hero that was actually drawing at about 28. The
number came from counting `requestAnimationFrame` callbacks — but under a frame
cap most callbacks return immediately, so the count measures how often rAF is
*serviced*, not how often anything is *drawn*. It is a real number about the
wrong thing.

Measure the work: `performance.now()` either side of the draw, exponentially
averaged, exposed for a probe to read. Then break it into phases before touching
anything. Doing that here found the whole cost in one place — the bloom composite
was 5.1ms of a 7.1ms frame, and everything I had assumed was expensive (the
splines, the simulation, the DOM writes) totalled under half a millisecond.

**Blend where the pixels are few.** The two bloom layers were composited onto the
full-size canvas separately: two blends of a million pixels. They are now
combined inside the 0.42x buffer and composited once — two blends of 190,000
pixels plus one of a million. Same image, a third of the cost.

### The compositor rule, restated

V55 established that a `backdrop-filter` over a surface that changes every frame
is re-evaluated every frame. `mix-blend-mode` is the same rule: the film grain's
`overlay` blend cost nine frames a second — more than the entire canvas render.
It is plain alpha now, and at five percent nobody can tell the two apart without
a difference blend.

> Anything that asks the compositor to combine a layer with what is behind it
> costs a full-screen operation per frame, and none of it appears in your
> drawing code.

---

## One source of truth, or the marker leaves the road

The minimap drew its circuit as cubic beziers and then animated the car along a
straight line between the segment *endpoints* — a different curve entirely. The
car regularly cut across open space, which says louder than anything else that
the picture is decorative.

`lib/miniTrack.ts` derives both the outline and the marker from the same segment
list, and places the marker by **arc length** rather than by curve parameter. The
second part matters as much as the first: a bezier's `t` runs fast through gentle
curves and slow through tight ones, so a marker placed by `t` surges and dawdles
around every corner even when it is exactly on the line.

Layouts share a segment count, so one can be interpolated into another. A lap
ends, the road bends into a different circuit over two seconds, and the next lap
runs somewhere else — which is the cheapest way to make a background element
nobody is looking at never repeat itself.

---

## Population, not per-object timers

Seven markers each on their own countdown drifted into phase and out again:
sometimes six packets at once, sometimes an empty screen for eight seconds. What
the design actually cares about is *how many are alive*, so that is what is
controlled — keep at least one, allow at most three, space arrivals irregularly,
never two on the same line. Nothing is synchronised because nothing shares a
clock.

The same reasoning governs the callouts: one card at a time, two to four seconds
of life against a beat every five to nine. The clean state is the common one,
which is what makes a card land when it does arrive.

---

## Simulate the cause, not the effect

V56's director decided "there is an overtake now" and moved two cars past each
other. That is a puppet show: convincing for one beat, and structurally unable
to produce the thing that actually makes a race worth watching — a midfield
fight that forms, holds, and eventually resolves.

Every car now carries a **pace**, in seconds per lap, and a **gap**, in seconds
behind the leader. The gap integrates the pace difference; positions are read
off the gaps. An overtake is therefore not an event that gets staged, it is what
it looks like when one car's gap crosses another's.

Everything else falls out of that for free:

- a leader in clean air pulls away, because clean air is worth 0.05s a lap;
- a car within a second gets DRS *and* dirty air at once, so it closes and then
  struggles — which is a battle, and battles last until the pace underneath
  them changes;
- tyre age costs time, and the compound decides how fast;
- a pit stop is twenty seconds added to a gap.

The director's job shrinks to what a commentator's actually is: **noticing what
the race did and saying so.** It checks for a real closing gap before it reaches
for a canned reading, and the OVERTAKE card is emitted by the rank-change
detector rather than by whatever decided to move the cars.

> Simulating the cause is usually less code than faking the effect, and it is
> the only version that can surprise you.

### A pit stop is not a teleport

Adding twenty seconds to a gap in one frame puts a vertical line through the
picture — the same step discontinuity that made overtakes kink in V56, arriving
by a different route. The loss is banked and paid out over about three seconds.
The rule generalises: **any quantity the renderer reads must be continuous in
time**, no matter how discrete the event that caused it.

### Position, gap, and why the lane is a blend

Lane position is `0.55 · rank + 0.45 · gap/span`, plus a small per-car breath.

Pure gap looks correct and reads badly — real gaps cluster at the front, so six
cars pile into the top third and one straggler holds two-thirds of the frame
empty. Pure rank spaces evenly and throws away every compression and escape,
which is the entire point of the model. The rank is eased rather than integer,
because an integer rank would step the lane every time two cars swapped.

---

## Reordering is information

A timing panel that re-renders its rows in the new order is an HTML table. On a
real feed you *watch* one row rise past another, and that movement is the
information — replacing it with an instant swap throws it away.

`HeroTiming` uses FLIP: read every row's offset before React commits, let React
reorder, transform each row back to where it was, then release on the house
curve. The browser animates a transform on the compositor, so a reorder costs no
layout at all — which is why it can run at 11Hz beside a canvas without touching
the frame budget.

---

## An instrument, not a caption

A label and a number is a tooltip. What a pit wall shows is a small instrument:
the reading, and the shape the reading came from. Every event card carries a
visualisation, and which one is a property of the event rather than a decoration:

| viz | what it means |
|---|---|
| `spark` | a lap-time trace — anything about pace |
| `bars` | a per-sector breakdown |
| `wave` | a continuously sampled signal |
| `gauge` | anything with a percentage |
| `pulse` | a state, not a number |
| `scan` | the system doing work |

All six are about thirty pixels wide. They are not there to be read.

**Population, not cadence.** One to three cards live at once, on different cars,
with independent lifetimes — beats every 1.9–4.3s against cards that hold
3.5–5.5s. Measured over 88 samples the histogram is 0/1/2/3 = 7/47/30/4, which
is the shape a real feed has: usually one thing, sometimes three, occasionally
nothing at all. A fixed cadence with a fixed duration is a metronome, and a
metronome is the one thing "alive" is not.

---

## The broadcast ends and another begins

A single endless race is a loop with extra steps. Races now have realistic
lengths (52–71 laps), and when one finishes the whole field fades, a different
seven drivers are drawn from a pool of twelve, and a new race starts with a new
circuit, a new lap count, new weather and new gaps. The canvas fades with the
panel, so the changeover is one event rather than two.

---

## Acknowledging the cursor without announcing it

Lines lean toward the pointer and a little extra light gathers under it. Both
ease in and decay to nothing when the pointer leaves, so a quick movement leaves
a wake rather than a jump.

The falloff has to be **smooth in both axes**, which the obvious formula is not:
`sign(dy) · (1 − |dy|/reach)` flips sign the instant a line crosses the cursor's
height and puts a V-shaped notch in it — the same defect V56 spent its budget
removing, through a new door. The attraction is `u · e^(−u²)`: odd, C-infinity,
zero at the cursor's own height and zero far from it, with its maximum in
between. There is no value of `dy` at which anything can form a corner.

It is an animation, so `prefers-reduced-motion` gets none of it.

---

## Nothing may happen to everything at once

Six lines changing direction at the same x is the single loudest tell that a
picture is generated rather than observed. A real feed cannot do it, because six
drivers do not decide anything simultaneously. Every global quantity in the hero
was therefore hunted down and either removed or slowed below the rate at which a
viewer can attribute a change to a moment.

**The vertical wall was the race changeover.** `newRace()` reset seven gaps in
one tick, and because the buffer scrolls, that step then travelled across the
screen for the next twenty-two seconds — with the old race's colours on one side
of it and the new race's on the other. A new race is now run forward for a full
window of history *before its first frame is drawn*, so the buffer only ever
holds one race, already shaped. The old race leaves with the fade instead of
being stitched onto the front of the new one.

**The safety car was a global multiplier.** `spread` eased the lane height from
1 to 0.42, squeezing all seven lines over the same six hundred milliseconds. It
is gone. A caution now works the way it actually works — through pace: each car
is asked to close on the one ahead, so the field bunches car by car, each from
its own gap, at its own rate, arriving at its own moment. Same picture, none of
the simultaneity.

**Every easing constant was shared.** Two cars easing on the same constant reach
their new value at the same instant, and a viewer reads simultaneity long before
they read values. `paceEase`, `rankEase` and `closeRate` are now per car and
spread over a factor of two and a half.

**A float index writes a property, not an element.** `sectorPhase` was seeded
with `rnd() * 3`, so `sectors[2.73] = 2` set a named property on the array and
elements 0–2 never changed — three grey pips, forever, with no error anywhere.
Any value used as an array index has to be integral at the point it is created,
not at the point it is read.

### The rule

> Before adding motion, list every quantity the renderer reads that more than
> one subject shares. Each one is a global animation waiting to be noticed.

The only survivor is `span`, the scale of the picture itself, which cannot be
per-car. It is clamped tightly and eased on a thirty-second constant — below the
rate at which any change can be attributed to a moment.

---

## The cursor changes the light, never the data

Bending the lines toward the pointer was the wrong idea however smooth the
falloff became. Anchors, stems and cards are all pinned to positions read out of
the history buffer, so deforming the drawing afterwards detached every one of
them from the value it described. **A telemetry trace that moves because you
waved at it is not telemetry.** What remains is atmospheric — a lamp that
follows the cursor — which the reader feels without being able to name it.

It also made the hero cheaper: evaluating an attraction at every spline sample
was most of the difference between 41fps and 60.

---

## A label has exactly one relationship to its point

To the right, vertically centred, for its whole life. It does not flip sides
near an edge and it does not open above or below by turns. Either would break
the only thing a telemetry label has to communicate, which is that it belongs to
*that* point and no other.

The one concession is `--lift`: when a climbing line would carry the card up
behind the navigation bar, the **card** is nudged down while the **anchor** stays
exactly on the data, and a riser covers the difference. Measured over sixty
samples the card never rose above 95px with the bar ending at 56, never left the
hero, and was never once to the left of its anchor.

---

## A readout answers "was that good for them"

Sector pips compared each car against the leader, which is accurate and useless:
three midfield rows sat permanently amber because they are, in fact, slower. They
compare against the car's **own** rolling pace now, so a midfield car can light
green for a good sector while purple stays reserved for the genuinely quickest.
The same logic governs the wear bar, which is scaled to a stint rather than to a
lap count so it spends most of its life somewhere in the middle rather than
pinned at an end.

---

## A preference earns its place when the product cannot choose for you

Settings grew from four controls to eighteen in V59, which is exactly the change
that turns a preferences screen into a junk drawer. The rule that kept it from
becoming one:

> A preference is warranted when two readers would want genuinely different
> answers and **neither is wrong**. It is not warranted when one answer is simply
> better and the product has not done the work to find it.

Celsius against Fahrenheit passes. "Tyres" against "tires" passes. "Show
tooltips" fails — tooltips should just be good. "Enable animations" fails, and is
the reason Calm exists as a *tempo* instead.

The corollary is enforced rather than intended: **every key in `Prefs` is read by
real code**, and `PREF_GROUPS` — which drives per-section reset — is declared
beside the type, so a control the reset button forgets is a compile-time concern
rather than a bug somebody notices in six months.

---

## Localisation is a rendering concern, never a data concern

Units are converted at the point of display and nowhere else. Everything
upstream of a component — the API, the simulation, every threshold and
comparison — stays in Celsius and kph, and nothing in `lib/locale.tsx` has a
setter. A converted value that leaks back into a calculation is the classic way
a units feature becomes a bug, and the defence against it is architectural
rather than careful.

### Spelling is a document pass, not four hundred call sites

Two hundred and forty-nine British spellings live in forty-one files. Wrapping
each in a helper would be a large diff **and a permanent tax**: the four
hundredth string somebody writes will not be wrapped, and the interface will be
half-American with nothing to catch it.

So the transform runs over the rendered document — after hydration, never
before, because React compares text during hydration and would report a
mismatch. Three details make it correct rather than clever:

- **Each node's authored text is cached**, so switching back restores the
  original exactly instead of applying a guessed inverse. Several classic pairs
  are not bijective in this vocabulary — `storey→story` would rewrite Race
  Story — and are excluded for that reason rather than forgotten.
- **The alternation is longest-first.** Without it `colour` inside `colourful`
  matches the short entry and the word survives as `colourful`: the classic
  find-and-replace bug, invisible in exactly the words a reader notices.
- **A MutationObserver re-applies** whatever React writes over, so the newest
  string in the product is covered without anybody remembering to cover it.

Anything painted onto a canvas has no text node to observe, so `sp()` is
exported for those.

---

## Calm is a tempo, not an off switch

`prefers-reduced-motion` and a reader who wants a quieter room are two different
requests, and V58 answered both with `animation-duration: 0.01ms !important`.
That is right for the first and wrong for the second: it froze the timing screen,
parked the tracker, stopped the cards arriving, and showed a reader who asked for
calm a **screenshot of a product that had been alive a second earlier**.

Two numbers carry the whole difference now. `--m` stretches every ambient period
— each loop in the stylesheet states its own as `calc(<base> * var(--m))` — and
`--amp` shortens how far the largest of them travel. The canvas reads the same
constant. Transitions get *longer* under Calm, not shorter: the old rule made the
interface snappier under a setting whose name promises the opposite.

Measured: the race advances about a third as fast, the idle chevron cycles at
7.6s instead of 2.8s, and nothing stops.

| | prefers-reduced-motion | Calm |
|---|---|---|
| what it means | an access requirement | a preference about pace |
| ambient loops | stop | ×2.7 slower, ×0.45 travel |
| the simulation | frozen | 0.37× tempo |
| transitions | instant | longer, no overshoot |

---

## A statistic that has gone stale undermines every number beside it

The landing band read `2026 · Season`, `24 · Races`, `500+ · Drivers`. Two of
those were the wrong *kind* of statistic before they were the wrong number: the
year is not a claim about this product, and a reader deciding whether to trust an
archive learns nothing from being told what today's date is.

They are derived now — `1,149 Grands Prix`, `77 seasons`, `24 races this
season` — from `backend/app/archive_scale.py`, which counts them from one table
of reference data and the current date. The race count stops at the last
**complete** season, so the page can never claim a Grand Prix that has not been
run. If the backend is unreachable the band falls back to the single figure a
calendar alone can prove.

> A flourish may fail to *no* flourish. It may never make the product wrong.

---

## Teach with the product, not with a picture of it

Two features were the same feature done badly.

The **tutorial** was four modals inside the Race Explorer that taught the
furniture of a screen to somebody who had not yet been told what the product was
for. The **worked example** was a modal playing a transcript of an answer being
assembled — a good short film that demonstrated nothing, because not one pixel of
it was the product, and every figure in it was written by hand on a page whose
whole claim is that nothing is invented.

Both are now one engine (`lib/tour.tsx`) driving the real interface. A beat names
the page it belongs to, the element on that page it is about, and one sentence
about **why that thing exists**. The engine navigates, waits for the target,
scrolls it into view and cuts a hole in the scrim around it.

Nothing is illustrated and nothing is re-implemented, so the tour cannot drift
out of date: if a control moves the spotlight moves with it, and if a control is
removed the beat is skipped rather than pointing at nothing.

Three things it took two rewrites to get right:

- **A missing target is derived, never stored.** A `missing` flag never cleared
  while the next beat was resolving, so the skip fired repeatedly and the tour
  raced from beat two to the end in one frame.
- **A late target is not a missing one.** On a page whose job is fetching a
  session, "not rendered yet" is the common case. It waits three seconds —
  longer than any render, shorter than anyone's patience — before deciding.
- **A target taller than the window has no outside.** "Below it" is off the
  bottom and "above it" is off the top, and the card was being placed at a
  negative offset: present, invisible, un-pressable. A large target is docked to
  rather than pointed at.

The scrim is `pointer-events: none` with the card `auto`, so the control being
explained stays live under the spotlight.

---

## A livery is data; its lightness is not

Formula 1's team colours are chosen to read on a dark broadcast graphic, and
several do not survive being put on white — Mercedes' petrol green, Williams'
pale blue, Haas white. A position chart where four of twenty cars have no visible
line is not a chart.

The fix is **not** to recolour the teams. A livery is how the reader identifies a
car without a legend; swapping Mercedes to navy because navy shows up better
invents a fact about the sport. `lib/liveryColor.ts` adjusts lightness only, only
in the light theme, and only far enough to clear a contrast floor — hue is never
touched, and saturation is nudged back up because a colour darkened without it
reads grey. Dark mode passes the livery through untouched, which is the point of
only doing this on the theme that needs it.

---

## `min-width: 0` is load-bearing on any container

A grid or flex child defaults to `min-width: auto`, which means it refuses to
shrink below its content. A panel containing a wide results table therefore grows
to the table's full width and the `overflow-x-auto` inside it never gets the
chance to scroll — on a phone the Race Explorer was 114px wider than the screen
and the whole page moved sideways.

Declared on `.panel`, `.panel-raised`, `.panel-hero` and `.tile`, which fixes the
class of bug rather than the instance. A container that cannot be narrower than
its contents is not a container.

---

## What the hero actually costs, measured honestly

The V58 notes recorded 60fps. Re-measured in this environment against the same
build, V58 draws at **24.7fps** and V59 at **24.2** — the figure had been taken
some other way, and repeating it would have been repeating a number rather than a
measurement.

Instrumenting the frame by phase gives 6.2ms of JavaScript at 1440×900:

| phase | ms |
|---|---|
| bloom composite (upscale + `lighter`) | 2.63 |
| the tracker | 1.49 |
| bloom source | 1.01 |
| ambient room | 0.72 |
| crisp pass + DOM | 0.35 |

Six milliseconds inside a sixteen-millisecond budget, and still 24fps — so **the
ceiling is rasterisation, not our code.** Canvas2D records commands and defers
the work, which is exactly why `performance.now()` around draw calls under-reports
and why a JS profile alone would have sent the next hour in the wrong direction.
Headless Chromium here rasterises in software; the same page on a GPU is a
different measurement entirely.

> Two ways to be wrong about a frame rate: counting rAF callbacks instead of
> draws (V55), and trusting JS timings around deferred draw calls (this one).
> Both over-report, and both are only caught by measuring the thing itself.

---

## A first screen has one job

The choice between Simple and Advanced was a band a screen and a half down the
landing page: underneath a headline, five statistics and a scroll. So the first
decision the product asks for was the third thing on the second screen, and a
reader who never scrolled never made it.

It has a screen of its own now, and what is **absent** from that screen is the
design. No navigation, no statistics, no race cards, no scroll — because every
additional thing on a first screen competes with the one job it has. Even the
instruments are gone: the field behind it is the same renderer the landing hero
uses, in an `ambient` configuration with the tracker, the timing panel and the
event cards switched off.

> The instruments **are** the product. Showing them before somebody has said
> what kind of reader they are is exactly the overwhelm the screen exists to
> avoid.

One renderer, two configurations, rather than a second canvas — a second
implementation is a second place for the lighting, the bloom chain and the
simulation to drift out of agreement, and the welcome screen's whole promise is
that it is the same product.

---

## A tour starts when the reader says so

V59's tour opened itself 1.4 seconds after the landing page loaded. It taught
the right things in the right order and it took the page away from somebody who
had not finished looking at it — and the first thing a landing page has to be
allowed to do is *be looked at*.

Pressing the primary control is an unambiguous "I am ready to begin", so that is
where it begins. Three consequences, and each was a bug the first version had:

**Scrolling is locked, but only the reader's.** `overflow: hidden` on the body
would also stop the tour scrolling, which is the one thing that still has to
work. So the *input* is blocked — wheel, touch and the scroll keys — and
`scrollIntoView` is untouched, because it is not an input event.

**Move first, then speak.** The card used to render as soon as its target had a
box, while the page was still smooth-scrolling toward it: it appeared, slid,
resized and settled inside the half-second the reader was trying to read it. The
"choppy" report was three correct behaviours arriving at once. The spotlight
follows the scroll because it is attached to the thing being scrolled to; the
card waits for two consecutive frames at the same offset and then fades in where
it will stay.

**Finishing and leaving are the same event.** Both mark the tour done and both
land on Explore. The last beat is Settings, so seeing it through used to abandon
the reader on a preferences screen holding no session — the least useful room in
the product to be left standing in. Skip is a reader saying "I would rather just
get there", and it should get them there too.

---

## Back is a structure, not a history

The bar's back control walked the reader's own history of in-app navigations. It
was correct, and it was the wrong model: after Explore → Historical → Settings →
Compare, getting home took five presses and no one press was predictable.

Pitwall IQ has a structure and it is one level deep. Home is the parent; Explore,
Historical and Settings are siblings under it. So Back means the only thing it
can mean here — **up** — and the deepest it can ever be is one press.

Forward went with the history stack. Forward through a structure is not a
direction, and a control that is meaningless half the time is worse than no
control.

> `history.length` is not the application's history. It counts every page the
> tab has ever visited, so a reader who arrived from a search result and pressed
> a control that looks like part of the product would have been sent back out of
> the product.

---

## The rule that produced the future-race bug

A reader picked the Brazilian Grand Prix in August and got an empty session. The
tempting fix is to filter the picker. The actual fault is one level up:

> `event_completed` was already the server's answer to "has this happened", and
> exactly one caller asked it.

Both calendar endpoints returned whole seasons. The Race Explorer offered every
round; Historical offered every round; and neither client knew it was supposed
to care. Three copies of one decision, none of them written down.

It is stamped onto the model now — `GrandPrix.completed`, set in one function
that every calendar passes through — so the answer travels with the data and no
client re-derives it. Three things follow from that, and the third is the one
that matters:

1. The Explorer's picker offers only races that have been run.
2. Historical's picker offers only races that have been run, from the same stamp,
   so the two lists cannot disagree.
3. **A selection is never allowed to outlive the list.** The choice can also
   arrive from a `?gp=` link or from state a back navigation restored, and
   filtering a dropdown does nothing about either. If what is selected is not on
   offer, the Explorer snaps to the most recent race that is.

The demo obeys the same rule. The mock calendar had no dates, so every fixture
event counted as run — a real bug wearing the costume of a data problem. Rounds
are now spread across a plausible season, which puts the back half of the
calendar in the future for most of the year exactly as a real one does.

---

## Leaving the native `<select>` behind, and what it costs

Natives are excellent at three things — keyboard, accessibility, and never being
wrong on a phone — and hopeless at the one thing this product is about. The menu
is drawn by the operating system: platform radius, platform type, platform
shadow, platform placement. On a page built out of 13px Inter and soft shadows it
reads as a hole punched through to another application. Chrome also opens it
*upward* whenever the trigger is in the lower half of the window, which is why a
season picker near the fold covered the heading it belonged to.

So the whole cost of replacing it is paying for those three things explicitly:

| what a native gave us | what replaces it |
|---|---|
| arrow keys, Home/End, Enter, Escape | handled; plus type-ahead, because a 24-race calendar is a list you type at |
| a menu the screen reader understands | real `listbox`/`option` roles and `aria-activedescendant` |
| a menu that is never clipped | portalled to `<body>`, so no `overflow-hidden` ancestor can cut it |
| a menu that fits on screen | measured against the viewport: down unless it genuinely does not fit, and `max-height` is what is actually available rather than a constant |

It is not a modal, so it closes on scroll rather than following the trigger. A
menu that rides the page while you scroll is a menu you have to dismiss.

---

## A preview that is not representative is worse than no preview

Settings had a LIVE PREVIEW panel built from the product's own tokens. That made
it honest and did not make it useful: a miniature of one card cannot show what
density does to a timing screen, what motion does to the hero, or what chart
speed does to a chart — so a reader still had to leave the page to find out. It
was also the third column of a three-column layout, squeezing eighteen controls
into the middle third.

The right answer to "is this representative?" was no, and the right response to
that was to take the space back.

**What replaced it is the settings actually being felt.** Every axis reaches
further than it did: density retimes the row rhythm of every table as well as
the type ramp, accent intensity reaches all five accent-lit surfaces rather than
the page wash alone, chart speed drives every bar and trace through one variable,
and Calm is a tempo rather than a switch.

> A setting that changes one of five surfaces reads as broken. The reader is not
> wrong; they are reporting that four of them did not get the message.

---

## Colour is how you recognise a car

The archive was the one screen in the product where colour did no work at all: a
classification was eight grey columns, and championship standings were a grey
list with a bar that was accent for first and teal for everyone else. In a
product whose entire visual argument is that a livery is how you identify a car
without a legend, that is the wrong screen to make plain.

Three changes, all hierarchy rather than decoration:

- **The livery is the row's left edge**, so a reader scanning twenty rows for
  their team finds it before reading a word.
- **The podium is the headline.** A classification is read from the top, so the
  first three carry more weight; everyone else is a list, which is what everyone
  else is.
- **The bar is a gap, not a score.** Scaled to the leader, so the picture is
  "how far behind" — which is what a championship table is actually about, and
  why the leader's bar is always full.

Standings are one component now, because the Race Explorer needs exactly this for
the season in progress. Two implementations of a championship table would be two
places to fix the next time one of them is wrong.

---

## Scroll chaining is the default and it is never what you want

An overlay taller than the window is the common case. When the pointer is over
it the wheel should move the overlay; when the overlay reaches its end, nothing
should happen. What happened instead was the page underneath taking over, so the
reader's content slid away behind a dialog they had not dismissed and was in the
wrong place when they did.

Two halves, and both are needed. `overflow: hidden` on the root stops the page —
and shifts the whole layout left by the scrollbar's width unless the gutter is
measured and paid back as padding, which is a worse artefact than the one being
fixed. `overscroll-behavior: contain` on the overlay's own scrolling box stops
the chain from the other side, and belongs to the overlay because only the
overlay knows which of its boxes scrolls.

---

## `.panel` had one job and could not do it

A grid or flex child defaults to `min-width: auto` — it refuses to shrink below
its content. So a panel containing a wide results table grew to the table's full
width and the `overflow-x-auto` inside it never got the chance to scroll: on a
phone the Race Explorer was 114px wider than the screen and the whole page moved
sideways.

Declared on all four surface levels, which fixes the class rather than the
instance.

> A container that cannot be narrower than its contents is not a container.

---

## A tint behind twenty opaque bars is not a tint

The safety-car band on the tyre chart was painted *behind* the stint bars. Twenty
rows of full-saturation yellow, red and white cover the plot almost edge to edge,
so the only place it ever showed was the 4px gaps between rows — which is the
same as not painting it at all.

The obvious fix is worse. Moving the tint in front recolours every compound it
crosses, and compound colour is the one thing that chart exists to encode.

So the neutralisation is told in three registers, none of which competes with the
bars:

* **The rail** — a track-state strip above the plot, on the same lap scale. Green
  where the race was racing, a solid SC/VSC/RED capsule where it wasn't. This is
  the part you can read from across the room, and it costs the plot nothing
  because it is not in it.
* **The hatch** — diagonal stripes over the bars, in the event's colour. Stripes
  have gaps, so the compound underneath still reads. It is the same texture the
  "tyre not recorded" bars already use, so the reader has met it before.
* **The edges** — a hard rule on the window's first and last lap, above
  everything, so *when exactly* is answerable to the lap.

Hovering a capsule raises the hatch and lights both edges, and says how many cars
took a cheap stop inside the window — which is the only reason a tyre chart draws
safety cars in the first place.

> If a layer cannot be seen, moving it forward is not the only option. Say the
> same thing somewhere it has room.

---

## A marker that answers "yes, something happened here" is not finished

The undercut mark was an 11px `▲` in a text node with a `title` attribute. On a
wall of yellow it was invisible; when found, it said "Undercut attempt", which
tells a reader who already knows what an undercut is that one occurred.

It is now a stemmed marker on the exact lap of the stop, coloured by whether the
move actually **worked** — teal if it did, rose if it did not, which is a fact the
data already carried and the chart was throwing away. Hovering it explains the
mechanism in one paragraph *and* what it was worth in this race, with this race's
lap numbers, from `undercutStory()`.

Two details that are not decoration. The head is stroked in `rgb(var(--base-900))`
with `paint-order: stroke`, so the stroke renders under the fill: the marker cuts
itself out of whatever compound it lands on — white, yellow and red all sit under
it — without the halo eating half of a 12px triangle. And it is a `<span>` with
`role="img"`, not a `<button>`: the row it lives in is already a button, and a
button inside a button is markup React refuses to hydrate.

> A chart that can explain itself is worth more than one that can only be read by
> someone who already knows.

---

## The FIA feed is an instrument, so draw an instrument

Race control was a stack of rounded cards: every neutralisation dumped at the top
in a box, then every message underneath in another box, each padded like a
notification. Two things were wrong and neither was styling.

**It was out of order.** Windows first, messages second, so the safety car sat
above the green flag that preceded it. A log whose rows are not in time order is
not a log. They are now one chronological feed; a message with no lap stamped
inherits the lap of the message before it, because the feed is chronological and
"no lap" means "still on that lap", not "unknown".

**It was unscannable.** Proportional text, no column for the lap, no way to see
only the flags. It is now fixed-width with a lap column that forms a column, a
three-letter status tag in the broadcast colour, neutralisations spanning the feed
as banners where they happened, and filters that only appear for groups the
session actually contains.

Two things fell out of building it. The black-and-white flag — a formal warning
for unsporting driving — arrives in the *flag* field, not the message, so reading
only the message classified the most consequential signal in the log as a note.
And the broadcast colours are used here as **text**, which is the case they were
never designed for: VSC yellow is legible as a band across a dark plot and
illegible as 9px type on white, so the tags go through the same lightness clamp
the liveries do.

> Dense on purpose. The room this belongs to is a pit wall, not an inbox.

---

## "Why was it decisive" has a finite number of answers

A strategy card could say *what* happened and, when the backend had one, a
sentence of general context. Neither answers the question a debrief exists for.

Races are not decided by stops. They are decided by four or five recognisable
mechanisms, and once a reader can name them they start seeing them unprompted in
the next race they watch: safety-car timing, the undercut, track position across
the pit cycle, and the tyre offset at the flag.

Every mechanism in `lib/decisive.ts` is **detected**, never assumed — each one is a
claim about this session checked against this session's pit stops, position
trace, stints and classification. A mechanism that cannot be verified is not
stated, and a card with nothing detectable falls back to the explanation it always
had.

Three rules emerged while building it, and each one came from the code being
wrong first:

* **Two laps after a stop is the middle of the pit cycle, not the end of it.**
  The cars ahead have not stopped yet, so the driver is always behind — and the
  card announced that a successful undercut "traded track position" directly
  below the undercut it won. The cycle closes when every car that was ahead has
  taken its own next stop, bounded by this driver's next stop and by fifteen laps.
* **A mechanism must belong to the moment it is attached to.** A card about a
  driver's long closing stint was carrying the undercut they pulled forty laps
  earlier, which taught the reader that the tag means nothing.
* **Do not tell two stories about one stop with opposite signs.** Where an
  undercut already answers "what did the pit cycle do", the track-position line is
  suppressed. The more specific claim wins.

> A card arguing with itself is worse than a card that says less.

---

## An empty state is a question, not a hole

Compare opened on two drivers it picked itself — the two quickest on corrected
pace — and presented their duel as though the reader had asked for it. That is a
comparison nobody chose, sitting exactly where the reader's own question should
be, and its most common effect was to make people think the page was already
showing them what they wanted.

It opens empty now, and the empty state does the three things an empty state
owes: it says what the page is for, it shows the two slots waiting to be filled,
and it offers the duels **this session actually contains** — the fight for the
win, the teammates who cannot blame the car, the closest finish on the road, the
two quickest on pace. Each is derived from the classification in front of it, so
the shortcuts are about this race rather than a generic "try comparing two
drivers".

When one side is already chosen — a reader who arrived from "deep dive on
Leclerc" — the question changes to *against whom?*, and the three answers always
worth offering are the same car, the car in front, and the car behind.

> A page that answers a question nobody asked has spent the most valuable space
> it has.

---

## A modal state with no affordance is the one state a modal may never be in

The tour locks scroll **input** from the moment it starts — deliberately, so a
reader cannot slide the highlighted control out from under its own spotlight. The
card, though, waits for its target to render, and the first beat of a tour started
from the landing page has to fetch a whole route first.

Between those two moments the product was a page that would not scroll, with no
card, no scrim and nothing to press. On a warm route it lasted 180ms and nobody
saw it. On a cold one it was a locked screen.

After 700ms of waiting the tour now admits it is working — and, the part that
actually matters, offers the way out.

The same review found the other half of the same mistake. The scrim is
`pointer-events-none`, so the nav bar stays live during a tour, which is right.
But the tour then saw a path that was not its own and pushed the reader straight
back: Back appeared to do nothing, because every step out was answered by a step
in. Walking away from a tour ends it, marks it done, and leaves the reader on the
page they chose.

> Locking input is a promise to draw something. Make the second half of that
> promise unconditional.

---

## The spelling bridge only converts what was authored on one side

Two hundred and forty-nine British spellings are transformed into American at
render. The transform runs one way — authored British → rendered American — which
means a string authored *American* is American in both settings, and a British
reader gets "neutralization" in an otherwise British interface. Four surfaces had
it.

The fix is two lines and one habit: add the stem to the dictionary, and author
British everywhere. The glossary keeps keys for both spellings, because it is
looked up on the **authored** text and the bridge rewrites the rendered document,
not the source.

> A one-way transform makes the authoring side load-bearing. Say so out loud, or
> it drifts.

---

## Three pages, three jobs

The landing page was doing two jobs badly. It had to be the argument for the
product *and* the place a stranger was introduced to it, and those want opposite
things: an argument wants to be looked at, an introduction wants to be answered.

Split, they are each obvious:

* **Welcome** — "What is Pitwall IQ?"
* **Home** — "This looks incredible. I want to explore."
* **Explorer** — "Now teach me the race."

Everything else in this pass follows from that split. The welcome screen can
afford to explain, because nobody is trying to read a race on it. The home page
can afford to be pure spectacle, because nothing is being asked of the reader
there. And the tour can start on the Explorer, because by the time anybody
reaches it they have already said they want one.

> A page that has two jobs will do the less interesting one first.

---

## Two acts, one screen

The welcome screen introduces, then asks. Those are sequential — the setup has
no meaning before somebody knows what they are setting up — but they are **acts,
not pages**: no route change, no scroll, no history entry to get lost in. The
first act lets go and the second arrives in its place.

A wizard that spreads four decisions over four URLs is the thing every
onboarding worth copying spent years learning not to build. The reasons are
concrete: each URL is a place the back button can strand somebody, each
transition is a full page load, and the count of steps becomes visible and
therefore daunting.

Both acts stay mounted, so the container has to be told which of the two heights
to be. Reserving the taller leaves a screen of void under the shorter; letting
the page reflow makes everything below jump. Measuring the live act with a
`ResizeObserver` and animating between the two heights is the only version where
nothing moves that should not.

> Sequence is a rhythm, not a routing table.

---

## Every question is pre-answered

The primary control on the setup act is live from its first frame. A setup
screen that refuses to let you leave until you have touched three things is a
form with a progress bar, and it teaches the reader that the product is going to
be work.

So all three questions arrive answered: Simple, whichever theme the browser is
already in, and yes to the tour. Every card is a confirm-or-change rather than a
blank waiting to be filled. The defaults are not "whatever was first in the
list" — they are the answers we would give.

The corollary is that selection has to read instantly at a glance, which is why
the chosen answer gets a ring, a filled tick and a half-pixel lift. And why only
the *first* question keeps the full coloured halo: three lit cards down one
screen is three things shouting, and the depth question is the one that changes
what the product is.

> Ask three questions and answer them yourself. Let the reader disagree.

---

## One choice is felt rather than described

Choosing the theme changes the welcome screen underneath the press, through the
same circular reveal Settings uses — including the canvas behind it, because the
field reads its colours from the same variables everything else does.

It is the single most convincing thing a first run can do. The product responds
before it has been entered, the preview and the result are the same object, and
the gesture the reader will meet again in Settings is already familiar.

This is also why the theme question could leave the navigation bar. A toggle in
the chrome is a preference pretending to be a tool: it takes permanent space at
the top of every page to hold an answer that is given once. Asked properly on
the way in and kept permanently in Settings, it needed no third home — and the
bar lost the second competing gesture in its corner.

> A preference is best explained by doing it.

---

## The tour waits, and says so

A reader who asked for a guided tour lands on the home page and **nothing happens
to them**. That is the feature, not an oversight.

The home page is the argument for the product. Opening a modal over it two
seconds in takes the argument away before it has been heard — and the reader has
not seen a single thing the tour is about to describe, so the first beat lands on
somebody with no context and no reason to care.

Instead the tour attaches itself to the one control the page already wanted
pressed, and waits there indefinitely. Three parts, in decreasing loudness:

* a pill above the control — *Your guided tour starts here*
* a ring around the control that breathes, and is the **only** thing on the page
  doing so. The standing rule that nothing may happen to everything at once is
  exactly what buys this one element its authority
* a line underneath: *have a look around first — nothing begins until you press
  it* — and a way to decline

Under reduced motion the ring stops breathing and stays drawn. It is
information, not decoration.

The invitation belongs to the answer, not to the visit: it is gated on the tour
having been asked for and not yet taken, so declining removes it forever and
"Replay the guided tour" in Settings brings all of it back.

> An invitation that can be ignored indefinitely is worth more than a modal that
> cannot.

---

## A redirect in an effect is a redirect the reader watches happen

The first-run gate was a React effect on the landing page: render, hydrate,
notice that nobody has been welcomed, redirect. Every one of those steps happens
*after* the browser has painted — so a brand-new visitor got the home page,
headline and hero canvas and all, and was then yanked off it. The welcome screen
was not the first thing anybody saw. It was the second.

The product already had the right mechanism and was using it for exactly one
thing: `NO_FLASH_SCRIPT`, a parser-blocking script in `<head>` that applies the
stored theme before the body is parsed. That is precisely the window a gate
needs. `location.replace` from there aborts the document load, so nothing of the
home page is ever built and there is nothing to flash.

Two details that are not incidental:

* **Only the root is gated.** A first-time visitor who followed somebody's link
  to a specific race should land on that race — dragging them to a welcome
  screen throws away the thing they clicked, and they will meet it the first
  time they press Home. "Opening Pitwall IQ" means the front door.
* **The React effect stays.** The head script cannot run on a client-side
  navigation, which is exactly what happens after Settings puts the flag back.
  Two layers, each covering the case the other cannot.

> If the correction happens after paint, it is not a gate. It is a flicker with
> an opinion.

---

## The first screen cannot be a preview of the second

The welcome screen borrowed the landing page's hero renderer in a cut-down
"ambient" configuration. One renderer, no duplication, theme-aware for free —
every argument for it was an engineering argument, and all of them missed the
point.

The racing line **is** the home page. It is the thing a reader is supposed to
meet when they arrive there, and spending it one screen earlier means the home
page opens with something already familiar. The reveal was being sold off to
save a file.

So the welcome screen draws its own room, and it draws no race: no lap trace, no
running order, no timing, no data of any kind. Nothing on it can be read, because
there is nothing on it to read. What it has instead is lighting — three large
soft sources drifting on slow incommensurate paths, and one hairline lattice
erased toward the edges, which is the operations-terminal note spent exactly
once.

The variant came out of `HeroField` rather than being left to be reused by
mistake, and the welcome route stopped shipping the race simulator with it:
**111 kB → 96.3 kB** first load.

> Shared code between two screens is a good idea right up until the thing being
> shared is the surprise.

---

## Light is additive in a dark room and subtractive on paper

The lamps composite with `lighter`, which is correct on black: two overlapping
sources make the air between them brighter than either, and that additive
overlap is the entire difference between "lighting" and "a gradient".

Run the same code on white and every lamp pushes toward white. The light theme
went pink and hazy, and the cards sitting on it stopped having edges.

The light theme paints its own opaque base and **multiplies** into it, which is
what coloured light actually does to a white surface. Same lamps, same paths,
same palette, the opposite operator.

A related fix in the same pass: the third lamp was amber, and amber added to the
accent gives brown — the one colour a room like this cannot have. It is violet
now, which stays a colour wherever the red reaches it.

> A blend mode is a physical claim. Check which room you are claiming it in.

---

## The page does not change because of an answer given elsewhere

An earlier version put a pill above the *Start exploring* control and a
breathing ring around it, to announce that a guided tour was waiting. It was
well meant, it was thoroughly verified, and it was wrong.

The home page has one job: be looked at. A page that is decorated differently
depending on something the reader said on a previous screen is a page
apologising for itself — and the decoration was the only thing on it that
existed to serve a *different* page's feature.

The home page is now identical whether a tour is armed or not. The tour is a
consequence of pressing the control, not an advertisement wrapped around it.

> If a feature needs the page to announce it, the feature is in the wrong place.

---

## Atmosphere may be invented. Assertions may not.

The welcome screen is now a room with instruments in it — a telemetry feed, a
race-control readout, a pace delta, a tyre window, a data stream, the field.
Which raises the question this product has to answer more carefully than most:
where does a decorative number stop being decorative?

The line is **whether it makes a claim**.

* A trace sweeping a circuit, a lap counter, a sector time, a tyre window: these
  are the *shape* of a session, in exactly the category the landing hero has
  always occupied. None of them names a real Grand Prix, a real time or a real
  driver's result. Nobody can be misled by them because there is nothing in them
  to be misled about.
* "CONNECTED", "SYNC 100%", "1,149 RACES": these are claims about **this system**.
  A reader can act on them. So the SYSTEM panel is the one panel that goes and
  checks: it calls the real archive endpoint on mount, prints the real figures,
  and when the call fails it says OFFLINE rather than inventing a green light.

That last part turned out to be the best thing on the screen. The handshake
resolving from ACQUIRING to ARCHIVE READY · 1,149 · 1950–2026 is more convincing
than any fabricated readout could have been, because it is the one part of the
composition a reader could catch being honest — and it is.

> Decoration that cannot be checked is fine. Decoration that could be checked
> and would fail is a lie with a nice typeface.

---

## Two canvases, because they want different resolutions

The room is lamps: three large soft sources, nothing in it with an edge. The
feed is hairlines: telemetry traces, packets, a ghosted circuit, a radar sweep.

Drawn together they force one compromise — either the lamps are wasting fill
rate at 1.5x, or the hairlines shimmer at 0.4x. Drawn apart, each gets what it
needs: the room at 0.4x upscaled (a 1440px window rendered at 576px, and there
is no way to tell, because there is not a single hard edge in it), the feed at
1.5x where a 1px stroke stays 1px.

The feed is then **erased out of the middle** rather than clipped, which is both
cheaper and softer than any clip — and not erased *completely*, because the
glass panels need something behind them to refract. Take the background away
entirely and glass stops reading as glass; the fog layer above is what keeps the
type legible, so the erase only has to take the edge off.

> Split a layer when its two halves disagree about resolution, not when they
> disagree about subject.

---

## An entrance animation that never lets go

The setup cards animate in with `hero-in … both`, and their hover lift silently
did nothing. Not sometimes — never.

`animation-fill-mode: both` holds the final keyframe forever, so the animation
keeps ownership of `transform` for the life of the element, and an animation
always beats a transition for the same property. The `:hover { transform:
translateY(-2px) }` was being computed and discarded on every hover of every
card that had been animated in.

`backwards` is the correct mode for an entrance: it applies the from-state
during the delay and then hands the element back to its own styles. The visual
result is identical and the element is no longer owned.

> An entrance is a thing that finishes. Say so, or it holds the door.

---

## Light is a blend mode, and the blend mode is a claim about the room

Three fixes in this pass were the same fix:

* the lamps composite with `lighter` on black and `multiply` on paper
* the hairlines are drawn brighter on black and darker on paper
* the third lamp is violet rather than amber, because amber added to the accent
  gives brown

All three come from the same place: a colour operation is a physical claim, and
the claim is different in a dark room than on a white page. Running one set of
values in both rooms is how a light theme ends up looking like a dark theme with
the lights turned up — which is the thing "designed, not inverted" actually
means in practice.

> Ask which room the blend is happening in before choosing the operator.

---

## One primary control

The welcome screen's button was better than the one every other page used: a
vertical gradient with an inner top highlight reads as a machined surface
catching the light, where a flat fill reads as a rectangle that has been coloured
in.

So it stopped being the welcome screen's button and became the product's. The
change is one rule in `.cta-glow`, and it lifts every page that has a primary
action on it.

A detail worth recording because it is the kind of thing that breaks six months
later: the element also carried a `bg-accent` utility, so two rules were setting
`background` and which one won came down to stylesheet order. The utility came
off. Whichever layer owns a property should own it alone.

> The best component in a new screen is a proposal for the design system, not a
> local exception.

---

## A tour that flies the camera is a tour you are being dragged through

Three beats pointed at `[data-tour='panel']` — the whole content area of the
Race Explorer. A target that tall cannot be spotlit: the page has to scroll to
reach it, the card has to dock in a corner to escape it, and between one beat
and the next the reader is flown up and down the document.

Every beat now points at the **control the sentence is about**: the two driver
pickers, not the Compare page; the question box, not the Ask panel; the
standings switch, not the table. They are all a similar size and all near the
top of the page, and the whole eight-beat tour now moves the viewport by
**23 pixels in total** — measured, start to finish.

The rule generalises past tours: a highlight is a claim about *what* you should
look at, and "this entire screen" is not an answer to that question.

> If the spotlight needs the camera to move, the spotlight is pointing at the
> wrong thing.

---

## The scrim and the ring cannot be the same box

The tour's hole is a 9999px `box-shadow` — one element, one shadow, a hole
punched through the page. Putting the outline in that same shadow seemed
economical and made the ring impossible to animate: any breath in the glow
re-ran the geometry transition, so the pulse fought the move to the next target
and the whole thing jittered.

Two elements in the same place, then. The scrim keeps the hole; the ring keeps
the light and breathes on its own clock. Both travel on one curve, so they still
read as a single object, and `will-change: top,left,width,height` keeps the pair
on their own compositor layer for the move — which is what took the last of the
shimmer out of a 1.5px ring crossing a live page.

> When one element has two jobs and they disagree about timing, it has two
> elements' worth of work in it.

---

## Duplicate `@keyframes` do not merge. The last one wins.

V62 put a breathing ring on the home page's call to action. V63 removed the
markup and left the CSS. V65 added a *new* animation, reusing the obvious name —
`cta-breathe` — and the button stopped being clickable in tests: "element is not
stable".

Two `@keyframes cta-breathe` blocks existed. CSS does not merge them; the later
definition replaces the earlier one entirely. The survivor was V62's, which
animated `transform: scale()`, so the new rule silently scaled the button
forever instead of pulsing its shadow.

Nothing about this was visible by reading either rule on its own. The lesson is
the deletion, not the naming: **markup and its styles are one change.** A block
of CSS whose selector no longer matches anything is not harmless — it is a name
still occupying the global namespace, waiting.

> Dead CSS is not weight. It is a booby trap with your own naming conventions
> on it.

---

## Two ways to find the same driver is one way too many

The Final Classification cards resolve a portrait by looking the driver up in
`session.drivers` — records the backend has already enriched from F1's own
listing, with the fallbacks and URL normalisation that live there.

The standings table had grown a *second* system: a name-join performed in the
standings endpoint. It matched on a full name where the first matched on a code,
and it was skipped entirely in demo mode — so the same product had two answers
to "what does this driver look like", and the newer one was the one that failed.

Where a session is on screen its roster is passed in and the lookup is the same
lookup. The name-join survives only as the fallback for the Historical page,
which has a season but no session.

> A second implementation of something that already works is a second thing that
> can be wrong, and it will be the one that is.

---

## Light is not dark with the lights on

The dark welcome screen is lit from inside: a black surface with sources in it,
so the scrim under the type is *more black* and the falloff at the edges is
*more black*. Invert those values for paper and you get grey mist over white,
which is exactly what "it looks like the dark mode inverted" describes.

A lit room on paper is the opposite arrangement. The page **is** the light
source, so the type sits on the brightest part of it and the falloff is a warm
shadow gathering at the edges. Same three stops, opposite direction.

Two more that follow from the same idea:

* **Glass on paper is opaque.** Frosted glass over a pale page is a slightly
  dirtier pale page. Depth on paper comes from the cast shadow underneath and
  the bright edge on top — how a real object on a real desk reads — so the light
  cards drop `backdrop-filter` entirely and gain a two-stage shadow.
* **An instrument recedes differently.** On black it recedes by being dim. On
  paper dim is illegible, so it recedes by being small and light-weight instead:
  full opacity, quieter ink.

> Ask what is emitting the light before deciding what a shadow means.

---

## A canvas has to agree with the document, not with React

The welcome screen's field captured its palette once per effect run and keyed
that effect on `prefs.theme`. It was correct on load and wrong on every switch:
**React runs a child's effects before its parent's**, so the canvas read
`<html>` for a theme the provider had not written yet. The CSS layers above it
all repainted; the canvas kept painting the dark room underneath. White scrim,
black room — which is precisely the picture somebody means when they say a light
theme "looks like the dark one inverted", and it came right on reload, which is
the tell.

The fix is not to reorder the effects. It is to notice that **React's copy of
the theme is a copy** — the theme lives on `document.documentElement`, and
anything reading a computed style should watch the element the style is on:

```ts
let s = readSurface();                       // reads getComputedStyle(<html>)
const mo = new MutationObserver(() => { s = readSurface(); rebuild(); });
mo.observe(document.documentElement, {
  attributes: true, attributeFilter: ["data-theme", "data-accent", "style"],
});
```

Watching `style` as well caught a second bug for free: the accent is written as
inline custom properties by the same provider, and the canvas could never have
seen it change at all.

> If a value has a home in the DOM, read it from the DOM. A framework's copy of
> it is one render out of date exactly when it matters.

---

## Light on paper brightens the paper

The first light room mixed each lamp toward the **page colour** before laying it
down. Every wash was then very slightly darker than the sheet it sat on, three
of them piled up in the middle where the lamps drift, and the headline ended up
printed on a mauve bruise. Measured at the centre: `rgb(219 212 220)` on a page
of `rgb(240 242 246)`.

Light does the opposite. Mix the lamp **toward white** instead — 85% of the way,
then lay it down at normal compositing — and the same three lamps lift the paper
toward white with their own hue in it. Same centre, measured: `rgb(240 235 239)`.

The rest of the room follows from the same sentence:

* **Additive on black, plain on paper.** `lighter` is right in a dark volume and
  turns a pale page into a haze.
* **Daylight comes from above, not from the middle.** The dark room's centre pool
  and edge falloff are a vignette; on paper a top-down gradient reads as a lit
  surface, and a dark ring around a bright middle reads as dirt.
* **Ink sits two to three times heavier.** A dark hairline on white recedes where
  a bright one on black advances, so every weight is stated per surface in one
  table rather than derived from the dark values by a multiplier.
* **Nothing blooms.** LED glows become tight rings; the accent's forty-pixel
  throw under the primary button becomes a short contact shadow and a longer
  faint one; the halo behind the accent word becomes a highlighter.

> Ask which way the surface moves when light lands on it. That single question
> settles the blend mode, the mix target, the gradient direction and the shadows.

---

## A strip chart runs; it does not refresh

The welcome screen's pace delta rebuilt its three traces from a 1.6-second
`setInterval`. Every one and a half seconds the whole picture jumped to a new
shape and then sat perfectly still — a poll, drawn — beside a canvas running at
sixty frames a second.

The shape it wanted was not "recompute faster". It was **not recomputing at
all**:

```
draw the wave TWICE the width of the window
  out of components whose periods divide that window exactly
then translate it by exactly one window width, for ever
```

The wave leaving the left edge is the wave arriving at the right, so the loop is
seamless. Three of them at three speeds over three periods never visibly repeat.
It costs one composited transform each, no timer, no React render, and it slows
with the reader's tempo because the duration is stated in `--m` like everything
else. `px` inside an SVG is a user unit, which is why `translateX(-100px)` is
exactly one `viewBox` width whatever size the panel is drawn at.

The same argument retired the data-stream meter's timer, and the tyre window
kept its tick but got a transition exactly as long as the interval that feeds
it — so the window is always drifting instead of arriving early and waiting.

> A readout that changes on a timer is a poll. A readout that moves is an
> instrument. The difference is visible from across the room.

---

## Hover raises the motion; it does not re-time it

Every loop in the three landing doors was given a shorter `animation-duration`
on hover. That does not accelerate an animation — the browser recomputes where
it *ought* to be from the elapsed time against the **new** duration, so a
nine-second drift told to take 1.9s jumps to wherever it would have been by now.
Three windows, six loops each, all lurching on the one gesture that is supposed
to say "this is alive, and it noticed you".

Nothing changes rate now. A second, faster pass runs permanently at zero opacity
and simply fades in; the traces thicken, the cars grow, the light comes up. All
of it is a transition, so it is smooth in both directions and settles the moment
the pointer leaves — and it is *more* movement on hover, not less.

The same pass gave the windows something to be alive **at** rest, which was the
deeper problem: a car travelling each position trace (one round dash on a path
normalised with `pathLength="100"`, so one rule drives four curves of four
different lengths), an answer leaving the node it resolved at, and a read head
sweeping the seasons before the podium lands behind it.

> A card that only moves when you touch it has to be found before it can invite.
> A card that lurches when you touch it has just told you it is a picture.

---

## A spotlight's light belongs on the thing it is lighting

The tour's highlight was eight pixels outward on every side of every target, for
ever, plus a 22px glow with 2px of spread that nobody had budgeted for. That is
24px of accent light landing on whatever happens to be next to the target — and
the session picker sits 16px under its own subtitle, the tabs bar sits 8px from
the Sources button. The outline cut the label above in half and the glow washed
the control below.

Three rules replaced the constant:

* **The padding is measured, and identical on all four sides.** The tour walks
  up to four levels from the target, considers every neighbour that actually
  shares a band with it, and takes the tightest gap. Uneven padding looks like a
  mistake even when every side is individually correct, so that one number sets
  all four. It stays at the designed 8 whenever there is room and shrinks only
  where the layout is close — 3px beside the Sources button, 8px in open space.
* **The glow lives inside the same budget.** Most of it is now `inset`: it pools
  on the inside edge of the hole, over the control being explained, which is
  where a spotlight's light belongs. What escapes is sized from `--ring-out`,
  set from the same measurement, so it physically cannot reach a neighbour.
* **The outline is the target's own shape.** A pill gets a pill, a card gets a
  card, and the radius grows by exactly the padding so the outline stays
  parallel to the edge it is tracing instead of crossing it.

> A highlight that does not know what is next to it is not pointing at
> something; it is drawing on the page.

---

## A demo has to do the thing

The landing page offered three example questions, each a link carrying `?q=`,
and nothing on the other side read the parameter. Pressing one opened the Ask
tab with an empty box, so the reader had to type the question they had just
chosen. It looked like a demonstration and behaved like a navigation, which is
the worst of both.

It is the demonstration now: the question **types itself** into the real input
and submits itself against the real session, and the answer is the real answer.
Typed rather than pasted, because the point of the gesture is to show what
happens and a value that simply appears in a field shows nothing — the same
reason the analysis takes a beat before it answers.

Two details that are easy to get wrong:

* **Consume the parameter, keep the value.** `?q=` describes something that
  *happens* rather than something the page *is*, so it is stripped from the
  address bar the moment it is taken; leaving it there makes every later Back
  into the page ask the question again. The state keeps it so the panel still
  receives it once the session has loaded.
* **Guard the ref, not the effect.** React re-runs an effect immediately after
  tearing it down in development. A "have I used this seed" ref that is set and
  never cleared swallows the second run and leaves nothing typed at all — so the
  cleanup clears it unless the question actually went.

> If a control promises a demonstration, the demonstration is the deliverable.
> Getting the reader to the place where they could run it themselves is not it.

---

## A highlight tracks its target; it does not take a snapshot of it

The tour measured the spotlight during the scroll and then stopped — two frames
at the same offset and the watcher returned, leaving `scroll` and `resize`
listeners behind. Neither fires when the **layout** changes under a stationary
page, and on the Race Explorer it always does: the session lands a beat after
the tour opens, the heading stops saying "Loading", a Demo-data chip appears
beside it, a partial-data note may appear under it. Everything below moves down
twenty-four pixels and the outline stays where it was. That is "it aligns, then
shifts" exactly, and no amount of tuning the padding could have fixed it.

The rect is read every frame for the life of the beat and written only when it
has actually moved. One `getBoundingClientRect` per frame is nothing beside what
the page is already doing, and the equality check means a stationary target
costs zero renders.

Two things follow from it:

* **Travelling and tracking are different speeds.** The journey between beats is
  a movement the reader watches; a correction for a layout shift is a thing that
  should already have happened. One duration for both gives either a lurching
  journey or a twenty-four-pixel glide half a second after the page settled, so
  the transition duration is a variable and the tour sets it.
* **The page only moves when it has to.** `scrollIntoView({block: "center"})` on
  every beat is a camera flight even when the target is already in front of the
  reader — the right number of pixels to scroll toward something you can already
  see is zero. It scrolls only when the target is outside a comfortable band, and
  then by the least it can. Most beats no longer move the page at all.

> The spotlight is attached to the thing, not to the coordinates the thing was
> at when the beat started.

---

## `fill-mode: both` redefines the viewport

Every arrival animation in the product ends on `transform: none`. An animation
with `fill-mode: both` holds its final keyframe for ever — and a held
`transform: none` is not the keyword, it is the computed matrix
`matrix(1, 0, 0, 1, 0, 0)`, which makes the element a **containing block for
every descendant with `position: fixed`**.

`.route-in` is on every page. `.build > *` is on every section. `animate-fade-in`
is on most panels. So practically every panel in the product was quietly
redefining what "fixed to the viewport" meant inside it, and the Driver focus
dialog — declared `fixed inset-0` — opened 453 pixels down the page against a
viewport that starts at zero. The reader could not scroll it back, because the
dialog correctly locks the page behind it.

Two fixes, and both are worth having:

* Every entrance uses `backwards`, which applies the from-state during the delay
  and then hands the element back to its own styles. That is what an entrance
  should do, and it is the same lesson V64 learned when a held transform ate a
  card's hover lift.
* Dialogs render into `document.body` through one shell (`ui/Modal`). A dialog
  with no ancestor but the body has nothing left to redefine the screen for it.

> A transform you cannot see still changes what every `position: fixed`
> descendant is positioned against.

---

## "Is this session complete?" is a question about the session

Every adapter answered it for itself, and each answered a different question:
the archive report declares five facets, OpenF1 declares a different five,
Jolpica declares its own and hard-codes `partial=True`. **A facet an adapter
never declared could never be reported missing** — so a race fetched through the
archive with no position trace at all reported COMPLETE, and the reader got a
Race Story with no timeline in it and nothing saying why.

It was never about the race. It was about which source answered first.

The report is settled once, at the end of the pipeline, by looking at the
session that was built: one canonical facet list, filtered by what the category
can have, each entry present or absent according to whether it is there. The
adapters still say WHERE a facet came from — that is their job and they are the
only ones who know — but WHETHER it is there is decided by whether it is there.

Idempotent, because it runs on fetch, on cache heal and after every enrichment
step; and provenance-preserving, because "found in the session" must not
overwrite "fetched from OpenF1".

> When two subsystems disagree about a fact, the fix is usually not to reconcile
> them. It is to notice that neither of them owns it.

---

## A position column holds a position

The product draws a classification in two places and they had drifted into two
different tables of the same thing. One printed the literal word "DNF" in the
POSITION column, then repeated the status in the badge beside the driver and
again in the Status column. One showed "—" in Grid→Finish for every retirement,
throwing away the classified position the FIA had actually awarded, so the same
car read as P18 in one table and as nothing in the other. Neither sorted, so a
classified finisher could appear in the middle of a run of retirements.

One standard, and the rules are the sport's rather than ours:

* **Order is classified position.** A car that retires having completed 90% of
  the distance is still classified, and in the order it completed — so a
  retirement legitimately sits above a car that finished further back. What is
  not legitimate is an unsorted table.
* **The position column holds a position**, retired or not. Where there is none
  the row reads "NC", which is the sport's word and is a fact about the RESULT.
  "DNF" is a fact about the CAR; it already has a badge and a time column.
* **A retirement recedes.** Dimmed, in both tables.
* **Badges get their own track.** Two penalties on one driver used to wrap onto
  a second line, making that row taller than every other and breaking the column
  the rest of them were aligned in.

> Absence is not an explanation. A panel that renders nothing because a facet is
> missing says so in the space it would have occupied.

---

## Colour vision is not a filter over the top

Formula 1 is a colour-coded sport: the livery is the identifier, the compound is
the colour of the sidewall, a green sector is a personal best. For roughly one
man in twelve, that makes a position chart twenty grey lines.

Shifting every hue by the same amount fixes none of it — two colours a protanope
confuses are still confused after both are rotated. What works is mapping the
whole circle onto a **ring of hues chosen so its members survive that specific
deficiency**: Okabe-Ito for the red-green deficiencies, which is the published
standard and was designed by measuring what dichromats can actually separate,
and a red-cyan axis for tritanopia.

Four things make it a feature rather than a toggle:

* **It is interpolated, not snapped.** Snapping each hue to its nearest slot
  collapsed colours that were only a little apart — "gained" green at 158° and
  "fastest" teal at 172° came out identical. Walking the ring continuously keeps
  relative distance, which is how meaning survives.
* **Grey stays grey, and near-white counts as grey.** The hard compound is
  `#e7ecf3`, which HSL calls 28% saturated because it is a hair off neutral at
  very high lightness. Remapping it produced a pale blue tyre, and "the white
  one" is that compound's whole identity.
* **It composes with the surface.** Colour vision decides the hue; light mode's
  lightness ceiling then decides whether that hue can be seen on paper. Both
  readers exist at once, and the order matters — darkening for paper and then
  rotating the hue throws the darkening away.
* **It reaches everything through one call.** Every livery, compound, flag and
  key-moment colour already went through `useLivery`, so one preference reaches
  all of them; the semantic tokens move with them in CSS, and the reader's own
  accent is adapted where it is written.

> An accessibility feature that only recolours the chrome has recoloured the one
> part that was never carrying the meaning.

---

## The championship is a property of the season

Every tab in the Race Explorer is a reading of one session: the same ninety
minutes told as a story, as charts, as strategy, as pace, as a duel, as an
answer to a question. Standings was a seventh tab beside Ask, and it said to
every reader who found it there that the championship belonged to the race above
it.

It belongs to the season, and the product has a season page. Three moves rather
than one, because moving the table alone would have hidden it:

* The tab goes. One table, in the place its own subject lives.
* The nav item is **"Seasons"**, not "Historical" — a reader who reads the label
  as "old stuff" will never look for this year's title race behind it.
* That page opens on the season **in progress**, and the Race Story hands the
  reader off to it at the point the question actually occurs to them: after the
  result.

And the table has two tiers, because seventy-seven seasons cannot carry
portraits. F1 publishes them for the current grid and, patchily, a few years
back; for 1961 there is nothing, and a table of team-coloured initials in
circles reads as a page that FAILED to load its images rather than one that
never had any. Historical seasons are typographic — heavier numeral, more air,
the livery rail — and the current season keeps its faces. The rule is not "the
current season" but "where the faces exist": all or none, checked against the
data, because one row of initials among nineteen portraits is worse than either.

---

## A feed that had not been invented yet is not a gap in our data

V67 stopped a qualifying hour being reported as missing its overtakes, because
a qualifying hour never had any. The same category error was still being made
along the other axis: a 1975 Grand Prix was reported as missing its lap times,
its tyre stints, its weather trace and its race-control log — none of which were
recorded, by anybody, in 1975. The reader was told a fifty-year-old race had a
data problem. It had a 1975 problem, which is not the same thing and is not
ours.

Facets have an era as well as a category, and the boundaries are the sources'
own rather than guesses:

| from | what starts |
|------|-------------|
| 1950 | results and entry lists |
| 1996 | lap-by-lap timing, and therefore positions, and therefore the overtakes inferred from them |
| 2011 | pit stops |
| 2018 | tyre stints, weather, race control |

A facet before its era is not listed, not reported missing, and does not make a
session partial. It is **explained**: the session carries one sentence saying
which feeds had not started yet, so absence has a reason on screen instead of
being a silence. And the rule is not a blanket excuse — a 2024 race missing its
stints is still partial, and a test says so.

> Before deciding something is broken, check what year it is.

---

## An unavailable session is a status, not an error

The failure screen was a warning triangle over an apology, three pill buttons
and a `<details>` called "What we tried" — the shape of an error page, and an
error page tells a reader that something is broken. Most of the time nothing is:
a provider is having an afternoon, or the season is older than the feed. Both
are facts about the world rather than faults in the product.

It is a status panel now, answering the four questions a reader actually has, in
that order: **which** session, **why** not, **whose** problem it is, and **what**
to do now. The third is the one that earns the trust — being told plainly that
the archive timed out and Jolpica is not answering is a product that knows what
it is made of, and it is the same promise the welcome screen makes. Sources are
named, states are named, nothing is hedged.

> "We couldn't load this" is an apology. "OpenF1 is not answering; the session
> is fine and will load when it is back" is information.

---

## The setup asks for more and feels like less

The welcome screen asked three questions on three equal cards. Ten questions
laid out the same way is a form, and a form is the one thing a first run must
never be — so the **shape** carries the difference rather than the copy:

* Three hardware cards for the answers that change what the product IS —
  experience, appearance, tour. One press each.
* Everything else — language, units, clock, motion, text size, colour vision —
  folded into a single disclosure that is one line of chrome until it is asked
  for, and a plain sentence saying the defaults are already sensible.

Both readers get what they came for: one press to enter, or thirty seconds to
make it theirs. Nobody is walked through a wizard to reach a button they could
have pressed on arrival. And the rows inside the disclosure deliberately are
**not** more cards — giving units the same treatment as experience would flatten
"these are the decisions that matter" back into ten equal things.

> A setup screen's job is to be skippable. Everything it asks beyond that has to
> earn its place by being easy to ignore.

---

## Two scopes of one season, and the switch between them belongs to the page

The championship has now had three homes, and the third is the one that matches
what a reader is doing.

* **A tab beside Ask** said it was a reading of one session, which it is not.
* **The Seasons page** is right for 1974 and wrong for the title race somebody
  is following this week — they had to leave the races that were moving it to
  see where it stood.
* **A scope switch on Explore** is neither: the championship is the *other*
  thing that page is about. Explore already owns a season — the picker sets it —
  so the highest control on the page is the one that says whether you are
  reading a session in that season or the season itself. It sits opposite the
  heading because it governs the heading.

Seasons then becomes exactly what its name says: every season that has
**finished**. The season in progress is deliberately absent from its picker,
because the same table in two places with two framings is how a reader ends up
unsure which one is authoritative.

> When something has no good home, check whether the page it keeps landing on
> has two subjects rather than one.

---

## One trust card, not a banner and a footnote

"We read several open motorsport sources and one of them is sometimes down" and
"this is a beta and it is still growing" are the same sentence told from two
sides: both are a product being honest with a reader before it has to be. Split
across a banner and a footnote they read as two apologies. Together, in one
card, they read as a product that knows what it is made of.

It sits on the FIRST act of the welcome screen, before any question is asked,
because a reader decides whether to trust software in the first fifteen seconds
— which is well before they reach a setup screen. And it replaced a "v1" label,
which claimed a maturity nothing had earned and told the reader nothing they
could use.

> Transparency is only reassuring when it arrives before the problem does.

---

## A disabled tab is only worth having if it reads as a plan

Greying out a control usually communicates "broken". A roadmap tab has to
communicate "not yet", which is a different message and needs different
treatment: legible rather than faded to nothing, a `soon` mark that is a label
rather than a warning, a hover card saying what the feature will actually be,
and no focus stop or press target at all.

The replay feature is called **Re-run** for the same reason the nav says
"Seasons" rather than "Historical". "Race Replay" describes a video player; the
feature is a reconstruction of a Grand Prix from its own timing data, played
back at whatever speed the reader wants. "Re-run" describes running the session
again, and it sits in the same register as Explore and Seasons — one word, an
instruction, no noun borrowed from broadcast.

> A placeholder that cannot say what it is for is just a dead button.

---

## A canvas has to agree with the document, not with React

Setting `canvas.width` or `canvas.height` erases the canvas. That is the
specification, not a quirk, and it is the whole reason an ambient background
blinks: a `ResizeObserver` that reassigns both on every layout change wipes the
buffer, and the next paint is one animation frame away. One black frame, on the
most expensive-looking surface in the product, every time the reader opens a
disclosure row.

Two rules follow, and they are general:

* **A resize handler must be able to say "nothing changed".** `size()` returns a
  boolean; a no-op resize never touches the canvas at all. Most layout changes
  near a full-bleed background do not change its size.
* **When a resize is real, repaint on the same tick.** Not in the next frame —
  the frame between the clear and the redraw is exactly the flash.

The same applies to a theme change, an accent change and anything else that
invalidates what is painted: the repaint belongs on the tick that invalidated it.

> An animation is continuous if nothing else in the product is allowed to
> interrupt it. Continuity is a property of the interruptions, not of the loop.

---

## One direction, and a cache to come back by

The interface is *written* in British English. American is a rendering of it.

This is not pedantry about which is correct — it is the difference between one
transformation and two. A reverse dictionary is a second thing that can disagree
with the first, and several classic pairs genuinely are not bijective: "meter" is
a British word too, "programme" and "licence" collide with words British English
spells the American way, "storey → story" would rewrite Race Story. So there is
one map, `GB_TO_US`, and going back is a **restore from cache**, never an inverse
conversion.

Which puts the whole mechanism's correctness in the cache — and a cache built
inside the effect that reads the preference is destroyed the moment the
preference changes. That is not a subtle failure: the converted text becomes the
new authored baseline, and the original spelling can never come back. The caches
live at module scope, outside every effect, deliberately.

> If going back is a restore rather than an inverse, the thing you are restoring
> from must outlive whatever triggered the change.

---

## A light override for a base state must restate the modifiers it outweighs

`:root[data-theme="light"] .wc-inst-code` has three simple selectors; the state
modifier it is meant to leave alone, `.wc-inst-code.is-lead`, has two. The theme
override wins, silently, and light mode paints the leader the same grey as
everybody else — the strip's only piece of information, gone, in one theme.

This is structural, not a typo: every `[data-theme="light"] .x` in the sheet
outranks every `.x.is-something`, and the bug is invisible in the theme it was
authored in. The pattern is worth auditing mechanically — enumerate the light
overrides, enumerate the modifier selectors on the same base class, and flag
every pair with no light counterpart. Two real losses turned up that way
(`is-lead`, and `is-good`/`is-warn` on the instrument values); one flagged pair
was a false positive, because the override and the modifier set different
properties.

> Specificity bugs are not found by reading the theme you are looking at.

---

## What is below the fold, named rather than pointed at

A landing page whose first screen resolves cleanly has a real problem: several
readers stop there. The standard answer is a bouncing chevron, and it is the
first thing on the screen that looks like a template — it says "there is more"
and nothing else.

The cue on Home says what is next instead: the chapter number and its word, the
same `01 · Read a race` the section below wears, under a hairline whose light
travels downward on a slow loop, as if the page were being fed from above. The
reader meets that label again four hundred pixels later, so the cue teaches the
page's structure rather than pointing past it.

Three properties make it feel designed rather than added:

* **It leaves.** An indicator still pointing down after the reader has gone down
  is chrome that has stopped paying attention — and it leaves the tab order and
  the accessibility tree with it, because a control you cannot see is worse than
  no cue at all.
* **It is placed where it survives.** Below the statistics band it would be off
  screen on a 1366×768 laptop, which is where a scroll hint is needed most.
* **Its name is the words on its face.** No `aria-label`: an override makes the
  spoken name something other than the visible one, and a voice user cannot ask
  for a control by a name that is not written on it.

> A hint that cannot say what it is pointing at is decoration.

---

## A landing page that has to be scrolled has not landed

The welcome screen's first act now measures itself and scales to fit the
viewport, with a floor: at 0.68 it stops shrinking and allows a scroll, because
type too small to read is a worse failure than a scrollbar.

Two things this got wrong on the way, both worth keeping:

* **A CSS `transform: scale()` is visual only — layout does not notice it.** The
  scaled column still occupied its full unscaled height, and a grid item taller
  than its cell stops being centred, so the visually-correct content sat 135px
  below where it belonged and clipped. The wrapper reserves `natural × fit` and
  the column scales from `origin-top`.
* **Scaling is the last resort, not the first.** The largest single saving came
  from the trust card becoming two columns rather than two stacked rows — which
  is also the more honest structure, because they are two subjects rather than
  two paragraphs of one. Fix the layout first; scale what is left.

> Reach for a transform when the content is already as short as it should be.

---

## A tooltip that repeats its own heading has one row too many

"Did not finish / Retired — after lap 41 / Reason: Retired." Every line of that
card was correct and one of them was worthless: for almost every retirement the
source's stated reason *is* the word "Retired".

The rule generalises past this card. A field whose value is usually a restatement
of the label above it is not a field — it is noise with a schema. Show it when the
source actually says something ("Hydraulics", "Collision damage"), and let it
**replace** the generic line rather than sit under it, so the card is the same
height either way and the reader never scans a row that is going to be empty of
meaning.

> Data being present is not a reason to render it.

---

## A constructor is a mark in the same circle a driver's face is in

The rule this release exists to state: **whenever two kinds of identity appear
in one row, they get one shape.** A driver was a portrait in a 27px circle and
the constructor beside them was a 10px coloured dot, so the row read as a
photograph next to a piece of punctuation. Both are circles now, at the same
diameter, set the same way.

That decides the container shape on its own, and a second argument agrees with
it: a team's own mark usually arrives as a composed roundel, and a circular
asset inside a rounded square leaves four lit corners of livery behind it —
which is precisely the "pasted on" look the work was meant to remove.

The wash and the ring are drawn on the CONTAINER, under whatever it holds. That
is what makes one treatment correct for two kinds of file with nothing to
configure per asset: an opaque roundel covers them and you see the official
badge with a hairline around it; a transparent emblem lets them through and gets
the soft livery field it needs to sit on.

> When one component owns the container, every other component can stop having
> an opinion about it.

---

## `object-fit: contain` is not normalisation

Contain guarantees that nothing overflows. It says nothing about whether two
marks look the same size — and they do not: a wide mark touches both side edges
while a square one touches all four, so the wide one reads as roughly half the
size of its neighbour. That is the entire "Mercedes looks tiny while Ferrari
fills the container" complaint, and it is not fixed by picking a better number.

Two regimes, decided from the asset's own aspect ratio at load, with no
per-team table:

* **Near-square (0.86–1.16)** is a mark that already carries its own padding.
  It gets the whole container, so it aligns with the circle instead of floating
  inside a second one.
* **Anything else** is fitted by its LONGEST edge, because equal longest edges
  is what the eye reads as equal size.

And the second-order correction, which is the one worth remembering: **a circle
is not a square.** A square emblem has to stay inside the inscribed square or
its corners cut the rim. A thin mark has no corners to cut — it lives along the
diameter, where there is materially more room — so its allowance grows from 74%
to 92% as it gets thinner. At 38px that took a 4.3:1 wordmark from 28px wide to
35px, which is the difference between "half the size of its neighbour" and "the
same size".

A per-mark escape hatch exists and is empty on purpose. Every entry in it is a
promise to hand-tune the next asset too, and a correction made by looking at the
file rather than at the badge beside its neighbours is a bug you cannot see.

> Automatic beats a lookup table whenever the rule can be derived from the asset
> itself — and it is the only thing that works for a file you have never seen.

---

## Pending, present and absent are one shape

A badge that shows a placeholder and then swaps to the real mark is a mark that
changes under the reader's eye, and an identity that changes is worse than an
identity that arrives late. All three states paint into the same circle at the
same size: pending is the circle with its wash and nothing in it, and what
arrives — the mark, or the drawn shield for a team that has no file — arrives
into space that was already there. Nothing in the row ever moves.

The resolution cache behind that is a module constant rather than state in a
provider, for the same reason: whether an asset exists is a property of the
deployment, not of the tree, so it has to survive every unmount between one page
and the next. A constructor resolved once is answered synchronously for the rest
of the session and never flickers again. Per-instance probing meant twenty rows
requested the same file twenty times and every re-render started again from
"unknown".

> The question "does this asset exist" has one answer per deployment. Cache it
> where that is true.

---

## The gate is whether the asset exists, not what year it is

A product spanning seventy-seven seasons cannot key branding on a cutoff year:
somebody has to pick it, and it goes stale the first winter afterwards.

The lookup is keyed on the constructor's NAME instead — and a constructor's name
changing is precisely when its identity changed. "Kick Sauber" and "Audi" are
different keys, so a 2024 row can never end up wearing a 2026 badge. A 2019
Mercedes row wears the Mercedes mark because it genuinely is the same
constructor with the same mark. Nothing enumerates which teams have files, so
adding one is a file drop, and a team that last raced in 1976 falls to the drawn
shield without anybody writing it down.

> A rule that derives itself from the data cannot go out of date; a list of
> exceptions always does.

---

## Measure the asset; do not infer it from its shape

V70 asked each constructor mark one question — its aspect ratio — and inferred
everything else from the answer: a square file was taken to be a composed
roundel, given the whole badge, and had its livery background removed on the
grounds that an opaque roundel would hide it anyway.

Then five real marks arrived. All five are transparent silhouettes on **square**
canvases — the same aspect ratio as a roundel, the opposite kind of asset — and
four of them are pure white ink. Under the old rule every one would have been
handed a bare circle with its background taken away, and on paper they would
have rendered as nothing at all.

The fix is not a better threshold. It is asking the question the code actually
needs answered. The image is drawn to an offscreen canvas once per asset and
three properties come back:

* **Coverage** — the opaque fraction — separates a composed badge from a bare
  mark. A circle inscribed in its square covers π/4 ≈ 78%; a real roundel covers
  more; bare marks measure 17–41%. The threshold sits in open space at 70%
  rather than on top of either group.
* **Ink** — mean luminance of the opaque pixels — decides what colour has to go
  behind it.
* **Aspect ratio** decides the fit, which is the only thing it was ever able
  to answer.

> A property you can measure in a few milliseconds should never be guessed from
> a correlated one. The correlation is where the bug lives.

---

## The brand sets the hue; the mark sets how far you take it

"The logos are transparent, so use the team colour" is the right instruction and
it is not sufficient on its own. A team colour is whatever the team chose and a
mark is whatever the mark is. Mercedes' petronas green is luminous; its star is
white. Put one on the other at full strength and the result is brand-accurate,
correct in every particular, and completely empty.

So the livery supplies the hue and the mark's own measured ink supplies the
distance: white ink is dropped onto a deep field, dark ink is lifted onto a pale
one, each landing near 5:1. Ferrari red is already dark enough for a white
shield and is left alone, because nudging it to satisfy a formula would make it
not-quite-Ferrari-red.

Two things fall out of this that are worth keeping:

* **Eleven brands become one set.** Colours running from Ferrari red to Haas
  gunmetal all land in the same contrast band, so a column of badges reads as a
  system rather than as eleven separate logos.
* **The field does not follow the theme.** The mark's ink does not change when
  the reader turns the lights on, so neither does what sits behind it. A badge
  that restyled itself per theme would be a brand that restyled itself per
  theme, and the one thing a constructor's mark has to be is the same mark.

> Accessibility and brand fidelity are not in tension here. Deriving one from
> the other is what keeps both.

---

## A rule written into this document is not a rule the next release follows

V69 found that `:root[data-theme="light"] .x` outranks every `.x.is-something`
under it, fixed three instances, and wrote the lesson down a few sections above.
V71 added `.cbadge.is-field`, and the first light-mode screenshot showed all five
official marks as white ink on a pale wash — invisible — because the light rule
swallowed the modifier exactly as documented.

The lesson is not "remember harder". Two things actually help:

* **Order the block so the general case comes last.** A base theme rule sitting
  above its modifiers reads like a default; sitting below them it reads like
  what it is — the fallback for the states that did not match.
* **Screenshot the theme you did not author in, every time, before believing
  anything.** This class of bug is invisible in the theme you are working in and
  obvious in the other one, which makes it exactly as cheap to catch as it is
  easy to reintroduce.

> The value of writing a trap down is not that you avoid it. It is that you
> recognise it in one screenshot instead of thirty minutes.

---

## A system is proved by the release that changes no code

V70 built the constructor badge. V71 shipped five marks and had to rewrite how
the badge decides what it is holding, because the first real assets broke an
assumption. V72 shipped five more and changed **nothing but the files** — no
component, no mapping, no page, no threshold.

That third release is the only evidence that any of it worked. A system that
needs a small edit for each new case is a pattern with extra steps; the test is
whether the second and third batch cost anything, and the way to make that true
is to keep every decision derivable from the asset rather than recorded beside
it. Nothing in this product knows which teams have marks. There is no list to
extend, so there is nothing to forget to extend.

What did surface in V72 is the layer underneath: the badge takes its field from
the constructor's stored livery, so a mark is only ever as right as that colour.
Two entries are visibly wrong now that the official marks sit on them — the sort
of thing a placeholder happily hides and a real logo cannot.

> Correct branding is a data problem wearing a rendering problem's clothes. The
> component was never going to be the hard part.

---

## Fix the comment, not the tool

`check-team-logos.mjs` claimed in its header to report each mark's opaque
coverage and ink luminance. It never did — both need the pixels decoded, and the
badge already measures them on a canvas at runtime where the answer is free.

The tempting repair is to make the tool live up to the comment: pull in a WEBP
decoder, reimplement the classification, and now the same rule exists twice in
two languages with nothing keeping them in step. The one that drifts will be the
one nobody is looking at, and it will drift silently because a build script that
disagrees with the product still exits zero.

So the comment was corrected to describe what the script actually answers, and
the thresholds live in one place — `public/teams/README.md` — pointing at the
single implementation.

> When documentation and implementation disagree, check which one is cheaper to
> be wrong about before deciding which to change.

---

## Assert on the network, not only on the pixels

Every sweep in this product had checked what was on screen: is the badge square,
is the mark centred, is anything stretched, does the row still fit at 390px. All
of that passed for three releases while the championship table was quietly asking
the server for `/teams/max-verstappen.webp` nineteen times and getting a 404
apiece.

Pressing **Constructors** flips the table's type immediately and the fetch
resolves a moment later, so for exactly one render the drivers' rows were being
drawn as constructors. A driver's name went into the constructor badge, which
resolved it to a slug and asked for a file that will never exist. On screen it
was a shield reading "MAX" for less than a frame — invisible to a screenshot, and
perfectly visible to a response listener.

Two things follow:

* **A visual assertion cannot see a wasted request, and a transient wrong state
  usually shows up as one first.** Listening for every response ≥400 across a
  full navigation is three lines and it found what six passes of pixel-checking
  had walked past.
* **`loading` is one render too late.** Setting it in an effect means the render
  that changed the input has already happened with the old data. The durable fix
  is to make the data carry what it is data *for* — rows tagged with their own
  type — so a mismatch is self-evidently "still loading" rather than something
  the component has to remember to flag.

There is a second cost that is easy to miss: the badge caches probe results at
module scope so a resolved constructor never flickers again. Nineteen driver
names went into that cache and stayed there for the session. **A cache keyed on
something derived will faithfully remember your bugs.**

> If a component can be handed the wrong kind of thing for one frame, it will
> eventually be handed it in front of someone.

---

## The last placeholder was in the data, not the design

V73 was meant to be one file. The audit found the current-season experience still
showing one drawn shield — not because a mark was missing, but because the
simulated season fielded Kick Sauber, which for 2026 is Audi. Every asset was
present and correct; the grid was a year out of date.

That is the shape of the whole constructor-branding arc. V70 built the component,
V71 rewrote how it classifies a file, V72 changed nothing at all, and V73's real
work was two data corrections and a race condition. The rendering problem was
solved early and cheaply; what kept surfacing underneath was whether the product
knew who was actually racing and what colour they were.

> When the design system stops being the thing that breaks, the data becomes
> the product.

---

## A provider's spelling is an input, never an identity

Two feeds supply this product and they do not agree on what a team is called.
Live timing says "Racing Bulls", "Alpine", "Red Bull Racing". Jolpica says
"RB F1 Team", "Alpine F1 Team", "Red Bull". Both strings reached the interface
untouched, and each one keyed its own slug, its own asset lookup and its own
colour — so the same constructor rendered as a branded badge on the pace board
and a grey placeholder shield in the championship table, with a different name
above it.

The tell that this was structural rather than a missing file: `teamIdentity`
already knew "F1 Team" was noise. It stripped the suffix — to build a fallback
code, and then never retried the lookup with it removed. Half a fix is how a
lookup ends up failing on exactly the names it was written to handle.

Resolution now runs in order of confidence, and each step earns its place
against a real provider habit:

* **Exact name or alias** — the common case.
* **With suffix noise removed** — "Alpine F1 Team", "Cadillac F1 Team". Applied
  to display as well as lookup, because "Haas F1 Team" tells a reader of a
  Formula 1 product nothing they did not already know.
* **A known name found inside a sponsor-laden one** — "MoneyGram Haas F1 Team",
  "Oracle Red Bull Racing", "Stake F1 Team Kick Sauber". Longest key first, so
  "red bull racing" beats "red bull" to the match.
* **A generated record** — a slug, a code and a title-cased name, so an entrant
  nobody has heard of is a row rather than a hole.

> When two upstreams disagree about a name, the fix is not to teach every page
> both names. It is to stop letting either name be the identity.

---

## The component that renders a brand should own the brand

The badge used to take its livery from whichever component rendered it, which
meant it wore whatever that page's feed happened to say. That is how Audi
appeared on Kick Sauber's inherited green in the championship and in its own red
on the pace board — two correct components, two different feeds, one wrong
screen.

It resolves its own colour now. A record we hold wins; the caller's value is the
fallback only for a constructor we have no record of, where their feed is the
only source there is. The caller keeps one job it cannot delegate — running the
colour through the reader's colour-vision palette — and loses the one it was
never qualified for.

The same argument produced three livery tables in the first place: one in the
frontend, one in the Jolpica adapter, one in the mock. Each was written where it
was needed, each was right on the day, and they drifted. They are aligned now,
and the frontend is authoritative, but the durable lesson is the ownership rule
rather than the alignment.

> Anything that can be resolved from an identity should be, at the point the
> identity is known. Passing it in is an invitation to pass in something else.

---

## Make the fixture spell things the way the world does

Three releases of sweeps walked past this bug. Every one of them was thorough —
both themes, three widths, alignment, stretch, overflow, network — and every one
of them ran against demo data whose constructor names were clean, tidy and
nothing like what Jolpica actually returns. The bug could not appear, because
the input that triggers it never reached the code.

Demo mode now uses the provider's real spellings: "RB F1 Team", "Alpine F1
Team", "Cadillac F1 Team", "Red Bull". It is uglier and it is correct, and
anything that regresses the resolution is visible on the first screen a
developer opens rather than in a screenshot a user sends three releases later.

> A fixture that is tidier than production is not a simplification. It is a
> blind spot with test coverage.

---

## A boolean cannot answer two questions

`partial` meant "something is missing" for four releases, and it was asked to
decide whether a page should render. It cannot, because the two situations it
covers have opposite answers:

* A 2024 race with no weather trace is **partial and completely worth reading**.
* A race whose entry list never arrived is partial too — and renders as a column
  of car numbers with question marks under them, which is not a race analysis.

Both got the same chip, so the chip meant nothing, and the reader was left to
work out for themselves how much of the page to believe. The split is by what a
session **cannot be reconstructed without**: results, the entry list, and for a
race its lap times. Everything else enriches, is explained where it is missing,
and never gates anything.

Two rules keep the split honest. The era boundary wins over the essential list —
a 1975 Grand Prix has no lap times and never will, and demanding them would
declare half the sport's history unavailable. And the verdict is computed in one
function from the session as built, not asserted by whichever adapter answered
first, so it cannot disagree with itself between two pages.

> When one flag has to carry two decisions, it is not a flag. It is a coin toss
> the reader is being asked to call.

---

## A derived field is not a second-class source

The entry list was filled as a side effect of backfilling the results — inside
`if not session.classification` — so a source returning results *without* an
entry list left it empty and nothing else looked. The page loaded, said partial,
and showed car numbers.

The cheap fix turned out to be the right one: every classification row already
carries a code, a name, a team and a colour, which **is** an entry list. Rebuilt
from what we already hold, at no network cost, it cannot fail and it covers the
case completely whenever results exist. The network path stays for the genuinely
thin sessions that have neither.

The condition is that it says so. The facet is marked `derived` with a sentence
naming the classification as its origin, because a reader checking the sources
panel is owed the difference between "a driver feed answered" and "we worked it
out from the results".

> Look at what you already have before you ask anyone for it again — and then
> say which of the two you did.

---

## Order is a property of the session, not of the adapter

Three adapters each ordered their classification correctly by their own
provider's convention. Live timing gives a retirement no position; the results
archive numbers retirements straight on after the finishers. Both are internally
consistent, and the enrichment step takes the classification from one and the
retirement flags from the other — so a driver who took the flag ends up between
two DNFs, and no single file is wrong.

Anything a merge can invalidate has to be decided after the merge. The order is
settled once now, from the facts on the rows, identically for every source: the
classified first, the retirements behind them ranked by how far they got.

Renumbering the finishers contiguously is part of it rather than a liberty. A
number that disagrees with the row's own position in the table is worse than no
number, and a retirement showing NC is both true and what the badge beside it
already said.

> If two correct components can combine into a wrong result, the correctness
> belongs one level up.

---

## "None" is an answer; make sure your model can hold it

The audit recomputed each facet's presence from `bool(list)`. That is one line
and it silently collapses two different states: *nothing answered* and
*something answered, and the answer was zero*. Monaco is where the difference
shows — a street circuit where barely a car is passed on track — and the product
reported a race holding every fact it needed as partial, because the honest
answer to "how many overtakes" was none.

The provenance was already there. A derivation had run over a complete position
trace and recorded itself as the source; the audit then overwrote that with
"none" because the list was short. **The fix is to stop discarding the evidence
that the question was asked**, not to special-case the facet.

Which facets can legitimately count zero is a property of the facet, not of the
race: overtakes, a race-control log on a clean afternoon, pit stops in a race
nobody stopped in. Results and entry lists cannot; an empty one of those means
nothing answered.

> Before treating emptiness as absence, ask whether zero is a value the thing
> can legitimately take. If it is, the count is not the evidence — the
> provenance is.

---

## A strict rule needs its exemptions built first

"A page this product is not certain of is a page it does not show" is the right
rule and it is unshippable on its own — applied to this archive it would declare
most of the sport unavailable. It only became safe once two earlier rules were
in place, and both are about not inventing a gap in the first place:

* a feed that had not been invented yet is not missing (a 1975 Grand Prix has no
  lap times and never will);
* a question asked and answered "none" is not missing either.

The order matters more than either rule. V75 shipped a lenient gate because the
strict one would have been wrong *given what the audit then believed was
missing* — the answer was not to soften the gate but to stop over-reporting
absence. Once `missing` contained only real absences, strict became the simple
rule it always looked like.

> If a rule you believe in produces obviously wrong results, check what you are
> feeding it before you weaken it.


---

## A gate inside the tree is not a gate

The verdict was correct, central and computed once — and the page still rendered
its header, its pickers and its tab bar around a card saying the session could
not be shown. Every one of those components was individually right. The gate was
simply in the wrong place: rendered as a sibling of the panels, it could only
ever replace the panels.

"Decide once" and "decide early" are different requirements and the second is the
one that has teeth. A verdict that governs a page has to be taken *before* the
page — an early return, above the layout, so that an incomplete session produces
a different page rather than a different panel. What makes it enforceable is that
nothing below the return runs: there is no component left that could decide for
itself, because there is no component left at all.

The test follows from the same idea. Not "does the unavailable card appear" but
"is anything else on screen" — no tabs, no pickers, no tables, no chart surfaces.
An all-or-nothing contract is asserted by counting what must be absent.

> If a rule can be enforced by deleting the alternative rather than by every
> component agreeing to follow it, delete the alternative.

---

## The exemption list and the gate must not be the same list

`_MAY_BE_EMPTY` answers one question: which facets are honestly allowed to
count zero. `complete` needs to answer a different one: can this page be
reconstructed at all. V77 let the same three-item list answer both, which
meant a list wide enough to excuse Monaco's silent overtakes column also
excused Miami's empty race-control log — even though an empty race-control
log is never legitimate and an empty overtakes column often is. Widening
the list to fix one race weakened the gate for every other race that
depended on that facet actually being checked; narrowing it to fix the
other broke Monaco again. Two races kept swapping places release over
release because one list was doing a job that needed two.

The gate now reads only `essential_missing` — the facets a session cannot
be reconstructed without at all (results, entry list, lap times for a race
or sprint). `_MAY_BE_EMPTY` still exists, but only to choose the *wording*
a missing enriching facet gets in the sources panel; it has no vote on
whether the page renders. Whatever is in it, wide or narrow, `complete`
cannot move — proved by a test that mutates the list between empty, one
facet and three and asserts the gate never changes underneath it.

> A list built to forgive specific values is not safe to also use as a list
> of what may be absent. Forgiveness and admission are different questions;
> give them different lists, or the list that is right for one race is wrong
> for the next.

---

## A lap-count threshold is not a pixel threshold

The Position Chart decided two events were "near" each other — and so
needed separating onto different rows — using a percentage of the race's
total lap count. That rule has no relationship to the thing it was
protecting: where a chip actually renders, which is a function of
`lapToX`, track length and viewport width, not of how many laps apart two
events are. A 70-lap race's 6%-of-distance rule calls two events "far"
that can still land closer on screen than one chip is wide, on a narrow
viewport where every lap is a handful of pixels.

The row count had the same problem in miniature: two rows, alternating,
is a constant, and how many events can cluster within a few laps of each
other is not. A third close event always lands back on the first event's
row, however well the first two were separated — which is a safety car
sitting directly on a red flag, not an edge case.

The fix in both cases was to stop reasoning about laps and start reasoning
about the pixels the layout actually produces: measure each column's real
footprint from `lapToX` and its widest chip, then place columns into rows
with a classic interval-scheduling greedy that opens a new row only when
every existing row is still occupied at that x. There is no row ceiling,
because there is no reason to assume one. A second bug hid inside the fix
itself: the vertical distance between rows was a constant chosen by eye,
and it was a fraction of a pixel shorter than a rendered chip's real
height, so two cleanly-separated rows still touched. A screenshot at
normal zoom did not show it; comparing `getBoundingClientRect()` on the
actual chips did.

> If the thing you are protecting against is a pixel collision, the rule
> deciding when to protect against it has to be measured in pixels — and so
> does the check that confirms it worked.

---

## A facet the product cannot be read without must not be left to chance

There were two tiers of facet: essential ones the gate guarantees, and
enriching ones whose absence is explained and forgiven. `positions` was
filed as enriching — and every line chart in the product plots it. So the
gate passed a session as complete, the page rendered in full, and the
charts drew axes, gridlines and neutralisation bands over an empty plot,
with nothing anywhere saying the trace had not arrived.

The tiering was not wrong; the classification of that one facet was, and
the reason is instructive. A facet is enriching if the page still reads
without it, and "the page still renders" is not the same test. Weather can
vanish and the race is still legible. The position trace cannot: it is the
subject of the panel, and a panel whose subject is missing is not degraded,
it is empty.

The fix was not to promote it to essential, which would have blocked whole
races over a chart. `Lap.position` already carries the same information and
the lap table IS essential, so the trace is rebuilt from what we already
hold, at no network cost, marked as derived. Same shape as the entry-list
backfill before it, and the same lesson: when a facet is load-bearing and
some other facet already implies it, derive it rather than hoping a
provider sends it.

There is a cascade to watch for too. The overtake inference reads the
trace, so a missing position feed silently reported races in which nobody
passed anybody — a wrong answer, stated confidently, from an absence two
steps upstream.

> Ask what a panel is FOR, not whether the page survives without it. If the
> answer is "this facet", then something has to guarantee that facet — and a
> derivation you can always run beats a source that might answer.

---

## A demo that skips the pipeline is not standing in for it

Mock sessions were returned straight from the simulator: no derivations, no
ordering, no audit. Every real session went through all three. The demo
path was therefore not a stand-in for the product, it was a second product
that happened to render the same components.

That is what made the blank-charts bug invisible for an entire release
cycle. The simulator populates every facet, so the case where one is
missing could not occur locally, and the pipeline step that should have
covered it did not exist to be missed. Local review looked perfect while
production was broken, and no amount of care in the review would have
caught it, because the code under review was not the code being reviewed.

The offline half of post-processing — everything needing no network and no
knowledge of which provider answered — is now shared by both paths. The
provider-specific merges stay on the real path, because a demo has no
providers to merge from.

> Fixture data must travel the same road as real data for as far as that
> road has nothing to do with where the data came from. Every step you skip
> for the fixture is a step your tests and your own eyes cannot see.

---

## Free in development is not free in production

Three defects in this release shared one shape: correct code whose cost is
invisible on the machine it was written on.

* **380 KB of JSON with no compression.** One line of middleware turns it
  into 33 KB. Over loopback the difference is unmeasurable; over a real
  connection it is the page load.
* **`cache: "no-store"` on every call.** The strongest possible instruction
  — never cache this, not even for a Back — applied to a finished Grand
  Prix that cannot change. Locally, re-fetching is instant and looks like
  freshness. Hosted, it is the whole payload again on every tab change.
* **A round trip to be told what the URL already said.** `current()` gated
  the session fetch. One extra millisecond locally; one extra network
  latency in front of every arrival in production.

None of these are bugs in the sense of behaving wrongly. They behave
exactly as written. The environment changed the price, and nothing in the
local feedback loop reports a price.

> Latency and payload have to be measured where they are paid. If the only
> place you have ever run it has no network, you have not tested the part
> the network charges for.

---

## Pack the thing you can see; measure the thing that opens

Chips were packed so they can never overlap, and that was treated as the
collision problem solved. Each chip owns a 208px hover card — three times
the width of anything the packer measured — and a full-height column box
that neighbours overlap even when the chips do not.

Both were invisible to the check that had been written, because the check
looked at the resting state. The band at rest was provably correct while
the state a reader actually uses it in was not: cards covering the marker
you were comparing against, cards hanging off the end of the plot, and —
below a certain width — chips that could not be hovered at all, because a
neighbouring column box was taking the pointer with nothing on screen to
suggest it.

The layout rule that fixed it is worth keeping. **Position is data for a
chip and free for a card.** A chip has to sit at its lap or it is lying, so
it is packed and never moved. A card is transient explanation, so it may be
lifted clear of every row and clamped inside the plot. And a box that
exists only to hold something interactive should not itself be
interactive — the column stopped taking the pointer and the chips took it
back.

> A hover state is part of the layout, not a decoration on top of it.
> Anything that can appear has to be measured, and the assertion has to
> exercise the state the reader is actually in.

---

## Count the doors into your pipeline, then check every one

A session reaches the app three ways: a fresh fetch, the demo simulator, and
the cache. The derivations — entry list, position trace, FIA order, the audit
verdict — ran on exactly one of them. V79 found the demo door and fixed it,
declared the class closed, and shipped. The cache door was still open, and it
is the one production actually uses most.

The cache is the worst of the three to leave open, because of how its staleness
behaves. A laptop's cache is minutes old and was written by the code currently
running, so locally it is indistinguishable from a fresh fetch. In production it
long outlives the deploy that filled it — so an entry written before a fix keeps
that bug for the entry's whole lifetime, and the fix appears not to have worked.
**A cache is a copy of your pipeline's output frozen at the version that wrote
it.** Any derivation that runs only on the way in is silently versioned by the
cache entry rather than by the code.

Two rules came out of it. Derivations that need no network should run on the way
OUT as well as the way in, which costs nothing and makes every future fix
retroactive instead of waiting for expiry. And when you fix "the path that
skipped the pipeline", enumerate the paths first — the plural is the whole
finding, and stopping at the first one is how the same bug ships twice.

> When something is computed on entry, ask how many entrances there are. Then
> ask which of them your development environment never uses.

---

## The evidence should not outrank the finding

The results table printed `P17→P9 ▲8`. Everything needed is there and the
emphasis is backwards: two positions and an arrow are rendered at full weight,
and the one figure a reader actually wants — up eight — is the smallest, faintest
token in the cell, placed last. The cell leads with the inputs and buries the
conclusion.

Worse is what the same construction does when there is no conclusion. `P14→P14 —`
spends three tokens and the loudest glyph available to say that nothing happened,
pointing an arrow at a number identical to the one it came from. A row where
nothing happened should be the quietest row in its column; this made it one of
the busiest, and multiplied by fifteen mid-field finishers it is most of the
column.

The rule that replaced it is worth reusing anywhere a derived figure sits beside
its inputs: **lead with the derived value, keep the inputs as quiet support, and
when the derived value is nil, print the inputs once and stop.** A cell should be
loud in proportion to how much it has to say.

> If a row where nothing happened is as visually busy as a row where something
> did, the design is showing you its data model rather than its meaning.

---

## Use the domain's abbreviation, not one you invented

`DRIVE-THRU` was neither the penalty's name ("drive-through penalty") nor the
abbreviation the sport has used on timing screens for decades ("DT"). It was a
truncation invented at the point of rendering to make a long string fit a small
pill — and that is exactly why it read as raw data escaping into the interface.
An invented shortening looks like a string that was cut off. A conventional one
looks like domain fluency.

Every field has these, and they are almost always shorter, more precise and more
credible than anything invented under space pressure: DT, SG, DSQ, NC, +5s. The
full wording still has to be one hover away, because the abbreviation is for
recognition and the sentence is for understanding — but the badge should speak
the language of the thing it describes.

The same logic applies to iconography. One gavel on all eight penalty kinds meant
the icon carried no information: it said "steward" on a row whose colour already
said steward. A distinct mark per kind lets a badge be recognised before it is
read, which is the only reason to put a badge in a dense table at all.

> Before shortening a label yourself, find out what the people who do this for a
> living already call it.

---

## One symptom can have more than one cause, and a good explanation is not proof

V80 found that an empty entry list blanks every line chart. That was true,
reproducible, and fixed. It was also not the whole answer, and the report that
came back said so in a detail the diagnosis had walked past: the screenshot had
**no axes**. An empty entry list removes the series and leaves the axes
standing. Something else was removing the plot.

`total_laps` at zero does exactly that, by a completely different route — the
chart builds one row per lap, so zero rows, and then discards every position
point for failing `p.lap > total`. Same blank panel, different mechanism.

The lesson is about when to stop investigating. A hypothesis that explains the
failure is not the same as a hypothesis that explains **every detail of the
evidence**, and the leftover detail is where the second cause hides. "The
markers render but the axes don't" was in the first screenshot the whole time
and it did not fit, and the fix shipped anyway because the rest of the story was
so tidy.

> When your explanation accounts for the bug but not for one odd detail in the
> report, you have found *a* cause. Keep going until nothing in the evidence is
> left over.

---

## Derive a value where the data is complete, not where it is first available

Both blank-chart causes were the same shape. `total_laps` is computed by every
adapter as `max(lap for lap in laps)` at the moment it constructs the session —
which is before the merge step that fills in laps and positions from other
sources. A source with results but no lap table freezes the distance at zero
and nothing ever revisits it. The entry list had the identical problem.

The value is not wrong when it is written; it is written too early. Anything
derived from a collection has to be derived **after** every step that can add to
that collection, and the honest place for that is a single finalizer that runs
once the picture is complete — which also happens to be the place every entry
path can share.

There is a tell for this class: a field whose value is correct in development
and zero in production is usually a field computed from whichever source
answered first, on a machine where the same source always answers first.

> If a value summarises a collection, compute it downstream of everything that
> can change the collection. Anywhere else is a snapshot of a partial view.

---

## Two correct steps can still contradict each other

The pace leaderboard read 1, 2, 4, 5. Nothing in it was broken: the ranking
sorted correctly and assigned 1..N with no gaps, and the evaluability rule
correctly refused to assess a driver who retired. They ran in the wrong order,
so the ranker numbered people the next step then declared unrankable — and each
of those drivers **took a number out of the sequence and rendered as a dash**.
The number was spent and shown nowhere.

Neither function had a bug you could find by reading it. The bug was the
sequence, which lives in the caller and is invisible from inside either one. A
filter that runs after a ranking silently punches holes in it; a filter that
runs before it produces a dense ranking for free.

The tempting fix — renumber the visible rows in the component — would have
produced identical pixels and been wrong, because the rank is a field-wide claim
about car speed, not a row counter, and a counter would quietly redefine it.

> When you filter and rank the same collection, the filter goes first. If the
> displayed set and the ranked set are not the same set, the numbers are fiction.

---

## Emphasis is information, so unrecognised text must be left alone

Marking up analytical prose — driver codes, lap times, deltas — makes it
scannable, and every rule that adds emphasis is also a claim: *this token is a
driver*, *this number is a lap time*. A three-letter uppercase word is usually
a driver code and sometimes "FIA" or "DRS", and emphasising those as drivers
states something false about the sentence in the product's own visual language.

So the highlighter classifies conservatively and renders anything it does not
recognise exactly as it arrived. Being wrong is strictly worse than doing
nothing here: unstyled prose is merely plain, while confidently mis-styled prose
is misleading, and the reader has no way to tell which rule fired.

The restraint applies to the treatment too. It would have been easy to box every
token, and it would have looked like a scrapyard — a timing screen is dense,
quiet and typographic, and its authority comes from restraint. Weight, colour
and tabular figures were enough; nothing needed a border.

> Any rule that adds emphasis is asserting a fact. Give it a stoplist, and let
> it fall back to plain text whenever it is not sure.

---

## Check what the categories in a bug report actually are

The report was "bar charts work, line charts don't", and it was repeated for four
releases, including by me. It sent every investigation into the data pipeline,
because if one chart type works and another doesn't, the difference must be in
what they are being fed.

There is no bar chart in this product. Every recharts chart is a Line, an Area or
a Radar; the bars are `<span>` elements with a background colour and a percentage
width. The real division was **recharts / not recharts**, which points at the
library, not the data — a completely different half of the system.

Nobody was wrong to describe it that way: on screen, one is a line and one is a
bar. But a user's categories describe appearances, and appearances are not
implementation. Before trusting a distinction in a report, confirm the two groups
really are the two groups — one `grep` for `<Bar` would have redirected this
investigation four releases earlier.

> When a bug splits neatly along a category, verify the category exists in the
> code before you reason from it. The most expensive assumption is the one
> inherited from the report.

---

## A boolean that is silently false is worse than an exception

`isElement(child)` returned false, so `cloneElement` was skipped, so the chart
received no width, so it rendered `null`. Nothing threw. No warning, no error,
no console output. The container sat in the DOM at its correct size containing
nothing, and every diagnostic said the application was healthy.

This is the worst failure shape there is. An exception names its own location; a
false boolean in a ternary produces a perfectly valid render of nothing, and the
absence has to be traced backwards through every layer that *could* have caused
it. Three earlier releases each found a genuine bug capable of producing the same
blank panel, fixed it, and shipped — because the symptom was identical no matter
which layer failed.

What eventually worked was refusing to reason about *causes* and instead
measuring *the contract between two layers*: what exactly did `ResponsiveContainer`
hand to `LineChart`. `widthProp: undefined` located the bug in one reading, after
four releases of plausible theories.

> When something renders nothing, stop asking why it failed and start asking what
> it received. Inspect the boundary between layers, not the layers.

---

## A version pin is a promise; removing the dependency is a fact

The honest fix for React 19 breaking `react-is@16` is to pin React. We did not
rely on that, and the reason generalises.

A pin is a statement about an environment you do not control at the moment it
matters. This project pins `react` to an exact version and commits a lockfile,
and production still ran React 19 — so the promise was already being broken by
something in the build, and adding a stronger promise would not have found it.
Meanwhile the *code* had a genuine weakness: it depended on a third-party copy of
`react-is` recognising elements created by whatever React happened to be present.

Replacing `ResponsiveContainer` with fifteen lines that measure a box and call
`cloneElement` from the application's own React removes the coupling entirely.
The symbol can be renamed again, `react-is` can be duplicated by a bundler, a
future React can change element internals — none of it can reach this path,
because the path no longer asks anyone else what a React element is.

> Prefer deleting a dependency on someone else's assumption over asserting the
> assumption harder. A pin fails silently in an environment you cannot see; code
> that never needed the pin cannot.
