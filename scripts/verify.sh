#!/usr/bin/env bash
# Verification gate + evidence collector.
#   bash scripts/verify.sh            -> run all checks (no files written)
#   bash scripts/verify.sh phase-1    -> also save evidence to docs/proof/phase-1/
# Exit code != 0 if any check fails.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$PATH"

PHASE="${1:-}"
OUT=""
if [ -n "$PHASE" ]; then
  OUT="docs/proof/$PHASE"
  mkdir -p "$OUT/scenarios"
fi
FAIL=0
SUMMARY=()

step() { # name, command...
  local name="$1"; shift
  local log; log="$(mktemp)"
  if "$@" >"$log" 2>&1; then SUMMARY+=("PASS  $name"); else SUMMARY+=("FAIL  $name"); FAIL=1; fi
  if [ -n "$OUT" ]; then cp "$log" "$OUT/$name.log"; fi
  tail -n 4 "$log"
  rm -f "$log"
}

step typecheck npm run --silent typecheck
step build-headless npm run --silent build:headless
step unit-and-scenario-tests npx vitest run --reporter=verbose
step build-web npm run --silent build:web

# Determinism: run the default night twice with the same seed + inputs, compare bytes.
det() {
  local d; d="$(mktemp -d)"
  printf '{"frames":[{"tick":0,"move":[0.4,1]},{"tick":200,"move":[-1,0.2],"jump":true},{"tick":201,"jump":false},{"tick":400,"pulse":true},{"tick":401,"pulse":false}]}' >"$d/in.json"
  node build/headless/cli.js --seed 12345 --night 1 --inputs "$d/in.json" --ticks 6000 --out "$d/a.jsonl" &&
  node build/headless/cli.js --seed 12345 --night 1 --inputs "$d/in.json" --ticks 6000 --out "$d/b.jsonl" || return 1
  local ha hb; ha="$(shasum -a 256 <"$d/a.jsonl" | cut -d' ' -f1)"; hb="$(shasum -a 256 <"$d/b.jsonl" | cut -d' ' -f1)"
  echo "run A sha256=$ha lines=$(wc -l <"$d/a.jsonl")"
  echo "run B sha256=$hb lines=$(wc -l <"$d/b.jsonl")"
  [ "$ha" = "$hb" ] && echo "IDENTICAL" || { echo "DIFFERENT"; diff "$d/a.jsonl" "$d/b.jsonl" | head; return 1; }
}
step determinism det

# Save each scenario fixture's inputs + real CLI output as evidence.
if [ -n "$OUT" ]; then
  node scripts/run-fixtures.mjs "$OUT/scenarios" >"$OUT/scenarios/README.md" 2>&1 || { SUMMARY+=("FAIL  fixtures-evidence"); FAIL=1; }
  {
    echo "# Verification summary ($PHASE)"
    echo
    echo "- commit: $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- src tests game.contract.json || echo ' (+ uncommitted changes)')"
    echo "- date: $(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "- node: $(node -v), os: $(uname -sm)"
    echo "- command: bash scripts/verify.sh $PHASE"
    echo
    printf -- '- %s\n' "${SUMMARY[@]}"
  } >"$OUT/SUMMARY.md"
fi

echo "==== verify summary ===="
printf '%s\n' "${SUMMARY[@]}"
exit $FAIL
