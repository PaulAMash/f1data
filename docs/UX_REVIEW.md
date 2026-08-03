# Pitwall IQ — UX review

A standing critique of the product as a whole, kept in one place and updated per release
rather than forked per version. Findings are ordered by how much they cost the reader.

Last pass: **V63**. Reviewed at 1440×1000, 1440×900 and 390×844, in both themes, in both
language styles, and walked end to end as a first-time visitor down both branches of the
welcome screen — tutorial taken and tutorial declined — plus the return path through
Settings.

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

**And the original one: headless Chromium at `device_scale_factor: 2` does not run smooth
scrolling at all.** A bare
`window.scrollTo({top, behavior: "smooth"})` on any page is a no-op there, while instant
scrolling works normally. It looks exactly like a broken click handler and it is not — check
at DSF 1 before believing it.
