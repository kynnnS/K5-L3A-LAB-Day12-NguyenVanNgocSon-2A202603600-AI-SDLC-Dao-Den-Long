#!/usr/bin/env bash
# Claude Code Stop hook: block the agent from finishing while tests are red.
# Exit 2 + stderr => Claude Code keeps the agent working and shows the reason.
cd "$(dirname "$0")/../.." || exit 0
export PATH="$HOME/.local/node/bin:$PATH"
INPUT="$(cat)"
# Avoid infinite loops: if we already blocked once in this stop cycle, let it stop (with a warning).
if echo "$INPUT" | grep -q '"stop_hook_active": *true'; then
  echo "stop-gate: tests were red on previous stop attempt; allowing stop to avoid a loop" >&2
  exit 0
fi
# Always run: the suite takes ~2 s, and committed-but-broken code must also be caught.
[ -d node_modules ] || exit 0
LOG="$(mktemp)"
if npm test --silent >"$LOG" 2>&1 && npm run --silent typecheck >>"$LOG" 2>&1; then
  rm -f "$LOG"; exit 0
fi
echo "stop-gate: tests or typecheck are FAILING. Fix them before finishing. Last output:" >&2
tail -n 30 "$LOG" >&2
rm -f "$LOG"
exit 2
