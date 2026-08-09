/**
 * Chart runtime doctor — `npm run doctor`
 *
 * V82 spent five rounds of production debugging on a failure that produced no
 * error, no warning and no visible clue: every recharts chart rendered as an
 * empty box because React 19 renamed the symbol that identifies an element, and
 * the `react-is` copy recharts depends on still tests for the old one. The chart
 * was handed no width, and a recharts chart without a width renders null.
 *
 * This makes that specific, silent incompatibility loud. It is a diagnostic, not
 * a build gate — it is deliberately NOT wired into `build`, because a check that
 * can fail a deploy is a new way to break production, and the application no
 * longer depends on the thing it checks (see components/charts/ChartBox).
 *
 * Run it whenever charts look wrong, or after any React / Next / recharts bump.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;

function version(pkg) {
  try { return require(`${pkg}/package.json`).version; } catch { return null; }
}

const react = version("react");
const reactDom = version("react-dom");
const next = version("next");
const recharts = version("recharts");
const reactIs = version("react-is");

console.log("\n  Chart runtime\n  " + "-".repeat(46));
console.log(`  react       ${react ?? "—"}`);
console.log(`  react-dom   ${reactDom ?? "—"}`);
console.log(`  next        ${next ?? "—"}`);
console.log(`  recharts    ${recharts ?? "—"}`);
console.log(`  react-is    ${reactIs ?? "—"}   (recharts' element check)\n`);

let problems = 0;

// 1. react / react-dom must agree, or hooks and elements come from two runtimes
if (react && reactDom && react !== reactDom) {
  console.log(bad(`  ✗ react (${react}) and react-dom (${reactDom}) differ.`));
  problems++;
}

// 2. THE V82 BUG. Does the react-is that recharts uses recognise an element
//    made by the installed React? If not, ResponsiveContainer silently declines
//    to pass width/height and every chart renders as an empty box.
try {
  const { isElement } = require("react-is");
  const React = require("react");
  const el = React.createElement("div");
  const recognised = isElement(el);
  const symbol = String(el.$$typeof);
  console.log(`  element symbol         ${symbol}`);
  console.log(`  react-is recognises it ${recognised ? ok("yes") : bad("NO")}`);
  if (!recognised) {
    problems++;
    console.log(bad(
      "\n  ✗ react-is cannot identify this React's elements.\n" +
      "    recharts' own ResponsiveContainer would render every chart as an\n" +
      "    empty box, with no error. This app does not use it (see ChartBox),\n" +
      "    so charts still work — but anything else relying on react-is may not."));
  }
} catch (e) {
  console.log(warn(`  ! could not run the element check: ${e.message}`));
}

// 3. THE CHECK THAT WOULD HAVE ENDED V82 IN ONE STEP. recharts declares which
//    React majors it supports, and 2.12.7 did not include 19. Running it under
//    React 19 is not a bug to be found, it is an unsupported pairing — and it
//    fails silently, chart by chart, in ways that each look like a fresh bug.
//    Ask the library what it supports before debugging what it does.
try {
  const peers = require("recharts/package.json").peerDependencies ?? {};
  const range = peers.react ?? "";
  const reactMajor = react ? react.split(".")[0] : null;
  if (range && reactMajor) {
    const supported = range.split("||").some((r) => r.trim().startsWith(`^${reactMajor}.`));
    console.log(`  recharts supports react ${range}`);
    if (!supported) {
      problems++;
      console.log(bad(
        `\n  ✗ recharts ${recharts} does not support React ${reactMajor}.\n` +
        "    Charts will fail in ways that look unrelated to each other:\n" +
        "    empty containers, missing series, axes with no ticks. Upgrade\n" +
        "    recharts or hold React at a supported major."));
    } else {
      console.log(`  react ${reactMajor} is ${ok("supported")}`);
    }
  }
} catch {
  /* recharts not installed — nothing to check */
}

// 4. Next 14 expects React 18; Next 15 ships React 19. A mismatch between the
//    repo's pin and what actually resolved is how the wrong React reaches a
//    deployment while the lockfile still says otherwise.
if (next && react) {
  const nextMajor = Number(next.split(".")[0]);
  const reactMajor = Number(react.split(".")[0]);
  const expected = nextMajor >= 15 ? 19 : 18;
  if (reactMajor !== expected) {
    problems++;
    console.log(bad(
      `\n  ✗ next ${next} expects React ${expected}, but React ${reactMajor} is installed.`));
  }
}

console.log(
  problems === 0
    ? ok("\n  ✓ chart runtime looks consistent.\n")
    : bad(`\n  ${problems} problem(s) found.\n`));
