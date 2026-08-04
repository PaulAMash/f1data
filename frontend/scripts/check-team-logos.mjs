#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   What is in public/teams, and what the badge will do with each file.

   The constructor marks arrive in stages, so the useful question between
   releases is not "did the build pass" but "which teams are still on the drawn
   shield, and does the mark I just dropped in behave the way I think it does".
   This answers both without opening a browser.

   For every slug the product can render it reports:

     present     is there a file at all — a missing one is not an error, it is
                 the drawn shield, which is a designed state
     size        pixels, read straight out of the WEBP header. A mark below
                 MIN_EDGE is upscaled at the largest badge on a 2× display and
                 will look soft

   It deliberately stops there. The other two things that decide how a mark
   renders — its opaque coverage and the luminance of its ink — need the pixels
   decoded, and the badge already measures both on a canvas at runtime where
   the answer is free. Reproducing that here would mean a WEBP decoder in the
   build tooling and two implementations of the classification to keep in step.
   `public/teams/README.md` documents what those thresholds are.

       node scripts/check-team-logos.mjs
   --------------------------------------------------------------------------- */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "teams");
const MIN_EDGE = 96;          // 38px badge, 2× display, with headroom
const COMPOSED = 0.7;         // keep in step with LOGO_COMPOSED_COVERAGE

/* The 2026 grid, by the slug lib/constructors.ts derives from each name. */
const GRID = [
  ["Mercedes", "mercedes"], ["Ferrari", "ferrari"], ["McLaren", "mclaren"],
  ["Red Bull Racing", "red-bull"], ["Racing Bulls", "racing-bulls"],
  ["Alpine", "alpine"], ["Haas F1 Team", "haas"], ["Audi", "audi"],
  ["Williams", "williams"], ["Aston Martin", "aston-martin"], ["Cadillac", "cadillac"],
];

/* Dimensions straight out of the WEBP header — no dependency, and the three
   container shapes cover every encoder anybody ships a logo from. */
function webpSize(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const tag = buf.toString("ascii", 12, 16);
  if (tag === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  if (tag === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (tag === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

let missing = 0, soft = 0;
console.log("");
for (const [name, slug] of GRID) {
  const file = join(DIR, `${slug}.webp`);
  if (!existsSync(file)) {
    missing += 1;
    console.log(`  ·  ${name.padEnd(17)} ${(slug + ".webp").padEnd(20)} absent — drawn shield`);
    continue;
  }
  const buf = readFileSync(file);
  const dim = webpSize(buf);
  const edge = dim ? Math.max(dim.w, dim.h) : 0;
  const small = edge && edge < MIN_EDGE;
  if (small) soft += 1;
  console.log(
    `  ${small ? "!" : "✓"}  ${name.padEnd(17)} ${(slug + ".webp").padEnd(20)}` +
    `${dim ? `${dim.w}×${dim.h}` : "?"}`.padEnd(11) +
    `${(buf.length / 1024).toFixed(1)}kB`.padEnd(9) +
    (small ? `below ${MIN_EDGE}px — will soften at the 38px badge on a 2× display` : ""));
}

const extra = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.endsWith(".webp") && !GRID.some(([, s]) => `${s}.webp` === f))
  : [];
if (extra.length) console.log(`\n  unrecognised slug(s), never rendered: ${extra.join(", ")}`);

console.log(`\n  ${GRID.length - missing}/${GRID.length} marks present` +
  (soft ? `, ${soft} below ${MIN_EDGE}px` : "") +
  (missing ? `, ${missing} on the drawn shield` : "") +
  `\n  A file over ${(COMPOSED * 100).toFixed(0)}% opaque is treated as a composed roundel` +
  ` and rendered full-bleed without a livery field.\n`);
