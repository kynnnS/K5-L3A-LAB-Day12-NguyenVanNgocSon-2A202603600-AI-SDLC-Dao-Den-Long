/**
 * Unit tests for the Ticket-02 standard core. Expected numbers come from Ticket-02 text or are
 * derived by hand in comments; they are never copied from program output.
 * Note: input frame ticks are absolute (state.tick), as in the contract.
 */
import { describe, expect, it } from 'vitest';
import { getMap, groundHeight } from '../../src/core/maps.js';
import { runHeadless } from '../../src/core/run.js';
import { createGame, distXZ, timeLeft } from '../../src/core/sim.js';
import { FormatError, createInputReader, parseInputs, parseScenario } from '../../src/core/spec.js';
import type { InputFrame } from '../../src/core/spec.js';
import { IDLE, T, contract, game, names, runSteps } from '../helpers.js';

const L5 = ['L1', 'L2', 'L3', 'L4', 'L5'];
const ev = (e: ReturnType<typeof runSteps>, name: string) => e.filter((x) => x.event.name === name);

describe('T1 contract v1.1 + standard numbers (Ticket-02 Part 1 / Part 4)', () => {
  // Updated for Ticket-03 (v1.2: night durations 240/270/300, fuel keys, per_mote 5, no time bonus) and
  // Ticket-04 (v1.3: bench_cmd + soak_cmd; tuning unchanged).
  it('declares v1.3 with bench_cmd / soak_cmd and the exact standard tuning', () => {
    expect(contract.contract_version).toBe('1.3');
    expect(contract.bench_cmd).toBe('node build/headless/bench.js');
    expect(contract.soak_cmd).toBe('node --expose-gc --jitless build/headless/soak.js');
    expect(contract.tuning).toEqual({
      player_speed: 6, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1,
      interact_radius: 2, pulse_cost: 3, pulse_radius: 5, night1_duration_s: 240, flames: 3, invuln_s: 1.5,
      hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4, pulse_cooldown_s: 3, safe_radius: 6,
      shade_speed: 4, shade_hit_radius: 1, fall_enabled: true, dash_speed: 14, dash_duration_s: 0.2,
      dash_cooldown_s: 1.5, night2_duration_s: 270, night3_duration_s: 300,
      fuel_max: 100, fuel_decay_per_s: 1, fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5,
      low_fuel_threshold: 30, capacity_max: 20,
      score: { per_mote: 5, per_lantern: 100, per_stun: 5, per_second_left: 0, per_flame_left: 50 },
    });
  });
});

describe('T2 standard maps (Ticket-02 Part 2)', () => {
  it('lantern coordinates and spawn point counts', () => {
    expect(getMap(1, T).lanterns.map((l) => l.pos)).toEqual([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]);
    expect(getMap(2, T).lanterns.map((l) => l.pos)).toEqual([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]);
    expect(getMap(3, T).lanterns.map((l) => l.pos)).toEqual([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]);
    expect([1, 2, 3].map((n) => getMap(n, T).motePoints.length)).toEqual([24, 24, 30]);
    expect([1, 2, 3].map((n) => getMap(n, T).shadePoints.length)).toEqual([12, 16, 16]);
    const p0 = getMap(1, T).shadePoints[0]!; // r = 37 at 15° (angle from +X towards +Z)
    expect(p0[0]).toBeCloseTo(37 * Math.cos(Math.PI / 12), 9);
    expect(p0[2]).toBeCloseTo(37 * Math.sin(Math.PI / 12), 9);
    expect(getMap(3, T).shadeSpeed).toBe(4.5);
    expect(getMap(1, T).shadeSpeed).toBe(4);
  });
  it('ground heights: island edges, bridge, tiers, ramps', () => {
    const [m1, m2, m3] = [getMap(1, T), getMap(2, T), getMap(3, T)];
    expect(groundHeight(m1, 0, 40)).toBe(0);
    expect(groundHeight(m1, 0, 40.01)).toBeNull();
    expect(groundHeight(m2, 35, 0)).toBe(0); // bridge
    expect(groundHeight(m2, 35, 2.01)).toBeNull(); // no railing
    expect(groundHeight(m2, 70, 27.9)).toBe(0); // island B
    expect(groundHeight(m3, 0, 5)).toBe(6); // tier 2
    expect(groundHeight(m3, 0, 18)).toBe(3); // tier 1 (z > 0)
    expect(groundHeight(m3, 0, -18)).toBe(0); // tier 0 (z < 0 half)
    expect(groundHeight(m3, 0, 10)).toBe(0); // between tier 2 and tier 1
    const a = Math.PI / 6; // ramp at 30°: r = 27 is halfway -> 1.5 m
    expect(groundHeight(m3, 27 * Math.cos(a), 27 * Math.sin(a))).toBeCloseTo(1.5, 9);
  });
});

