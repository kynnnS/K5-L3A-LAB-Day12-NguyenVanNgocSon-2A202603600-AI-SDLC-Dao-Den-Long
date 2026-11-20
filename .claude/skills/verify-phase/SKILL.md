---
name: verify-phase
description: Run the full verification gate (typecheck, unit + headless scenario tests via the real CLI, web build, determinism) and save evidence to docs/proof/<phase>/. Use before claiming a phase/task is done, before tagging, or when asked to "verify", "collect evidence", "prove it works".
---

# verify-phase

1. Run `bash scripts/verify.sh <phase>` (e.g. `phase-3`) from the repo root. Without an argument it only checks, writing nothing. It covers all 3 nights (fixtures carry `night`), the Contract v1.2 schema check on every fixture (`tests/scenarios/expect.ts`: fuel / ever_lit / relit_count / capacity / drain / new events, no `all_lit`) the per-night 21 600-tick performance budget, the soak test (`soak_cmd` from the contract: crashes 0, RSS ratio ≤ 1.2) and the leaderboard export (`run_cmd --export-leaderboard`). The 30 s benchmark needs a visible browser window, so run it separately (`npm run bench`) and keep the window in front.
2. Read `docs/proof/<phase>/SUMMARY.md`. Every line must be `PASS`.
3. For any `FAIL`, open the matching `docs/proof/<phase>/<step>.log`, fix the root cause in `src/` (never weaken a test or edit outputs to pass), and rerun.
4. Scenario evidence lives in `docs/proof/<phase>/scenarios/<fixture>/` (scenario.json, inputs.json, output.jsonl, expected.json, command.txt). These are real CLI outputs. Never hand-edit them.
5. Never overwrite an earlier (tagged) phase's `docs/proof/phase-N/` folder; use a new folder name for later re-runs. Update the traceability table in `docs/notes/<phase>.md` (Requirement → test/fixture → evidence path → PASS/FAIL/NOT VERIFIED). Anything not run is `NOT VERIFIED`. GUI/visual checks stay `NOT VERIFIED` until the human provides screenshots.
6. Report: which criteria failed or are unverified, plus the commit hash recorded in SUMMARY.md. Evidence must be regenerated after the final code commit of the phase so it matches the tag.
