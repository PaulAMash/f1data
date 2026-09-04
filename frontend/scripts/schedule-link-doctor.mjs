/**
 * Schedule-link doctor — `npm run doctor:links`
 *
 * V104 made a completed round on the Schedule page a real link into Explore.
 * The card had lifted and brightened under the cursor since V103 and then done
 * nothing when clicked, which is an affordance that lies; the fix was to make
 * the promise true rather than to take the hover away.
 *
 * Two things about that fix can be undone by writing perfectly ordinary code,
 * and neither is visible to a type checker or to a screenshot:
 *
 *   1. A SECOND WAY TO SPELL AN EXPLORE URL. The Explorer identifies a session
 *      from `year`, `gp` and `session` in the query string, and one call site
 *      writing that out by hand is one typo — or one un-encoded Grand Prix
 *      name — away from silently opening the wrong race. It already happened:
 *      the landing page's hand-written link interpolated an optional season and
 *      could emit `?year=undefined`. There is one builder, `lib/links`, and
 *      every link into Explore goes through it.
 *
 *   2. A CLICKABILITY RULE OF ITS OWN. Whether a round can be opened is a
 *      lifecycle question with an existing answer — `readableRace`, which is
 *      `session_available(gp, "Race")` read against the published instants.
 *      Deciding it instead from the event date, from `completed` alone, or from
 *      the position in the array creates a second definition that drifts from
 *      the Explorer's own gate, and the first symptom is a card that navigates
 *      to a session the backend then refuses.
 *
 * Static: no browser, no server, no network. Like the other doctors it is run
 * by `make test` rather than by `build` — a check that can fail a deploy is a
 * new way to break production.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/** The one module allowed to know how an Explore URL is spelled. */
const BUILDER = "src/lib/links.ts";

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(full)) files.push(full);
  }
})(SRC);

const findings = [];
const report = (file, line, what) =>
  findings.push({ file: relative(ROOT, file), line, what });

/** Source with comments blanked out.
 *
 * A structural check must not be satisfiable by prose. The first draft of this
 * doctor asked whether the file mentioned `readableRace` anywhere, and the
 * paragraph above the component explaining why it uses `readableRace` was
 * enough — so deleting the call while leaving the comment behind passed. The
 * comment describing a rule is not the rule. */
const code = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

for (const file of files) {
  const rel = relative(ROOT, file);
  const text = code(readFileSync(file, "utf8"));
  const lines = text.split("\n");

  // ---- 1. nobody spells an Explore destination by hand --------------------
  if (rel !== BUILDER) {
    lines.forEach((line, i) => {
      // A link to Explore that carries a query is a deep link, and a deep link
      // has a builder. `/explorer` on its own is the page itself and is fine.
      if (/["'`]\/explorer\?/.test(line) && !/tab=/.test(line)) {
        report(file, i + 1,
          "an Explore deep link written by hand — build it with explorerHref() "
          + "from lib/links so there is one convention for year/gp/session");
      }
    });
  }

  // ---- 2. the Schedule's cards are gated on the lifecycle ------------------
  if (/components\/schedule\/SeasonSchedule\.tsx$/.test(rel)) {
    // Called, not merely imported or mentioned — see `code` above.
    if (!/\breadableRace\s*\(/.test(text)) {
      report(file, 1,
        "a round's clickability must come from a readableRace() call — the "
        + "same lifecycle answer the Explorer's own gate reads");
    }
    if (!/\bexplorerHref\s*\(/.test(text)) {
      report(file, 1, "links into Explore must be built by explorerHref()");
    }
    // A card must not be made interactive from the event's own date, its
    // position, or the raw `completed` flag standing in for the lifecycle.
    lines.forEach((line, i) => {
      if (/<Link\b/.test(line) && /event\.(date|completed)|index|idx\b/.test(line)) {
        report(file, i + 1,
          "a card linked from a date, an index or `completed` rather than "
          + "from readableRace()");
      }
    });
  }
}

if (findings.length) {
  console.error("schedule-link doctor: %d finding(s)\n", findings.length);
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.what}\n`);
  process.exitCode = 1;
} else {
  console.log(`schedule-link doctor: clean (${files.length} files)`);
}
