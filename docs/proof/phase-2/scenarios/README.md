# Scenario evidence (real CLI output)

Pass/fail against `expected.json` is asserted by `tests/scenarios/headless.test.ts` (see ../unit-and-scenario-tests.log).

| Fixture | Req | Description | Exit | Events | End line |
|---|---|---|---|---|---|
| 01-contract-example | P1-C3,C5,C6 (regression, standard numbers) | Contract v1.0 example with standard numbers: pickup radius 1.0 -> mote at z=5 picked at z>=4.0 = tick 40; carried 1 < pulse cost 3 -> no pulse; L1 at 25 out of range | 0 | 3 | `{"type":"end","ticks":240,"state":"playing","score":0}` |
| 02-collect-and-light | P1-C6 / T2-P1 lantern | 10 motes at z=2..20 picked at ticks 10,30,..,190 (z >= m-1); interact at L1 from z=23 -> deposit 10 (+100), lit (+100) = 200 | 0 | 13 | `{"type":"end","ticks":300,"state":"playing","score":200}` |
| 03-pulse-stun | T2-P1 pulse | Pulse (cost 3) hits S1 (3D 3.007 m) and S2 (4.904 m); push 4 m over ticks 1..15; still stunned at tick 120; +5 each | 0 | 2 | `{"type":"end","ticks":120,"state":"playing","score":10}` |
| 04-hit-and-drop | T2-P1 hit | Shade at 3.03 m chases at 4/60 m/tick -> within 1 m at tick 31; drops floor(4/2)=2 dropped motes (ttl 480 = 8 s), shade recoils | 0 | 2 | `{"type":"end","ticks":100,"state":"playing","score":0}` |
| 05-win-all-lit | T2-P1 win/score | 4 lanterns pre-lit (no points); deposit 10 into L5 -> won at tick 1: 100 + 100 + floor(299.983)*2=598 + 50*3 = 948 | 0 | 4 | `{"type":"end","ticks":1,"state":"won","score":948}` |
| 06-lose-dawn | T2-P1 win/lose | time_left_s 2 -> lost/dawn at tick 120 | 0 | 2 | `{"type":"end","ticks":120,"state":"lost","score":0}` |
| 07-lose-no-flames | T2-P1 hit + win/lose | 1 flame, shade 0.5 m away -> hit at tick 1 (drop floor(3/2)=1) -> lost/no_flames | 0 | 3 | `{"type":"end","ticks":1,"state":"lost","score":0}` |
| 08-safe-zone | T2-P1 safe zone | Player at lit L1 (0,0,25); shade 11 m away chases and is blocked just outside 6 m (z = 18.999) | 0 | 1 | `{"type":"end","ticks":300,"state":"playing","score":0}` |
| 09-default-night1 | T2-P1 spawns | Default Night 1, idle player: S1,S2 at tick 300 (spawning), S3 at 780; motes 20 + 1 at 240/480/720 = 23 (no shade can travel the 25 m needed to reach the player by then) | 0 | 4 | `{"type":"end","ticks":790,"state":"playing","score":0}` |
| 10-camera-yaw | P1-C5 movement | move [0,1] with cam_yaw_deg 90 goes +X 6 m; [1,1] normalised (6 m/s) | 0 | 1 | `{"type":"end","ticks":120,"state":"playing","score":0}` |
| 11-pulse-no-shades | T2-P1 pulse | Pulse with nothing in range still fires: stunned_ids [], costs 3, cooldown 3 s | 0 | 2 | `{"type":"end","ticks":10,"state":"playing","score":0}` |
| 12-multi-pickup-capacity | T2-P1 pickup | 4 motes within 1 m with carried 8/10 -> exactly 2 picked in tick 1 | 0 | 3 | `{"type":"end","ticks":5,"state":"playing","score":0}` |
| 13-id-generation | P1-C11 ids | Auto ids skip scenario ids: unnamed shades around S1 -> S2,S3; respawn at tick 240 after explicit M1 -> M2 | 0 | 1 | `{"type":"end","ticks":240,"state":"playing","score":0}` |
| 14-multi-shade-hit | T2-P1 hit (multi-event tick) | 3 shades on Mây: one flame per tick; invuln 90 -> hits at 1, 91, 181 (drops 2,1,0) -> lost at 181 | 0 | 5 | `{"type":"end","ticks":181,"state":"lost","score":0}` |
| 15-fall-respawn | T2-P1 fall | Walk off the 40 m edge: off at tick 6, y=-k(k+1)/360 < -10 at k=60 -> fall hit at tick 66 (lost 4); respawn at (0,0,0) at tick 126 with invuln | 0 | 2 | `{"type":"end","ticks":130,"state":"playing","score":0}` |
| 16-dash | T3 dash | Dash (idle -> facing +Z) at tick 1: 12 ticks x 14/60 = 2.8 m; press at 30 ignored (cooldown 90 from start); press at 90 -> dash at tick 91 | 0 | 3 | `{"type":"end","ticks":150,"state":"playing","score":0}` |
| 17-dash-air | T3 dash | Jump at tick 1, dash at tick 11: altitude held at y(10)=(70-110/6)/60=0.861 for the 12 dash ticks; vy frozen at 7-10/3 | 0 | 2 | `{"type":"end","ticks":33,"state":"playing","score":0}` |
| 18-charm | T3 wind charm | Night 2: C1 at (35,0,0) picked at tick 1 (walk from 34.5); then 7.2 m/s for ticks 2..61: x = 34.6 + 7.2 = 41.8 (bridge); charm 540 ticks left, respawn 2640 ticks | 0 | 2 | `{"type":"end","ticks":61,"state":"playing","score":0}` |
| 19-drifter-steal-before-hit | T3 drifter + tick order | Night 2: drifter steals min(3,6) before the shade hit in the same tick; hit drops floor(3/2)=1 | 0 | 3 | `{"type":"end","ticks":1,"state":"playing","score":0}` |
| 20-drifter-pulse-drop | T3 drifter | Night 2: pulse hits a fleeing drifter with 3 stolen -> drops 3 at (3,0,0) (ttl 8 s), flees 120 more ticks then removed at tick 121 | 0 | 3 | `{"type":"end","ticks":121,"state":"playing","score":0}` |
| 21-wind | T2-P2 night 3 wind | Night 3 (start (0,0,-30)): gust at tick 1800 for 300 ticks; 2 m/s -> 10 m displacement (checked in headless.test.ts) | 0 | 1 | `{"type":"end","ticks":2100,"state":"playing","score":0}` |
| 22-pause | T3 pause | Pause pressed at step 10 -> ticks 11..30 paused (sim_tick frozen at 10, time frozen); resumed at tick 31 | 0 | 3 | `{"type":"end","ticks":40,"state":"playing","score":0}` |
| 23-night2-pad | T2-P2 night 2 pad | Pad (20,0,18): launch at tick 1 (vy 14, 24 m/s toward B); y=(14n-n(n+1)/6)/60 hits 0 at n=83 -> lands tick 84 at ~(51.24,0,6.75) on island B | 0 | 1 | `{"type":"end","ticks":84,"state":"playing","score":0}` |
| 24-night3-ramp | T2-P2 night 3 ramp | Walk up the 30° ramp from r=31 for 9 m -> r=22 on tier 1 (y=3) at (19.053,3,11) | 0 | 1 | `{"type":"end","ticks":90,"state":"playing","score":0}` |
| 25-night3-wall | T2-P2 night 3 cliffs | Walking +Z from (0,0,-10.05) stops at the tier-2 cliff (r=8): z stays -8.05 | 0 | 1 | `{"type":"end","ticks":60,"state":"playing","score":0}` |
| 26-night3-pad-tier2 | T2-P2 night 3 pad | Pad (0,3,13): vy 12, 8 m/s to -Z; lands on tier 2 (y 6) at flight tick 49 -> tick 50, z = 13 - 49*8/60 = 6.467 | 0 | 1 | `{"type":"end","ticks":50,"state":"playing","score":0}` |
| 27-night2-bridge | T2-P2 night 2 bridge | Walk from (25,0,0) across the bamboo bridge to (50,0,0) on island B, no fall | 0 | 1 | `{"type":"end","ticks":250,"state":"playing","score":0}` |
| 28-night2-bridge-side-fall | T2-P2 night 2 bridge (no railing) | Step off the bridge side (z 2.05 at tick 6) -> fall hit at tick 66, lost 0 | 0 | 2 | `{"type":"end","ticks":70,"state":"playing","score":0}` |
