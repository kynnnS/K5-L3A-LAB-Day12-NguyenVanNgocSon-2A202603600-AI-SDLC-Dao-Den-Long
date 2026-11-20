import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../src/core/run.js';
import { createGame, distXZ, secondsToTicks, timeLeft } from '../../src/core/sim.js';
import { FormatError, createInputReader, parseInputs, parseScenario } from '../../src/core/spec.js';
import { IDLE, T, contract, game, names, runSteps } from '../helpers.js';

const L = ['L1', 'L2', 'L3', 'L4', 'L5'];

describe('C1 contract file', () => {
  it('declares v1.0 with all tuning keys and 5 lanterns', () => {
    expect(contract.contract_version).toBe('1.0');
    for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) expect(typeof contract[k]).toBe('string');
    expect(T.lantern_count_night1).toBe(5);
    expect(Object.keys(contract.tuning).sort()).toEqual([
      'carry_capacity', 'fall_enabled', 'flames', 'hit_drop_ratio', 'interact_radius', 'invuln_s',
      'lantern_cost', 'lantern_count_night1', 'night1_duration_s', 'pickup_radius', 'player_speed',
      'pulse_cooldown_s', 'pulse_cost', 'pulse_push_m', 'pulse_radius', 'pulse_stun_s', 'safe_radius',
      'score', 'shade_hit_radius', 'shade_speed',
    ]);
    expect(createGame(T, 1).lanterns.map((l) => l.id)).toEqual(L);
  });
});

describe('C3 tick model', () => {
  it('starts at origin with tuning values; time_left = duration - steps/60', () => {
    const s = createGame(T, 1);
    expect(s.player.pos).toEqual([0, 0, 0]);
    expect(s.player.flames).toBe(T.flames);
    expect(timeLeft(s)).toBe(T.night1_duration_s);
    runSteps(s, 90);
    expect(s.tick).toBe(90);
    expect(timeLeft(s)).toBeCloseTo(T.night1_duration_s - 1.5, 9);
  });
  it('--ticks N runs exactly N steps; snapshot every K starting at 0; end is last', () => {
    const lines = runHeadless({ tuning: T, seed: 3, ticks: 25, snapshotEvery: 10 }).map((l) => JSON.parse(l));
    const snaps = lines.filter((l) => l.type === 'snapshot').map((l) => l.tick);
    expect(snaps).toEqual([0, 10, 20]);
    expect(lines.at(-1)).toMatchObject({ type: 'end', ticks: 25, state: 'playing' });
  });
});

describe('C5 movement', () => {
  it('moves player_speed m/s along +Z at yaw 0', () => {
    const s = game();
    runSteps(s, 60, [{ tick: 0, move: [0, 1] }]);
    expect(s.player.pos[2]).toBeCloseTo(T.player_speed, 6);
    expect(s.player.pos[0]).toBeCloseTo(0, 9);
  });
  it('rotates input by cam_yaw_deg (90deg: z input -> +X, x input -> -Z)', () => {
    const a = game();
    runSteps(a, 60, [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }]);
    expect(a.player.pos[0]).toBeCloseTo(T.player_speed, 6);
    expect(a.player.pos[2]).toBeCloseTo(0, 6);
    const b = game();
    runSteps(b, 60, [{ tick: 0, move: [1, 0], cam_yaw_deg: 90 }]);
    expect(b.player.pos[2]).toBeCloseTo(-T.player_speed, 6);
  });
  it('normalises vectors longer than 1', () => {
    const s = game();
    runSteps(s, 60, [{ tick: 0, move: [1, 1] }]);
    expect(Math.hypot(s.player.pos[0], s.player.pos[2])).toBeCloseTo(T.player_speed, 6);
  });
  it('jump leaves the ground and lands back at y = 0', () => {
    const s = game();
    runSteps(s, 10, [{ tick: 0, jump: true }]);
    expect(s.player.pos[1]).toBeGreaterThan(0.3);
    runSteps(s, 120);
    expect(s.player.pos[1]).toBe(0);
  });
  it('has no world boundary (fall_enabled=false, A8): 12 s walk = 12 * player_speed', () => {
    const s = game({ player: { pos: [0, 0, 50] } });
    runSteps(s, 60 * 12, [{ tick: 0, move: [0, 1] }]);
    expect(s.player.pos[2]).toBeCloseTo(50 + 12 * T.player_speed, 6);
  });
  it('normalises the raw vector (no per-component clamp): [2,1] keeps its direction', () => {
    const s = game();
    runSteps(s, 60, [{ tick: 0, move: [2, 1] }]);
    expect(s.player.pos[0]).toBeCloseTo((2 / Math.sqrt(5)) * T.player_speed, 6);
    expect(s.player.pos[2]).toBeCloseTo((1 / Math.sqrt(5)) * T.player_speed, 6);
  });
});

