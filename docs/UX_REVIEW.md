# Pitwall IQ — UX review

A standing critique of the product as a whole, kept in one place and updated per release
rather than forked per version. Findings are ordered by how much they cost the reader.

Last pass: **V59**. Reviewed at 1440×900 and 390×844, in both themes, with motion full and
calm, and in both language styles.

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

---

## Verification notes

Three traps worth recording for anyone repeating this review with Playwright.

**A full-page screenshot lies about a page with `vh` units in it.** Chromium expands the
viewport to the full document height before capturing, so a hero declared `min-h-[80vh]`
becomes 80% of *the whole page* — 1,722px instead of 720 — and everything below it appears to
have vanished into empty space. Scroll a real viewport and capture that instead.

**`get_by_role("button", name="Next")` is not specific enough on a page with data in it.** A
race card whose accessible name happens to contain the word resolved alongside the tour's
control and every click timed out, which reads exactly like a broken button and is not one.
`exact=True`, always.

**And the original one: headless Chromium at `device_scale_factor: 2` does not run smooth
scrolling at all.** A bare
`window.scrollTo({top, behavior: "smooth"})` on any page is a no-op there, while instant
scrolling works normally. It looks exactly like a broken click handler and it is not — check
at DSF 1 before believing it.