describe('T3 movement, jump', () => {
  it('runs 6 m/s (instant accel, assumption B1) and rotates by cam_yaw_deg', () => {
    const s = game();
    runSteps(s, 60, [{ tick: 0, move: [0, 1] }]);
    expect(s.player.pos[2]).toBeCloseTo(6, 6);
    const r = game();
    runSteps(r, 60, [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }]);
    expect(r.player.pos[0]).toBeCloseTo(6, 6);
    const n = game();
    runSteps(n, 60, [{ tick: 0, move: [1, 1] }]);
    expect(Math.hypot(n.player.pos[0], n.player.pos[2])).toBeCloseTo(6, 6);
  });
  it('jump 7 m/s with g = 20 (apex <= 1.225 m), only from the ground', () => {
    const s = game();
    const frames: InputFrame[] = [{ tick: 0, jump: true }, { tick: 5, jump: false }, { tick: 6, jump: true }];
    let apex = 0;
    for (let k = 0; k < 100; k++) { runSteps(s, 1, frames); apex = Math.max(apex, s.player.pos[1]); }
    expect(apex).toBeGreaterThan(1.15); // discrete apex (7n - n(n+1)/6)/60 at n = 20 -> 1.1667
    expect(apex).toBeLessThanOrEqual(1.225 + 1e-9); // second press in the air ignored
    expect(s.player.grounded).toBe(true);
  });
});

describe('T4 dash', () => {
  it('14 m/s for 12 ticks = 2.8 m; cooldown 90 ticks from the start; holding does not retrigger', () => {
    const s = game();
    const e = runSteps(s, 200, [
      { tick: 0, dash: true }, { tick: 20, dash: false }, { tick: 30, dash: true }, { tick: 40, dash: false },
      { tick: 90, dash: true }, // step 90 -> tick 91 = 90 ticks after the first dash (tick 1): allowed
    ]);
    expect(ev(e, 'dash').map((x) => x.tick)).toEqual([1, 91]);
    expect(s.player.pos[2]).toBeCloseTo(5.6, 6); // standing still: dash along facing (+Z)
  });
  it('dash in the air keeps altitude; no invulnerability', () => {
    const s = game();
    runSteps(s, 10, [{ tick: 0, jump: true }]);
    const y = s.player.pos[1];
    runSteps(s, 12, [{ tick: 0, jump: true }, { tick: 10, dash: true }]);
    expect(s.player.pos[1]).toBeCloseTo(y, 9);
    expect(s.player.invulnTicks).toBe(0);
  });
});

describe('T5 pickup + lanterns + safe zone', () => {
  it('pickup at XZ <= 1.0 m and height diff <= 1.5 m', () => {
    const s = game({ motes: [{ pos: [1, 0, 0] }, { pos: [1.01, 0, 0] }, { pos: [0, 1.6, 0.5] }] });
    expect(names(runSteps(s, 1))).toEqual(['mote_picked']);
    expect(s.motes.length).toBe(2);
  });
  // Updated for Ticket-03: +5 per mote (was +10); lantern_lit carries relight:false.
  it('partial deposits are remembered; +5 per deposited mote, +100 when first lit', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 4 } });
    runSteps(s, 2, [{ tick: 0, interact: true }]);
    expect(s.lanterns[0]).toMatchObject({ deposited: 4, lit: false });
    expect(s.score).toBe(20);
    s.player.carried = 10;
    const e = runSteps(s, 2, [{ tick: 0, interact: false }, { tick: 3, interact: true }]);
    expect(e.map((x) => x.event)).toEqual([
      { name: 'deposit', data: { lantern_id: 'L1', amount: 6, deposited: 10 } },
      { name: 'lantern_lit', data: { lantern_id: 'L1', relight: false } },
    ]);
    expect(s.player.carried).toBe(4);
    expect(s.score).toBe(20 + 30 + 100);
  });
  it('equal distance -> smaller id', () => {
    const s = game({ player: { carried: 3 }, lanterns: [{ id: 'L3', pos: [1, 0, 0] }, { id: 'L2', pos: [-1, 0, 0] }] });
    const e = runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(e[0]!.event).toEqual({ name: 'deposit', data: { lantern_id: 'L2', amount: 3, deposited: 3 } });
  });
  it('lit zone blocks chasing shades at the 6 m edge', () => {
    const s = game({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ id: 'A', pos: [0, 1, 14] }] });
    let minD = Infinity;
    for (let i = 0; i < 300; i++) { runSteps(s, 1); minD = Math.min(minD, distXZ(s.shades[0]!.pos, [0, 0, 25])); }
    expect(minD).toBeGreaterThan(6);
    expect(minD).toBeLessThan(6.01);
  });
  it('a shade inside when the lantern is lit leaves within 30 ticks and is harmless meanwhile', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 10 }, shades: [{ id: 'A', pos: [0.3, 1, 24.5] }] });
    const e = runSteps(s, 30, [{ tick: 0, interact: true }]);
    expect(names(e)).toEqual(['deposit', 'lantern_lit']); // no player_hit although it touches Mây
    expect(distXZ(s.shades[0]!.pos, [0, 0, 25])).toBeGreaterThan(6);
  });
});