describe('C6 pickup, deposit, light', () => {
  it('picks a mote exactly at pickup_radius (<= r) and scores per_mote', () => {
    const s = game({ motes: [{ pos: [T.pickup_radius, 0, 0] }, { pos: [T.pickup_radius + 0.01, 0, 0] }] });
    const ev = runSteps(s, 1);
    expect(ev).toEqual([{ tick: 1, event: { name: 'mote_picked', data: { carried: 1 } } }]);
    expect(s.score).toBe(T.score.per_mote);
    expect(s.motes).toHaveLength(1);
  });
  it('respects carry_capacity', () => {
    const s = game({ player: { carried: T.carry_capacity }, motes: [{ pos: [0, 0, 0] }] });
    expect(runSteps(s, 5)).toEqual([]);
    expect(s.motes).toHaveLength(1);
  });
  it('interact deposits into nearest unlit lantern and lights it at lantern_cost', () => {
    const s = game({ player: { pos: [0, 0, 23], carried: T.lantern_cost + 2 } });
    const ev = runSteps(s, 2, [{ tick: 0, interact: true }]);
    expect(ev.map((e) => e.event)).toEqual([
      { name: 'deposit', data: { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost } },
      { name: 'lantern_lit', data: { lantern_id: 'L1' } },
    ]);
    expect(s.player.carried).toBe(2);
    expect(s.score).toBe(T.score.per_lantern);
  });
  it('partial deposit does not light; interact needs a false->true edge', () => {
    const s = game({ player: { pos: [0, 0, 23], carried: 2 } });
    const ev = runSteps(s, 5, [{ tick: 0, interact: true }]);
    expect(names(ev)).toEqual(['deposit']);
    expect(s.lanterns[0]).toMatchObject({ lit: false, deposited: 2 });
  });
  it('no deposit when out of interact_radius', () => {
    const s = game({ player: { pos: [0, 0, 25 - T.interact_radius - 0.1], carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 25] }] });
    expect(runSteps(s, 2, [{ tick: 0, interact: true }])).toEqual([]);
  });
});

describe('C7 pulse', () => {
  it('costs pulse_cost, stuns and pushes shades in radius, scores per_stun', () => {
    const s = game({ player: { carried: 3 }, shades: [{ id: 'A', pos: [5, 1, 0] }, { id: 'B', pos: [20, 1, 0] }] });
    const ev = runSteps(s, 1, [{ tick: 0, pulse: true }]);
    expect(ev[0]!.event).toEqual({ name: 'pulse', data: { stunned_ids: ['A'] } });
    expect(s.player.carried).toBe(3 - T.pulse_cost);
    expect(s.shades[0]!.state).toBe('stunned');
    expect(s.shades[0]!.pos[0]).toBeCloseTo(5 + T.pulse_push_m, 9);
    expect(s.score).toBe(T.score.per_stun);
  });
  it('pushes the full pulse_push_m even near the island edge', () => {
    const s = game({ player: { pos: [35, 0, 0], carried: 2 }, shades: [{ id: 'A', pos: [38, 1, 0] }] });
    runSteps(s, 1, [{ tick: 0, pulse: true }]);
    expect(s.shades[0]!.pos[0]).toBeCloseTo(38 + T.pulse_push_m, 9);
  });
  it('stunned shade does not move for pulse_stun_s, then chases again', () => {
    const s = game({ player: { carried: 2 }, shades: [{ id: 'A', pos: [3, 1, 0] }] });
    runSteps(s, 1, [{ tick: 0, pulse: true }]);
    const x = s.shades[0]!.pos[0];
    runSteps(s, secondsToTicks(T.pulse_stun_s) - 1);
    expect(s.shades[0]!.state).toBe('stunned');
    expect(s.shades[0]!.pos[0]).toBe(x);
    runSteps(s, 1);
    expect(s.shades[0]!.state).toBe('chase');
    expect(s.shades[0]!.pos[0]).toBeLessThan(x);
  });
  it('fails silently without enough light or during cooldown', () => {
    const poor = game({ player: { carried: T.pulse_cost - 1 } });
    expect(runSteps(poor, 2, [{ tick: 0, pulse: true }])).toEqual([]);
    const s = game({ player: { carried: 10 } });
    const cd = secondsToTicks(T.pulse_cooldown_s);
    const ev = runSteps(s, cd + 2, [
      { tick: 0, pulse: true }, { tick: 1, pulse: false },
      { tick: 2, pulse: true }, { tick: 3, pulse: false }, // during cooldown -> ignored
      { tick: cd, pulse: true },                          // step cd produces tick cd+1 >= ready
    ]);
    expect(ev.filter((e) => e.event.name === 'pulse').map((e) => e.tick)).toEqual([1, cd + 1]);
  });
});

describe('C8 hits', () => {
  it('shade touch costs a flame, drops floor(carried*ratio), then invulnerability', () => {
    const s = game({ player: { carried: 5 }, shades: [{ id: 'A', pos: [0.5, 1, 0] }] });
    const ev = runSteps(s, 1);
    expect(ev[0]!.event).toEqual({ name: 'player_hit', data: { by: 'shade', flames: T.flames - 1, dropped: Math.floor(5 * T.hit_drop_ratio) } });
    expect(s.player.carried).toBe(5 - Math.floor(5 * T.hit_drop_ratio));
    const more = runSteps(s, secondsToTicks(T.invuln_s) - 1);
    expect(names(more)).not.toContain('player_hit');
    expect(names(runSteps(s, 1))).toContain('player_hit');
  });
});

