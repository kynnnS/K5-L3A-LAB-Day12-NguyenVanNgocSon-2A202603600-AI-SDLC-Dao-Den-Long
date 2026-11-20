# CLAUDE.md — Đảo Đèn Lồng (Day 12 AI-SDLC lab)

3D game (TypeScript + Three.js + Vite) with a deterministic headless runtime graded by hidden tests.

## Sources of truth (read before changing behaviour)
- `docs/requirements/PRD-0.md` — PRD-0 + **Test Contract v1.0** (verbatim). Later tickets go in `docs/requirements/`.
- `docs/notes/phase-N.md` — assumptions (A1…), acceptance criteria, traceability, evaluation.
- Never invent requirements. Ambiguity → add an assumption to the phase notes and test it.

## Architecture rules
- `src/core/` = ALL game rules. Pure TS: no DOM, no three, no `Math.random`, no `Date`. Fixed step 1/60 s.
- `src/headless/` = CLI only (args, file I/O, exit codes). `src/client/` = rendering/input only; it calls the same `step()`.
- Tuning numbers come ONLY from `game.contract.json` (`parseTuning`). Never duplicate them in code.
- Creative extras must not change headless output (gate them out of `src/core` or off by default in headless).

## Commands (verified, Node ≥ 20; local Node lives in `~/.local/node/bin`)
- Install/build: `npm ci && npm run build`
- Play: `npm start` (serves `dist/`), dev: `npm run dev`
- Tests: `npm test` (builds headless, then vitest: unit + real-CLI scenarios)
- Headless: `node build/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f] [--snapshot-every n]`
- Full gate + evidence: `bash scripts/verify.sh phase-N` (skill: `verify-phase`)

## Test Contract guard
- Do not rename CLI flags, JSONL fields, event names or exit codes (0 ok / 1 usage / 2 malformed file).
- stdout stays empty; errors → stderr. Coordinates rounded to 3 decimals; same seed+inputs → identical bytes.
- Fixtures in `tests/scenarios/fixtures/` state expectations derived by hand from tuning. Never "fix" a fixture by copying actual output; if a rule changes, change the fixture with a reason in the phase notes.

## Definition of Done
`bash scripts/verify.sh phase-N` all PASS → evidence regenerated after the last code commit → phase notes updated (PASS / FAIL / NOT VERIFIED honestly) → small commits. The Stop hook (`scripts/hooks/stop-gate.sh`) blocks finishing while tests are red.

## Git & security
- Small commits (`feat|fix|test|docs|chore`). No force-push, no history rewrite, no retagging released tags.
- Push / tag / release only after the human confirms. Never commit `.env`, keys, `node_modules`, `dist`, `build`.