describe('T6 pulse', () => {
  it('costs 3, 3D radius 5 from feet + 0.8, stun 120 ticks, push 4 m over 15 ticks, +5 each', () => {
    const s = game({ player: { carried: 3 }, shades: [{ id: 'A', pos: [3, 1, 0] }, { id: 'B', pos: [0, 1, 4.9] }, { id: 'C', pos: [-4.5, 1, -2.5] }] });
    const e = runSteps(s, 1, [{ tick: 0, pulse: true }]);
    // C: sqrt(4.5^2 + 0.2^2 + 2.5^2) = 5.15 > 5 -> not hit
    expect(ev(e, 'pulse')[0]!.event.data).toEqual({ stunned_ids: ['A', 'B'] });
    expect(s.player.carried).toBe(0);
    expect(s.score).toBe(10);
    runSteps(s, 14);
    expect(s.shades[0]!.pos[0]).toBeCloseTo(7, 9);
    expect(s.shades[1]!.pos[2]).toBeCloseTo(8.9, 9);
    runSteps(s, 105); // tick 120: stunned on ticks 1..120 (120 ticks)
    expect(s.shades[0]!.state).toBe('stunned');
    runSteps(s, 1); // tick 121
    expect(s.shades[0]!.state).not.toBe('stunned');
  });
  it('not enough light -> nothing; same position -> push +X; re-pulse refreshes and scores again', () => {
    const poor = game({ player: { carried: 2 }, shades: [{ id: 'A', pos: [1, 1, 0] }] });
    expect(names(runSteps(poor, 1, [{ tick: 0, pulse: true }]))).not.toContain('pulse');
    const s = game({ player: { carried: 6 }, shades: [{ id: 'A', pos: [0, 1, 0], state: 'stunned', state_ticks_left: 50 }] });
    runSteps(s, 1, [{ tick: 0, pulse: true }]);
    expect(s.shades[0]!.stateTicks).toBe(120);
    expect(s.shades[0]!.pos[0]).toBeCloseTo(4 / 15, 9);
    expect(s.score).toBe(5);
  });
  it('knock-back stops at an obstacle (island edge)', () => {
    const s = game({ player: { pos: [37, 0, 0], carried: 3 }, shades: [{ id: 'A', pos: [39, 1, 0] }] });
    runSteps(s, 20, [{ tick: 0, pulse: true }]);
    // Ticket-02 "dừng nếu gặp vật cản": 3 full pushes reach 39.8, the 4th stops AT the r = 40 edge
    // (was 39.8 before the Phase 2 review: the whole step used to be dropped, stopping short).
    expect(s.shades[0]!.pos[0]).toBeCloseTo(40, 6);
    expect(s.shades[0]!.pos[0]).toBeLessThanOrEqual(40);
  });
  it('knock-back stops at the edge of a lit safe zone (not short of it)', () => {
    // L1 lit at (0,0,22): zone edge z = 16. Shade at z = 14.5, player at z = 12.5 -> push +Z.
    const s = game({ player: { pos: [0, 0, 12.5], carried: 3 }, lanterns: [{ id: 'L1', pos: [0, 0, 22], lit: true }], shades: [{ id: 'A', pos: [0, 1, 14.5] }] });
    runSteps(s, 20, [{ tick: 0, pulse: true }]);
    // 14.5 + 5 x 0.2667 = 15.833 < 16; the 6th push stops at the zone edge z = 16.
    expect(s.shades[0]!.pos[2]).toBeCloseTo(16, 6);
  });
  it('scenario shade at y = 0 is placed at ground + 1 (PRD example uses y = 0)', () => {
    // Pulse centre y = 0.8; shade XZ 4.97 m away. Centre at y 1 -> 3D 4.974 <= 5 -> stunned.
    const s = game({ player: { carried: 3 }, shades: [{ id: 'A', pos: [4.97, 0, 0] }] });
    expect(s.shades[0]!.pos[1]).toBe(1);
    runSteps(s, 1, [{ tick: 0, pulse: true }]);
    expect(s.shades[0]!.state).toBe('stunned');
  });
  it('scenario shade in recoil (default) moves exactly 2 m like a hit', () => {
    const s = game({ player: { pos: [-20, 0, 0] }, shades: [{ id: 'A', pos: [0, 1, 0], state: 'recoil' }] });
    runSteps(s, 59);
    expect(s.shades[0]!.pos[0]).toBeCloseTo(59 * (2 / 60), 9);
    runSteps(s, 1); // 60th moving tick: 2 m total, recoilDir points away from Mây (+X)
    expect(s.shades[0]!.pos[0]).toBeCloseTo(2, 9);
    expect(s.shades[0]!.state).toBe('recoil');
  });
});

