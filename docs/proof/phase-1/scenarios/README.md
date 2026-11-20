# Scenario evidence (real CLI output)

Pass/fail against `expected.json` is asserted by `tests/scenarios/headless.test.ts` (see ../unit-and-scenario-tests.log).

| Fixture | Req | Description | Exit | Events | End line |
|---|---|---|---|---|---|
| 01-contract-example | C3,C5,C6 | Exact example from Test Contract v1.0 (walk +Z, pick mote at z=5 when within 1.5 m) | 0 | 1 | `{"type":"end","ticks":240,"state":"playing","score":10}` |
| 02-collect-and-light | C6 | Walk to L1 collecting 5 motes, interact -> deposit 5 + lantern_lit | 0 | 7 | `{"type":"end","ticks":300,"state":"playing","score":150}` |
| 03-pulse-stun | C7 | Pulse with 4 light stuns shade within 6 m, pushes it 4 m, costs 2 | 0 | 1 | `{"type":"end","ticks":60,"state":"playing","score":25}` |
| 04-hit-and-drop | C8 | Shade 3 m away reaches hit radius 1 m at tick 35; drops floor(4*0.5)=2 | 0 | 1 | `{"type":"end","ticks":120,"state":"playing","score":0}` |
| 05-win-all-lit | C10 | 4 lanterns pre-lit (no points); deposit 5 into L5 -> won/all_lit at tick 1 with bonus | 0 | 3 | `{"type":"end","ticks":1,"state":"won","score":549}` |
| 06-lose-dawn | C10 | time_left_s 2 -> lost/dawn at tick 120, run stops early | 0 | 1 | `{"type":"end","ticks":120,"state":"lost","score":0}` |
| 07-lose-no-flames | C8,C10 | 1 flame, shade on player -> hit then lost/no_flames at tick 1 | 0 | 2 | `{"type":"end","ticks":1,"state":"lost","score":0}` |
| 08-safe-zone | C9 | Player stands at lit L1; chasing shade stops just outside safe_radius (6.001 m), never hits | 0 | 0 | `{"type":"end","ticks":900,"state":"playing","score":0}` |
| 09-default-night | C3,C4,C11 | Default Night 1, idle player: S1 spawns at tick 600 on r=38, hits at 1234 (37 m / 0.05833 m/tick = 635 steps), then every invuln 120 ticks -> lost/no_flames at 1474 | 0 | 5 | `{"type":"end","ticks":1474,"state":"lost","score":0}` |
| 10-camera-yaw | C5 | move [0,1] with cam_yaw_deg 90 goes +X; [1,1] normalised (speed 6 m/s) | 0 | 0 | `{"type":"end","ticks":120,"state":"playing","score":0}` |
| 11-pulse-no-shades | C7 | Pulse with no shade in range still fires: event with stunned_ids [], costs 2 light, no score | 0 | 1 | `{"type":"end","ticks":10,"state":"playing","score":0}` |
| 12-multi-pickup-capacity | C6 | 4 motes in range in one tick with carried 8/10: picks exactly 2 (carried 9, 10), 2 remain | 0 | 2 | `{"type":"end","ticks":5,"state":"playing","score":20}` |
| 13-id-generation | C11,D | Auto ids skip scenario ids: unnamed shades around explicit S1 get S2,S3; respawned mote after explicit M1 gets M2 (tick 180) | 0 | 0 | `{"type":"end","ticks":180,"state":"playing","score":0}` |
| 14-multi-shade-hit | C8,C10 | 3 shades on the player: one hit per tick, then invuln 120 ticks: hits at 1 (drop 2), 121 (drop 1), 241 (drop 0) -> lost/no_flames | 0 | 4 | `{"type":"end","ticks":241,"state":"lost","score":0}` |
| 15-no-world-boundary | C5,A8 | Walking 10 s along +Z covers player_speed*10 = 60 m (no island clamp; fall_enabled=false) | 0 | 0 | `{"type":"end","ticks":600,"state":"playing","score":0}` |
