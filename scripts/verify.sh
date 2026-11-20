#!/usr/bin/env bash
# Verification gate + evidence collector.
#   bash scripts/verify.sh            -> run all checks (no files written)
#   bash scripts/verify.sh phase-N    -> also save evidence to docs/proof/phase-N/
# The benchmark needs a visible browser window, so it is run separately: npm run bench (see README).
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

# Determinism: run each night twice with the same seed + inputs, compare bytes.
det() {
  local d; d="$(mktemp -d)"
  printf '{"frames":[{"tick":0,"move":[0.4,1]},{"tick":200,"move":[-1,0.2],"jump":true},{"tick":201,"jump":false,"dash":true},{"tick":202,"dash":false},{"tick":400,"pulse":true},{"tick":401,"pulse":false}]}' >"$d/in.json"
  local n
  for n in 1 2 3; do
    node build/headless/cli.js --seed 12345 --night $n --inputs "$d/in.json" --ticks 6000 --out "$d/a$n.jsonl" &&
    node build/headless/cli.js --seed 12345 --night $n --inputs "$d/in.json" --ticks 6000 --out "$d/b$n.jsonl" || return 1
    local ha hb; ha="$(shasum -a 256 <"$d/a$n.jsonl" | cut -d' ' -f1)"; hb="$(shasum -a 256 <"$d/b$n.jsonl" | cut -d' ' -f1)"
    echo "night $n run A sha256=$ha lines=$(wc -l <"$d/a$n.jsonl" | tr -d ' ')"
    echo "night $n run B sha256=$hb lines=$(wc -l <"$d/b$n.jsonl" | tr -d ' ')"
    [ "$ha" = "$hb" ] && echo "night $n IDENTICAL" || { echo "night $n DIFFERENT"; diff "$d/a$n.jsonl" "$d/b$n.jsonl" | head; return 1; }
  done
}
step determinism det

# Performance (Ticket-02 DoD): a full night (max 21 600 ticks) must finish in <= 30 s.
perf() {
  local d n t0 t1 ms; d="$(mktemp -d)"
  echo "machine: $(sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m), $(uname -sm), node $(node -v)"
  printf '{"player":{"flames":999}}' >"$d/s.json"  # keep Mây alive so the whole 21 600 ticks are simulated
  for n in 1 2 3; do
    t0=$(node -e 'console.log(Date.now())')
    node build/headless/cli.js --seed 7 --night $n --scenario "$d/s.json" --ticks 21600 --out "$d/p$n.jsonl" || return 1
    t1=$(node -e 'console.log(Date.now())'); ms=$((t1 - t0))
    echo "night $n: ticks=21600 wall=${ms} ms end=$(tail -1 "$d/p$n.jsonl")"
    [ "$ms" -le 30000 ] || { echo "night $n over budget"; return 1; }
  done
}
step performance perf

# Soak (Ticket-04 §2): the contract's soak_cmd, 10 nights, crashes = 0 and mem_end <= 1.2 x mem_start.
soak() {
  local d cmd; d="$(mktemp -d)"
  cmd="$(node -e 'console.log(require("./game.contract.json").soak_cmd)')"
  echo "soak_cmd: $cmd --seed 7 --nights 10"
  $cmd --seed 7 --nights 10 --out "$d/soak.json" || return 1
  cat "$d/soak.json"
  [ -n "$OUT" ] && cp "$d/soak.json" "$OUT/soak.json"
  node -e 'const r=require(process.argv[1]); const ok=r.crashes===0 && r.mem_end_mb<=1.2*r.mem_start_mb && r.results.length===r.nights;
    console.log(`crashes=${r.crashes} mem ${r.mem_start_mb} -> ${r.mem_end_mb} MB (ratio ${(r.mem_end_mb/r.mem_start_mb).toFixed(3)}, limit 1.2)`); process.exit(ok?0:1)' "$d/soak.json"
}
step soak soak

# Leaderboard export (Ticket-04 §3): run_cmd --export-leaderboard on a temporary board file.
lbexport() {
  local d cmd; d="$(mktemp -d)"
  cmd="$(node -e 'console.log(require("./game.contract.json").run_cmd)')"
  printf '{"entries":[{"name":"Mây_1","score":120,"nights_won":1,"achieved_at":"2026-11-20T10:00:00+07:00","seed":3},{"name":"Sơn","score":900,"nights_won":3,"achieved_at":"2026-11-20T11:00:00+07:00","seed":5}]}' >"$d/lb.json"
  echo "run_cmd: $cmd --export-leaderboard out.json"
  DDL_LEADERBOARD="$d/lb.json" $cmd --export-leaderboard "$d/out.json" || return 1
  cat "$d/out.json"
  node -e 'const e=require(process.argv[1]).entries; process.exit(e.length===2 && e[0].score===900 && e[1].score===120 ? 0 : 1)' "$d/out.json"
}
step leaderboard-export lbexport

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
