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
