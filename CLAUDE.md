# CLAUDE.md — Đảo Đèn Lồng (Day 12 AI-SDLC lab)

3D game (TypeScript + Three.js + Vite) with a deterministic headless runtime graded by hidden tests.

## Sources of truth (read before changing behaviour)
- `docs/requirements/PRD-0.md` (Contract v1.0), `docs/requirements/TICKET-02.md` (standard numbers, 3 maps, mandatory 12-step tick order) and `docs/requirements/TICKET-03.md` (lantern fuel, drain, dawn win, **Contract v1.2**). Priority: TICKET-03 > TICKET-02 > PRD-0 for replaced rules; unreplaced rules still apply.
- Design decisions: `docs/architecture/ADR-*.md`. Breaking changes per phase: `CHANGELOG.md`.
- `docs/notes/phase-N.md` — assumptions (A1…), acceptance criteria, traceability, evaluation.
- Never invent requirements. Ambiguity → add an assumption to the phase notes and test it.

## Architecture rules
- `src/core/` = ALL game rules. Pure TS: no DOM, no three, no `Math.random`, no `Date`. Fixed step 1/60 s.
- `step()` must keep Ticket-02's tick order (pause → counters → move/fall → pickups → lanterns → safe zones → pulse → shades/drifters → contacts → spawns → win/lose). Timers are countdowns decremented in step 2; check off-by-one by hand.
- Ticket-03: fuel is an **integer in 1/60 units** (6000 = 100.0; never floats). Step 2 also decays (1/tick) and drains (5/tick per `drain` shade); lanterns with fuel ≤ 0 go out right after step 2. Safe zone only when `lit && fuel >= 30` (`hasZone`). Win only at dawn: lit ≥ ceil(0.6 × lanterns) → `dawn_survived`, else `dawn`; `no_flames` always first. There is **no** `all_lit` and no early win.
- Capacity = `capacity(state, tuning)` (10 + 2 × successful lights, max 20). Never hard-code 10.
- `src/core/maps.ts` is the single source for ground/collision/spawns AND rendering; non-tuning standard numbers live in `src/core/constants.ts`.
- `src/headless/` = CLI only (args, file I/O, exit codes). `src/client/` = rendering/input only; it calls the same `step()`.
- Tuning numbers come ONLY from `game.contract.json` (`parseTuning`). Never duplicate them in code.
- Creative extras must not change headless output (gate them out of `src/core` or off by default in headless).

## Commands (verified, Node ≥ 20; local Node lives in `~/.local/node/bin`)
- Install/build: `npm ci && npm run build`
- Play: `npm start` (serves `dist/`), dev: `npm run dev`
- Tests: `npm test` (builds headless, then vitest: unit + real-CLI scenarios)
- Headless: `node build/headless/cli.js --seed 1 --night <1|2|3> --ticks 600 --out out.jsonl [--scenario f] [--inputs f] [--snapshot-every n]` (Contract v1.2)
- Full gate + evidence: `bash scripts/verify.sh phase-N` (skill: `verify-phase`)

## Test Contract guard
- Do not rename CLI flags, JSONL fields, event names, shade states (spawning/wander/chase/recoil/stunned/drain) or exit codes (0 ok / 1 usage / 2 malformed file). Contract is **v1.2**: lantern `fuel` (1 decimal, 0 when unlit) / `ever_lit` / `relit_count`, `player.capacity`, events `refuel` / `lantern_out` / `fuel_drain`, `lantern_lit.relight`.
- stdout stays empty; errors → stderr. Coordinates rounded to 3 decimals; same seed+inputs → identical bytes.
- Fixtures in `tests/scenarios/fixtures/` state expectations derived by hand (formula in `description`). Never "fix" a fixture by copying actual output; if a rule changes, change the fixture with a reason in the phase notes.
- Test helper `game()` turns off random spawns, drifters, charms AND wind: enable what a test needs explicitly (Phase 2 lesson).
- When a ticket replaces a rule, update or replace the affected tests and record name / old rule / new rule / reason in `docs/notes/phase-N.md`. Never skip a test silently (Phase 3 lesson).

## Definition of Done
`bash scripts/verify.sh phase-N` all PASS → evidence regenerated after the last code commit → phase notes updated (PASS / FAIL / NOT VERIFIED honestly) → small commits. The Stop hook (`scripts/hooks/stop-gate.sh`) blocks finishing while tests are red.

## Git & security
- Small commits (`feat|fix|test|docs|chore`). No force-push, no history rewrite, no retagging released tags.
- Push / tag / release only after the human confirms. Never commit `.env`, keys, `node_modules`, `dist`, `build`.
