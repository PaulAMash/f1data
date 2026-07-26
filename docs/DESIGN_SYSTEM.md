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
