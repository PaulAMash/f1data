# Pitwall IQ — UX review

A standing critique of the product as a whole, kept in one place and updated per release
rather than forked per version. Findings are ordered by how much they cost the reader.

Last pass: **V54**. Reviewed at 1440×900 and 390×844, in both themes, with motion full and
calm.

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

### B. The landing statistics are hardcoded — *medium*

Season, race count and driver count are literals in `page.tsx`. They are currently true, and
they will quietly stop being true. `/api/meta` already knows the season and the calendar.
Wiring them costs a loading state in the stat band, which is why it has not been done — but
the standing rule in this repo is that a flourish may fail to *no* flourish and may never make
the product lie, and a stale literal is exactly that failure in slow motion.

### C. There is no footer, anywhere — *medium*

The landing page simply stops after the doors. There is nowhere to state what the data sources
are, what the project is, or that this is unofficial and unaffiliated. For a product built
entirely on somebody else's sport, that last one matters.

### D. Only the logo goes home — *low*

`/explorer` and `/history` offer no route back to the landing page except the wordmark, which
is a convention rather than an affordance. A "Home" item in the nav, or making the wordmark
visibly interactive, would close it.

### E. Two lint warnings are still standing — *low*

`PaceAnalysis.tsx:112` (missing `plot` dependency) and `HistoricalExplorer.tsx:72`
(unnecessary `nonce` dependency). Neither is currently a bug; both are the kind of dependency
drift that becomes one after an unrelated edit.

---

## Verification notes

One trap worth recording for anyone repeating this review with Playwright: **headless Chromium
at `device_scale_factor: 2` does not run smooth scrolling at all.** A bare
`window.scrollTo({top, behavior: "smooth"})` on any page is a no-op there, while instant
scrolling works normally. It looks exactly like a broken click handler and it is not — check
at DSF 1 before believing it.
