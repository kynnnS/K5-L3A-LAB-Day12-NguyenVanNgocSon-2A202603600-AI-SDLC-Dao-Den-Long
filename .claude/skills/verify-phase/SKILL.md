---
name: verify-phase
description: Run the full verification gate (typecheck, unit + headless scenario tests via the real CLI, web build, determinism) and save evidence to docs/proof/<phase>/. Use before claiming a phase/task is done, before tagging, or when asked to "verify", "collect evidence", "prove it works".
---

# verify-phase

1. Run `bash scripts/verify.sh <phase>` (e.g. `phase-2`) from the repo root. Without an argument it only checks, writing nothing. It covers all 3 nights (fixtures carry `night`) and the per-night 21 600-tick performance budget.
2. Read `docs/proof/<phase>/SUMMARY.md`. Every line must be `PASS`.
3. For any `FAIL`, open the matching `docs/proof/<phase>/<step>.log`, fix the root cause in `src/` (never weaken a test or edit outputs to pass), and rerun.
4. Scenario evidence lives in `docs/proof/<phase>/scenarios/<fixture>/` (scenario.json, inputs.json, output.jsonl, expected.json, command.txt). These are real CLI outputs. Never hand-edit them.
5. Never overwrite an earlier phase's `docs/proof/phase-N/` folder. Update the traceability table in `docs/notes/<phase>.md` (Requirement → test/fixture → evidence path → PASS/FAIL/NOT VERIFIED). Anything not run is `NOT VERIFIED`. GUI/visual checks stay `NOT VERIFIED` until the human provides screenshots.
6. Report: which criteria failed or are unverified, plus the commit hash recorded in SUMMARY.md. Evidence must be regenerated after the final code commit of the phase so it matches the tag.