describe('T7 shades: states, hits, recoil, drops', () => {
  it('spawning 60 ticks -> wander; chase at <= 12 m; give up at > 18 m', () => {
    const s = game({ shades: [{ id: 'A', pos: [11, 1, 0], state: 'spawning' }] });
    runSteps(s, 59);
    expect(s.shades[0]!.state).toBe('spawning');
    expect(s.shades[0]!.pos[0]).toBe(11);
    runSteps(s, 1);
    expect(s.shades[0]!.state).toBe('chase');
    const far = game({ shades: [{ id: 'A', pos: [17, 1, 0], state: 'chase' }] });
    runSteps(far, 1);
    expect(far.shades[0]!.state).toBe('chase'); // 17 <= 18
    const lost = game({ shades: [{ id: 'A', pos: [18.5, 1, 0], state: 'chase' }] });
    runSteps(lost, 1);
    expect(lost.shades[0]!.state).toBe('wander');
  });
  it('hit: -1 flame, drop floor(c/2) on a 1.5-2.5 m ring with TTL 480, invuln 90, hitter recoils 2 m in 60 ticks', () => {
    const s = game({ player: { carried: 5 }, shades: [{ id: 'A', pos: [0.5, 1, 0] }] });
    const e = runSteps(s, 1);
    expect(e[0]!.event).toEqual({ name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 2 } });
    expect(s.motes.map((m) => [m.kind, m.ttlTicks])).toEqual([['dropped', 480], ['dropped', 480]]);
    for (const m of s.motes) {
      const d = distXZ(m.pos, s.player.pos);
      expect(d).toBeGreaterThanOrEqual(1.5);
      expect(d).toBeLessThanOrEqual(2.5);
    }
    const x0 = s.shades[0]!.pos[0];
    runSteps(s, 60);
    expect(s.shades[0]!.pos[0] - x0).toBeCloseTo(2, 9);
    expect(s.shades[0]!.state).toBe('recoil');
    expect(s.player.invulnTicks).toBe(30);
  });
  it('several shades in one tick -> one flame; next hit only after 90 ticks (ids ascending)', () => {
    const s = game({ shades: [{ id: 'S2', pos: [0.2, 1, 0] }, { id: 'S1', pos: [-0.2, 1, 0] }, { id: 'S10', pos: [0, 1, 0.2] }] });
    const e = runSteps(s, 200);
    expect(ev(e, 'player_hit').map((x) => x.tick)).toEqual([1, 91, 181]);
    expect(ev(e, 'game_over')[0]!.event.data).toEqual({ result: 'lost', reason: 'no_flames' });
  });
  it('dropped motes expire after 480 ticks', () => {
    const s = game({ motes: [{ pos: [30, 0, 0], kind: 'dropped', ttl_ticks: 480 }] });
    runSteps(s, 479);
    expect(s.motes.length).toBe(1);
    runSteps(s, 1);
    expect(s.motes.length).toBe(0);
  });
});

