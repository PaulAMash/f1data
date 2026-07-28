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
* **Sparklines draw themselves in** left to right.
* **Selected states breathe** in their own accent colour.
* **Glyph tiles lift** slightly on hover, so what is interactive says so.

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

## Type: information-dense, still comfortable

Nothing meaningful renders below **11px**. Uppercase micro-labels sit at 11px;
scales and captions at 11–12px; supporting prose and drawer content at 12–13px.
A dashboard is read for hours, not glanced at once.

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
