/**
 * Stale-fetch doctor — `npm run doctor:fetches`
 *
 * V85 fixed two failures that a type checker cannot see and a screenshot only
 * catches if you happen to be looking at the right 200 milliseconds:
 *
 *   1. A SELECTION-KEYED FETCH WITH NO GUARD. Change a season three times in a
 *      second and three requests are in the air; the one the network finishes
 *      LAST writes the state. That put 2019's calendar under a picker reading
 *      2023, and an older request's failure over a season that had loaded
 *      perfectly well. Four of the five such fetches in the app had no guard.
 *
 *   2. A PICKER SEEDED WITH A RACE NOBODY ASKED FOR. The Race Explorer's
 *      initial state was the demo simulator's Austrian Grand Prix, rendered
 *      while `/api/current` was still in flight — measured on a 1.5s answer,
 *      it was on screen at t+80ms.
 *
 * Both are re-introducible by writing perfectly ordinary-looking code, so this
 * makes them loud. It is static: no browser, no server, no network. Like
 * `chart-runtime-doctor`, it is a diagnostic run by `make test`, not a build
 * gate — a check that can fail a deploy is a new way to break production.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const files = walk(ROOT);
const problems = [];

/* -------------------------------------------------------------------------- */
/* 1. Every api.* call inside a plain useEffect must guard its own answer.     */
/*                                                                            */
/* The guard can be `useFreshEffect` (the shared one — see lib/fresh) or a     */
/* hand-rolled `alive`/`live`/`cancelled` flag, because a couple of call sites */
/* predate the hook and are correct as written. What is not allowed is a       */
/* `.then(setSomething)` with nothing deciding whether that answer still       */
/* matters.                                                                   */
/* -------------------------------------------------------------------------- */
const EFFECT = /\b(useEffect|useFreshEffect)\s*\(\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{/g;

function effectBodies(src) {
  const out = [];
  for (const m of src.matchAll(EFFECT)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) break; }
    }
    out.push({
      hook: m[1],
      body: src.slice(start, i + 1),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

const GUARD =
  /\bfresh\s*\(\s*\)|\b(alive|live|cancel|cancelled|canceled|active|mounted)\b/;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("api.")) continue;
  for (const { hook, body, line } of effectBodies(src)) {
    // only effects that resolve something asynchronously into state
    if (!/\bapi\.\w+\(/.test(body)) continue;
    if (!/\.then\(|await\s/.test(body)) continue;
    if (!/\bset[A-Z]\w*\(/.test(body)) continue;
    if (hook === "useFreshEffect" && GUARD.test(body)) continue;
    if (hook === "useEffect" && GUARD.test(body)) continue;
    problems.push({
      file, line,
      what: `${hook} resolves an api.* call into state with no staleness guard`,
      fix: "wrap it in useFreshEffect (lib/fresh) and check fresh() before every setState",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* 2. No page may seed a picker with a Grand Prix.                            */
/*                                                                            */
/* A race name in a `useState` initialiser is, by construction, a race the     */
/* reader did not choose and the server did not name. Fixtures in `mock/` and  */
/* the deliberate "try one of these instead" list on the unavailable screen    */
/* are not selections and are exempt by shape: they are not initial state.     */
/* -------------------------------------------------------------------------- */
const SEEDED = /useState\s*(?:<[^>]*>)?\s*\(\s*\{[^}]*\bgp\s*:\s*["'][^"']+["']/;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const m = src.match(SEEDED);
  if (m) {
    problems.push({
      file, line: src.slice(0, m.index).split("\n").length,
      what: "a picker's initial state names a Grand Prix",
      fix: "start from null and render a skeleton until /api/current (or the URL) says which race it is",
    });
  }
}

/* -------------------------------------------------------------------------- */
console.log("\nStale-fetch doctor");
console.log(dim(`  ${files.length} source files scanned\n`));

if (!problems.length) {
  console.log(ok("  ✓ every selection-keyed fetch guards its own answer"));
  console.log(ok("  ✓ no picker is seeded with a Grand Prix"));
  console.log();
  process.exit(0);
}

for (const p of problems) {
  console.log(bad(`  ✗ ${relative(ROOT, p.file)}:${p.line}`));
  console.log(`      ${p.what}`);
  console.log(dim(`      → ${p.fix}`));
}
console.log();
process.exit(1);