describe('T8 falling off the island', () => {
  it('walk off the edge: once, ignores invuln, loses all motes, respawn after 60 ticks with invuln 90', () => {
    const s = game({ player: { pos: [0, 0, 39.45], carried: 4, invuln_ticks: 500 } });
    const e = runSteps(s, 140, [{ tick: 0, move: [0, 1] }, { tick: 15, move: [0, 0] }]);
    const falls = ev(e, 'player_hit');
    expect(falls.length).toBe(1);
    // off at tick 6 (z 40.05), falling from tick 7: y = -k(k+1)/360 < -10 first at k = 60 -> tick 66
    expect(falls[0]).toEqual({ tick: 66, event: { name: 'player_hit', data: { by: 'fall', flames: 2, dropped: 0, lost: 4 } } });
    expect(s.player.pos).toEqual([0, 0, 0]); // respawned at tick 126
    expect(s.player.invulnTicks).toBe(90 - 14);
  });
  it('fall with the last flame -> lost immediately (no respawn)', () => {
    const s = game({ player: { pos: [0, 0, 39.95], flames: 1 } });
    const e = runSteps(s, 200, [{ tick: 0, move: [0, 1] }]);
    expect(e.at(-1)!.event).toEqual({ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
  });
});

describe('T9 win / lose priority', () => {
  // Replaced for Ticket-03 (was: all lit -> won 'all_lit', score with floor(left) x 2). Same setup,
  // new rule: dawn_survived; dawn bonus = per lit lantern 50 + floor(real fuel), 50 per flame, no time bonus.
  it('lantern lit on the dawn tick counts -> dawn_survived; dawn bonus from real fuel', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true })), time_left_s: 1 / 60 });
    const e = runSteps(s, 5, [{ tick: 0, interact: true }]);
    expect(e.at(-1)!.event).toEqual({ name: 'game_over', data: { result: 'won', reason: 'dawn_survived' } });
    // L2..L5: 100 - 1/60 after step 2 -> floor 99; L1 lit in step 5 -> 100
    expect(s.score).toBe(10 * 5 + 100 + 4 * (50 + 99) + (50 + 100) + 50 * 3);
  });
  it('no flames beats dawn in the same tick', () => {
    const s = game({ player: { flames: 1 }, shades: [{ id: 'A', pos: [0.5, 1, 0] }], time_left_s: 1 / 60 });
    expect(runSteps(s, 5).at(-1)!.event.data).toEqual({ result: 'lost', reason: 'no_flames' });
  });
  it('dawn when time runs out', () => {
    const s = game({ time_left_s: 1 });
    expect(runSteps(s, 100).at(-1)).toEqual({ tick: 60, event: { name: 'game_over', data: { result: 'lost', reason: 'dawn' } } });
  });
});

describe('T10 pause', () => {
  it('freezes sim_tick, time, cooldowns, spawns; tick still advances', () => {
    const s = createGame(T, 3, 1);
    const e = runSteps(s, 400, [{ tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 110, pause: true }]);
    expect(names(e).filter((n) => n === 'paused' || n === 'resumed')).toEqual(['paused', 'resumed']);
    expect(s.tick).toBe(400);
    expect(s.simTick).toBe(300); // paused on ticks 11..110
    expect(timeLeft(s)).toBeCloseTo(240 - 300 / 60, 9); // Ticket-03: night 1 = 240 s (was 300)
    expect(ev(e, 'shade_spawned').map((x) => x.tick)).toEqual([400, 400]); // sim tick 300 = tick 400
  });
});

describe('T11 drifters', () => {
  it('steal happens before a shade hit in the same tick; only once; removed 240 ticks later', () => {
    const s = game({ player: { carried: 6 }, drifters: [{ id: 'D1', pos: [0.5, 1, 0] }], shades: [{ id: 'S1', pos: [0.3, 1, 0.3] }] }, 2);
    const e = runSteps(s, 1);
    expect(names(e)).toEqual(['drifter_steal', 'player_hit']);
    expect(e[0]!.event.data).toEqual({ drifter_id: 'D1', amount: 3, carried: 3 });
    expect(e[1]!.event.data).toEqual({ by: 'shade', flames: 2, dropped: 1 });
    s.shades = []; // keep the night going (otherwise more hits end it before tick 241)
    const e2 = runSteps(s, 239);
    expect(names(e2)).not.toContain('drifter_steal');
    expect(s.drifters.length).toBe(1);
    runSteps(s, 1);
    expect(s.drifters.length).toBe(0);
  });
  it('idle -> chase only when carrying >= 5 within 15 m', () => {
    const s = game({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [10, 1, 0] }] }, 2);
    runSteps(s, 1);
    expect(s.drifters[0]!.state).toBe('idle');
    s.player.carried = 5;
    runSteps(s, 1);
    expect(s.drifters[0]!.state).toBe('chase');
  });
  it('pulse on a chasing drifter -> flee without stealing; on a fleeing one with loot -> drops it all', () => {
    const s = game({ player: { carried: 8 }, drifters: [{ id: 'D1', pos: [3, 1, 0], state: 'chase' }] }, 2);
    runSteps(s, 1, [{ tick: 0, pulse: true }]);
    expect(s.drifters[0]).toMatchObject({ state: 'flee', stolen: 0 });
    const f = game({ player: { carried: 3 }, drifters: [{ id: 'D1', pos: [3, 1, 0], state: 'flee', stolen: 3 }] }, 2);
    const e = runSteps(f, 1, [{ tick: 0, pulse: true }]);
    expect(ev(e, 'drifter_drop')[0]!.event.data).toEqual({ drifter_id: 'D1', amount: 3 });
    expect(f.motes.map((m) => [m.kind, m.pos])).toEqual([['dropped', [3, 0, 0]], ['dropped', [3, 0, 0]], ['dropped', [3, 0, 0]]]);
    runSteps(f, 119);
    expect(f.drifters.length).toBe(1);
    runSteps(f, 1);
    expect(f.drifters.length).toBe(0);
  });
  it('drifters spawn at 1200, 2400 (max 2), only nights 2-3 by default', () => {
    const s = createGame(T, 5, 2, { random_shades: false });
    runSteps(s, 3600);
    expect(s.drifters.map((d) => d.id)).toEqual(['D1', 'D2']);
    const n1 = createGame(T, 5, 1, { random_shades: false });
    runSteps(n1, 1300);
    expect(n1.drifters.length).toBe(0);
  });
});

