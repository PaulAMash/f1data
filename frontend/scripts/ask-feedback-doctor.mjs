#!/usr/bin/env node
/**
 * A REGRESSION GUARD FOR THE ONE ASK BUG A TEST CANNOT SEE.
 *
 * The symptom the reader reported: the 👍/👎 on an answer sometimes vanished,
 * and sometimes came back already showing a rating they never gave.
 *
 * The cause was not the feedback code. It was `key={i}` on a list that GROWS AT
 * THE FRONT. React matches children by key, so when a new answer is unshifted
 * onto the history every existing card's index shifts by one — key 0 now names
 * a different answer. React sees "same key, new props", keeps the mounted
 * component and its state, and swaps the data underneath it. The `sent` state
 * of the answer that used to be first is now attached to the answer that is
 * first now. That is not a rendering glitch; it is the reader being shown a
 * judgement somebody else made about a different answer.
 *
 * WHY A SCRIPT RATHER THAN A UNIT TEST. Reproducing it needs a real React
 * reconciler, a real list mutation and a real assertion about component
 * identity — a test that is more machinery than the component it protects, in a
 * project with no component-test harness. The bug has exactly one shape, it is
 * visible in the source, and it will come back the moment someone types the
 * idiomatic `key={i}`. So this greps for the shape.
 *
 * Run: npm run doctor:feedback
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "src/components/strategy/QuestionBox.tsx";
const source = readFileSync(join(root, FILE), "utf8");

/* Comments describe the bug at length — including the buggy line, quoted. The
   scan has to run on code, or the explanation of the fix trips the check on the
   fix. (It did, once.) */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("//"))
  .join("\n");

const checks = [
  {
    /* Scoped to the HISTORY render on purpose. `key={i}` over the paragraphs
       inside one answer is fine — that list never reorders and its items have
       no state. The bug lives only where a list grows at the front and its
       children hold state. */
    name: "the answer history is keyed by a stable id, not by index",
    ok: () => {
      const at = code.indexOf("history.map(");
      if (at === -1) return false;
      const render = code.slice(at, at + 400);
      return !/key=\{\s*(i|idx|index)\s*\}/.test(render);
    },
    why: "`key={i}` over a list that prepends re-binds every card's state to the "
       + "wrong answer. Give each entry an id when it is created and key on that.",
  },
  {
    name: "each history entry carries its own id",
    ok: () => /id:\s*string/.test(code) && /key=\{entry\.id\}/.test(code),
    why: "The list must hold { id, answer } pairs so the key survives a prepend.",
  },
  {
    name: "the rating control seeds from the ref it is rendering",
    ok: () => /recallFeedback\(\s*refId\s*\)/.test(code),
    why: "Without seeding from storage, a re-mount forgets a rating the reader "
       + "already gave and offers the buttons again.",
  },
  {
    name: "re-seeding is bound to the ref, not to first mount",
    ok: () => /seededFor/.test(code) && /useEffect/.test(code),
    why: "A card reused for a different answer must re-read that answer's own "
       + "state, or it keeps showing the previous one's.",
  },
  {
    name: "a rating is final, not a toggle",
    ok: () => /if\s*\(\s*sent\s*!==\s*null\s*\)\s*return;/.test(code),
    why: "A second click must not flip or clear a recorded rating: the server "
       + "has it, and the UI would then disagree with the analytics.",
  },
  {
    name: "the action row renders unconditionally",
    ok: () => !/\{!!plain\s*&&[\s\S]{0,200}Rate/.test(code),
    why: "The thumbs used to be inside a block that only rendered when the "
       + "answer had plain text — which is why they sometimes disappeared.",
  },
];

let failed = 0;
for (const check of checks) {
  const pass = check.ok();
  if (!pass) failed++;
  console.log(`${pass ? "  ok  " : " FAIL "} ${check.name}`);
  if (!pass) console.log(`        ${check.why}`);
}

if (failed) {
  console.error(`\n${failed} feedback invariant${failed === 1 ? "" : "s"} broken in ${FILE}`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} Ask-feedback invariants hold.`);
