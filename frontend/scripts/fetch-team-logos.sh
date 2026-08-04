#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch the current grid's constructor marks into public/teams.
#
# The badge resolves /teams/<id>.webp by constructor name and falls back to the
# drawn shield when a file is absent, so running this is the whole integration:
# no code changes, no registry to update, no build step. Run it again whenever
# the grid changes — an entrant with no file simply keeps the shield.
#
#   ./scripts/fetch-team-logos.sh
#
# The source URLs carry content hashes and will change when the upstream CDN
# rebuilds. If one 404s, replace that line; if the HOST is unreachable, that is
# an egress policy, not a broken script (see public/teams/README.md).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/teams
BASE=https://cdn.search.brave.com/serp/v3/_app/immutable/assets
mkdir -p "$OUT"

# <slug used by lib/constructors.ts>  <upstream filename>
MARKS="
mercedes      mercedes.bTTfVi4b.webp
ferrari       ferrari.D3LTYTxT.webp
mclaren       mclaren.D6QmbpoO.webp
red-bull      redbullracing.B450ci8E.webp
racing-bulls  racingbulls.B_6TLV0Q.webp
alpine        alpine.DEU-n-u_.webp
haas          haas.BQ1A48nR.webp
audi          audi.C0yzHlkS.webp
williams      williams.BIWO4wOu.webp
aston-martin  astonmartin.D1MU-tFj.webp
cadillac      cadillac.CzsCBC8d.webp
"

fail=0
while read -r slug file; do
  [ -z "${slug:-}" ] && continue
  if curl -fsS --max-time 45 -o "$OUT/$slug.webp" "$BASE/$file"; then
    printf '  ok    %-14s %s\n' "$slug" "$(wc -c < "$OUT/$slug.webp") bytes"
  else
    printf '  FAIL  %-14s %s\n' "$slug" "$BASE/$file" >&2
    rm -f "$OUT/$slug.webp"
    fail=1
  fi
done <<< "$MARKS"

[ "$fail" -eq 0 ] || { echo "One or more marks did not download; the badge falls back to the drawn shield for those teams." >&2; exit 1; }
echo "All marks in $OUT."
