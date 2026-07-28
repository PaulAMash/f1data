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