describe('T12 wind charm', () => {
  it('pickup gives 600 ticks of 7.2 m/s and cooldown-free dash (not while dashing); respawns after 2700 ticks', () => {
    const s = game({ player: { pos: [35, 0, 0.5] }, charms: [{ id: 'C1' }] }, 2);
    const e = runSteps(s, 1);
    expect(e[0]!.event).toEqual({ name: 'charm_picked', data: { charm_id: 'C1', charm_ticks: 600 } });
    const x0 = s.player.pos[0];
    runSteps(s, 60, [{ tick: 0, move: [1, 0] }]);
    expect(s.player.pos[0] - x0).toBeCloseTo(7.2, 6);
    // presses read at ticks 61 (dash 62..73), 66 (while dashing: ignored), 80 (dash at 81, no cooldown)
    const d = runSteps(s, 40, [{ tick: 0, dash: true }, { tick: 65, dash: false }, { tick: 66, dash: true }, { tick: 70, dash: false }, { tick: 80, dash: true }]);
    expect(ev(d, 'dash').map((x) => x.tick)).toEqual([62, 81]);
    runSteps(s, 2700 - 101);
    expect(s.charms[0]!.available).toBe(false); // tick 2700
    runSteps(s, 1);
    expect(s.charms[0]!.available).toBe(true); // tick 2701 = 2700 ticks after pickup
  });
});

describe('T13 strong wind (night 3)', () => {
  it('every 30 s for 5 s, pushes 2 m/s', () => {
    const s = createGame(T, 9, 3, { random_motes: false, random_shades: false, random_drifters: false, motes: [], charms: [] });
    runSteps(s, 1799);
    expect(s.wind.active).toBe(false);
    const p0: [number, number] = [s.player.pos[0], s.player.pos[2]];
    runSteps(s, 1);
    expect(s.wind.active).toBe(true);
    runSteps(s, 299);
    expect(s.wind.active).toBe(true);
    runSteps(s, 1);
    expect(s.wind.active).toBe(false);
    expect(Math.hypot(s.player.pos[0] - p0[0], s.player.pos[2] - p0[1])).toBeCloseTo(10, 6);
    const n1 = createGame(T, 9, 1, { random_shades: false });
    runSteps(n1, 1801);
    expect(n1.wind.active).toBe(false);
  });
});