describe('C9 lantern safe zone', () => {
  it('shades never come within safe_radius of a lit lantern', () => {
    const s = game({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true }], shades: [{ id: 'A', pos: [0, 1, 10] }] });
    let minD = Infinity;
    const ev = [];
    for (let i = 0; i < 600; i++) {
      ev.push(...runSteps(s, 1));
      minD = Math.min(minD, distXZ(s.shades[0]!.pos, s.lanterns[0]!.pos));
    }
    expect(minD).toBeGreaterThan(T.safe_radius); // strictly outside: "within r" means <= r
    expect(minD).toBeLessThan(T.safe_radius + 0.01); // it did reach the boundary
    expect(names(ev)).not.toContain('player_hit');
  });
  it('scenario setup emits no events/points (pre-lit lantern not scored)', () => {
    const s = game({ lanterns: [{ id: 'L1', lit: true }] });
    expect(s.score).toBe(0);
    expect(runSteps(s, 1)).toEqual([]);
  });
});

describe('C10 win / lose', () => {
  it('lighting the last lantern wins with time + flame bonus and stops', () => {
    const s = game({
      player: { pos: [0, 0, 23], carried: T.lantern_cost },
      lanterns: ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true })),
      time_left_s: 100,
    });
    const ev = runSteps(s, 10, [{ tick: 0, interact: true }]);
    expect(names(ev)).toEqual(['deposit', 'lantern_lit', 'game_over']);
    expect(ev.at(-1)!.event.data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(s.status).toBe('won');
    expect(s.tick).toBe(1);
    const left = Math.floor(100 - 1 / 60);
    expect(s.score).toBe(T.score.per_lantern + left * T.score.per_second_left + T.flames * T.score.per_flame_left);
  });
  it('losing the last flame -> lost/no_flames', () => {
    const s = game({ player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] });
    const ev = runSteps(s, 5);
    expect(ev.at(-1)).toEqual({ tick: 1, event: { name: 'game_over', data: { result: 'lost', reason: 'no_flames' } } });
  });
  it('time running out -> lost/dawn at exactly time_left_s * 60', () => {
    const s = game({ time_left_s: 1 });
    const ev = runSteps(s, 100);
    expect(ev).toEqual([{ tick: 60, event: { name: 'game_over', data: { result: 'lost', reason: 'dawn' } } }]);
  });
});

describe('C11 determinism', () => {
  it('same seed -> identical output; different seed -> different motes', () => {
    const a = runHeadless({ tuning: T, seed: 42, ticks: 3000, snapshotEvery: 10 });
    const b = runHeadless({ tuning: T, seed: 42, ticks: 3000, snapshotEvery: 10 });
    const c = runHeadless({ tuning: T, seed: 43, ticks: 3000, snapshotEvery: 10 });
    expect(a).toEqual(b);
    expect(a[0]).not.toEqual(c[0]);
  });
  it('random shades spawn with shade_spawned events and sequential auto ids', () => {
    // Keep the player safe inside a lit lantern zone so the night lasts long enough for 2 spawns.
    const s = createGame(T, 9, { lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }] });
    const ev = runSteps(s, 60 * 40);
    expect(ev.filter((e) => e.event.name === 'shade_spawned').map((e) => [e.tick, e.event.data])).toEqual([[600, { id: 'S1' }], [2100, { id: 'S2' }]]);
  });
});

describe('C2 input / scenario validation', () => {
  it('rejects malformed inputs and scenarios with FormatError', () => {
    expect(() => parseInputs({ frames: [{ tick: 5 }, { tick: 5 }] })).toThrow(FormatError);
    expect(() => parseInputs({ frames: [{ tick: 0, move: 'up' }] })).toThrow(FormatError);
    expect(() => parseInputs({ frames: [{ tick: 0, pulse: 1 }] })).toThrow(FormatError);
    expect(() => parseInputs([])).toThrow(FormatError);
    expect(() => parseScenario({ lanterns: [{ id: 'L9' }] }, L)).toThrow(FormatError);
    expect(() => parseScenario({ player: { pos: [0, 0] } }, L)).toThrow(FormatError);
    expect(() => parseScenario([], L)).toThrow(FormatError);
  });
  it('input frames hold values until changed; defaults before first frame', () => {
    const read = createInputReader(parseInputs({ frames: [{ tick: 2, move: [1, 0], pulse: true }, { tick: 4, pulse: false }] }));
    expect(read(0)).toEqual(IDLE);
    expect(read(1)).toEqual(IDLE);
    expect(read(2)).toMatchObject({ move: [1, 0], pulse: true });
    expect(read(3)).toMatchObject({ move: [1, 0], pulse: true });
    expect(read(4)).toMatchObject({ move: [1, 0], pulse: false });
  });
});