describe('T14 terrain: pads, bridge, ramps, walls, tower', () => {
  it('night 2 pad launches to island B in ~1.4 s (lands on tick 84)', () => {
    const s = game({ player: { pos: [20, 0, 18] } }, 2);
    let landed = -1;
    for (let i = 0; i < 120 && landed < 0; i++) { runSteps(s, 1); if (i > 2 && s.player.grounded) landed = s.tick; }
    expect(landed).toBe(84);
    expect(distXZ(s.player.pos, [70, 0, 0])).toBeLessThan(28);
  });
  it('night 2 bridge: walk A -> B without falling', () => {
    const s = game({ player: { pos: [25, 0, 0] } }, 2);
    const e = runSteps(s, 250, [{ tick: 0, move: [1, 0] }]);
    expect(names(e)).not.toContain('player_hit');
    expect(s.player.pos[0]).toBeCloseTo(50, 6);
    expect(s.player.pos[1]).toBe(0);
  });
  it('night 3: ramp to tier 1, tier-2 cliff blocks, pad lands on tier 2, tower blocks', () => {
    const u = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)] as const;
    const s = game({ player: { pos: [31 * u[0], 0, 31 * u[1]] } }, 3);
    runSteps(s, 90, [{ tick: 0, move: [-u[0], -u[1]] }]);
    expect(s.player.pos[1]).toBe(3);
    const w = game({ player: { pos: [0, 0, -10.05] } }, 3);
    runSteps(w, 60, [{ tick: 0, move: [0, 1] }]);
    expect(w.player.pos[2]).toBeCloseTo(-8.05, 6);
    const p = game({ player: { pos: [0, 3, 13] } }, 3);
    runSteps(p, 60);
    expect(p.player.pos[1]).toBe(6);
    expect(p.player.pos[2]).toBeCloseTo(13 - (8 * 49) / 60, 6); // lands on tick 50 after 49 flight moves
    const t = game({ player: { pos: [0, 6, 4] } }, 3);
    runSteps(t, 60, [{ tick: 0, move: [0, -1] }]);
    expect(t.player.pos[2]).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase 2 review fixes', () => {
  it('dash during a pad launch follows the launch direction, not the stick (B15)', () => {
    const s = game({ player: { pos: [20, 0, 18] } }, 2);
    runSteps(s, 1); // tick 1: pad launch toward island B
    expect(s.player.launch).not.toBeNull();
    runSteps(s, 1, [{ tick: 1, move: [-1, 0], dash: true }]); // stick points away from B
    const [ux, uz] = [50 / Math.hypot(50, 18), -18 / Math.hypot(50, 18)];
    expect(s.player.dashDir[0]).toBeCloseTo(ux, 9);
    expect(s.player.dashDir[1]).toBeCloseTo(uz, 9);
  });
  it('mote respawn skips points occupied by scenario motes (no free point -> skip)', () => {
    const pts = getMap(1, T).motePoints;
    const s = game({ random_motes: true, player: { carried: 10 }, motes: pts.map((p) => ({ pos: [...p] as [number, number, number] })) });
    runSteps(s, 240);
    expect(s.motes.length).toBe(pts.length); // all points taken: tick 240 spawns nothing
    const one = game({ random_motes: true, player: { carried: 10 }, motes: pts.slice(1).map((p) => ({ pos: [...p] as [number, number, number] })) });
    runSteps(one, 240);
    expect(one.motes.length).toBe(pts.length);
    expect(one.motes.at(-1)!.pos).toEqual(pts[0]); // the only free point
  });
  it('end record never says paused (Contract: playing | won | lost); snapshot does', () => {
    const lines = runHeadless({ tuning: T, seed: 1, night: 1, ticks: 40, snapshotEvery: 10, frames: [{ tick: 29, pause: true }] }).map((l) => JSON.parse(l) as Record<string, any>);
    expect(lines.filter((l) => l.type === 'snapshot').at(-1)!.state).toBe('paused');
    expect(lines.at(-1)).toMatchObject({ type: 'end', state: 'playing', ticks: 40 });
  });
});

describe('Phase 1-2 hardening (review test gaps)', () => {
  it('night 2: shades 2 at 300 then every 420 up to 8; drifters at 1200 and 2400 (max 2)', () => {
    const s = createGame(T, 5, 2, { player: { flames: 999 } });
    const e = runSteps(s, 3300);
    expect(ev(e, 'shade_spawned').map((x) => x.tick)).toEqual([300, 300, 720, 1140, 1560, 1980, 2400, 2820]);
    expect(s.shades.length).toBe(8); // 3240 skipped: cap 8
    expect(s.nextDrifterId - 1).toBe(2); // D1 at 1200, D2 at 2400, none at 3600 window
  });
  it('night 3: shades 2 at 300 then every 360 up to 10', () => {
    const s = createGame(T, 5, 3, { player: { flames: 999 } });
    const e = runSteps(s, 3600);
    expect(ev(e, 'shade_spawned').map((x) => x.tick)).toEqual([300, 300, 660, 1020, 1380, 1740, 2100, 2460, 2820, 3180]);
    expect(s.shades.length).toBe(10); // 3540 skipped: cap 10
  });
  it('spawned shades appear >= 15 m from Mây (all nights)', () => {
    for (const n of [1, 2, 3] as const) {
      const s = createGame(T, 9, n, { player: { flames: 999 } });
      for (let k = 0; k < 2000; k++) {
        const before = new Set(s.shades.map((x) => x.id));
        const at = [...s.player.pos] as [number, number, number];
        runSteps(s, 1);
        for (const sh of s.shades) if (!before.has(sh.id)) expect(distXZ(sh.pos, at)).toBeGreaterThanOrEqual(15);
      }
    }
  });
  it('night 3 shades chase at 4.5 m/s (night 1: 4 m/s)', () => {
    const n3 = game({ player: { pos: [0, 0, -30] }, shades: [{ id: 'A', pos: [10, 0, -30], state: 'chase' }] }, 3);
    runSteps(n3, 1);
    expect(n3.shades[0]!.pos[0]).toBeCloseTo(10 - 4.5 / 60, 9);
    const n1 = game({ shades: [{ id: 'A', pos: [10, 0, 0], state: 'chase' }] }, 1);
    runSteps(n1, 1);
    expect(n1.shades[0]!.pos[0]).toBeCloseTo(10 - 4 / 60, 9);
  });
  it('scenario countdowns: N ticks left -> state ends in the snapshot of tick N', () => {
    const s = game({ player: { pos: [-30, 0, 0] }, shades: [{ id: 'A', pos: [0, 0, 0], state: 'stunned', state_ticks_left: 5 }] });
    runSteps(s, 4);
    expect(s.shades[0]!.state).toBe('stunned');
    runSteps(s, 1);
    expect(s.shades[0]!.state).toBe('wander');
    // invuln_ticks 3: protected at ticks 1-2, hit on tick 3
    const h = game({ player: { invuln_ticks: 3 }, shades: [{ id: 'A', pos: [0.5, 1, 0], state: 'stunned', state_ticks_left: 1 }] });
    const e = runSteps(h, 3);
    expect(ev(e, 'player_hit').map((x) => x.tick)).toEqual([3]);
    // charm_ticks 2: 7.2 m/s on ticks 1-1, normal speed from tick 2 (counter hits 0 in step 2)
    const c = game({ player: { charm_ticks: 2 } });
    runSteps(c, 2, [{ tick: 0, move: [0, 1] }]);
    expect(c.player.pos[2]).toBeCloseTo(7.2 / 60 + 6 / 60, 9);
  });
  it('motes dropped at the island edge land on ground (B14 re-roll), inside the 1.5-2.5 m ring', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = game({ player: { pos: [39.5, 0, 0], carried: 10 }, shades: [{ id: 'A', pos: [39.5, 1, 0.5] }] }, 1, seed);
      runSteps(s, 1);
      expect(s.motes.length).toBe(5);
      for (const m of s.motes) {
        expect(groundHeight(getMap(1, T), m.pos[0], m.pos[2])).not.toBeNull();
        const r = distXZ(m.pos, [39.5, 0, 0]);
        expect(r).toBeGreaterThanOrEqual(1.5);
        expect(r).toBeLessThanOrEqual(2.5);
      }
    }
  });
  it('chasing shade slides around the night 3 bell tower instead of sticking (B20)', () => {
    const s = game({ player: { pos: [1, 6, 5], flames: 99 }, shades: [{ id: 'A', pos: [0, 6, -5], state: 'chase' }] }, 3);
    const e = runSteps(s, 400);
    expect(ev(e, 'player_hit').length).toBeGreaterThan(0); // reached Mây behind the tower
  });
});

describe('T15 spawns + determinism', () => {
  it('night 1: 20 motes on distinct standard points; +1 every 240; shades 2 at 300 then every 480', () => {
    const s = createGame(T, 11, 1);
    expect(new Set(s.motes.map((m) => m.point)).size).toBe(20);
    const e = runSteps(s, 790);
    expect(s.motes.length).toBe(23); // 240, 480, 720
    expect(ev(e, 'shade_spawned').map((x) => [x.tick, x.event.data])).toEqual([[300, { id: 'S1' }], [300, { id: 'S2' }], [780, { id: 'S3' }]]);
    for (const sh of s.shades) expect(sh.id).toMatch(/^S\d$/);
  });
  it('same seed -> identical; different seed -> different', () => {
    const a = runHeadless({ tuning: T, seed: 42, night: 3, ticks: 4000, snapshotEvery: 10 });
    const b = runHeadless({ tuning: T, seed: 42, night: 3, ticks: 4000, snapshotEvery: 10 });
    const c = runHeadless({ tuning: T, seed: 43, night: 3, ticks: 4000, snapshotEvery: 10 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('T16 input / scenario validation', () => {
  it('rejects malformed inputs and scenarios', () => {
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 5 }] })).toThrow(FormatError);
    expect(() => parseInputs({ frames: [{ tick: 0, dash: 1 }] })).toThrow(FormatError);
    expect(() => parseScenario({ lanterns: [{ id: 'L6' }] }, L5)).toThrow(FormatError);
    expect(() => parseScenario({ shades: [{ pos: [0, 0, 0], state: 'angry' }] }, L5)).toThrow(FormatError);
    expect(() => parseScenario({ drifters: [{ pos: [0, 0, 0], state: 'removed' }] }, L5)).toThrow(FormatError);
    expect(() => parseScenario({ charms: [{ id: 'C9' }] }, L5, ['C1'])).toThrow(FormatError);
  });
  it('held input values; dash/pause default false', () => {
    const read = createInputReader(parseInputs({ frames: [{ tick: 2, move: [1, 0], dash: true }] }));
    expect(read(0)).toEqual(IDLE);
    expect(read(3)).toMatchObject({ move: [1, 0], dash: true, pause: false });
  });
});
