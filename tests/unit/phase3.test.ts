/**
 * Ticket-03 "Đèn cạn dầu" (Contract v1.2). Expectations derived by hand in integer fuel units of 1/60
 * (6000 = 100.0; decay 1 unit/tick; drain 5 units/tick/shade; 1 mote = 600 units).
 * Order inside a tick: step 2 decays/drains, lanterns go out right after; step 5 interacts.
 */
import { describe, expect, it } from 'vitest';
import { snapshotRecord } from '../../src/core/output.js';
import { capacity, createGame, distXZ, step } from '../../src/core/sim.js';
import { FormatError, createInputReader, parseScenario, type InputFrame } from '../../src/core/spec.js';
import type { GameState, Tuning } from '../../src/core/types.js';
import { T, game, names, runSteps } from '../helpers.js';

const ev = (e: ReturnType<typeof runSteps>, name: string) => e.filter((x) => x.event.name === name);
const L = (s: GameState, id: string) => s.lanterns.find((l) => l.id === id)!;
const FAR = { pos: [0, 0, -30] as [number, number, number] }; // > 12 m from every Night 1 test position
const NO_DECAY: Tuning = { ...T, fuel_decay_per_s: 0 };
function runWith(tuning: Tuning, s: GameState, n: number, frames: InputFrame[] = []) {
  const read = createInputReader(frames);
  const out = [];
  for (let k = 0; k < n; k++) out.push(...step(s, tuning, read(s.tick)));
  return out;
}

describe('P3-1 fuel', () => {
  it('first light -> fuel 100; decays exactly 1.0 per 60 ticks; no drift after thousands of ticks', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 10 } });
    runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(L(s, 'L1')).toMatchObject({ lit: true, fuel: 6000, everLit: true, relitCount: 0 });
    runSteps(s, 60);
    expect(L(s, 'L1').fuel).toBe(5940); // 99.0
    runSteps(s, 3000);
    expect(L(s, 'L1').fuel).toBe(6000 - 3060); // integer units: exactly 49.0
    expect((snapshotRecord(s, T).lanterns as any[])[0].fuel).toBe(49);
  });
  it('runs out on the exact tick: one lantern_out; deposited 0, fuel 0, ever_lit kept', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, deposited: 10, fuel: 1 }] }); // 60 units
    const e = runSteps(s, 200);
    expect(ev(e, 'lantern_out')).toEqual([{ tick: 60, event: { name: 'lantern_out', data: { lantern_id: 'L1' } } }]);
    expect(L(s, 'L1')).toMatchObject({ lit: false, fuel: 0, deposited: 0, everLit: true, relitCount: 0 });
  });
  it('refuel: used = min(carried, ceil((100 - fuel) / 10)), capped at 100, +5 per mote', () => {
    // fuel 75.5 = 4530 -> 4529 after step 2; ceil(1471 / 600) = 3; 4529 + 1800 -> capped 6000
    const s = game({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: [{ id: 'L1', lit: true, fuel: 75.5 }] });
    const e = runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(e.map((x) => x.event)).toEqual([{ name: 'refuel', data: { lantern_id: 'L1', amount: 3, fuel: 100 } }]);
    expect(s.player.carried).toBe(7);
    expect(s.score).toBe(15);
    expect(L(s, 'L1').fuel).toBe(6000);
  });
  it('refuel never takes more than carried', () => {
    // fuel 20 = 1200 -> 1199; ceil(4801 / 600) = 9 but carried 4 -> 1199 + 2400 = 3599 (59.983 -> 60.0)
    const s = game({ player: { pos: [0, 0, 24], carried: 4 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }] });
    const e = runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(e[0]!.event).toEqual({ name: 'refuel', data: { lantern_id: 'L1', amount: 4, fuel: 60 } });
    expect(L(s, 'L1').fuel).toBe(3599);
    expect(s.player.carried).toBe(0);
  });
  it('a full lantern is never selected (no event, no points); the next candidate is used', () => {
    // fuel_decay 0 keeps L1 exactly full at step 5.
    const full = game({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', lit: true }] });
    expect(runWith(NO_DECAY, full, 1, [{ tick: 0, interact: true }])).toEqual([]);
    expect(full.player.carried).toBe(5);
    expect(full.score).toBe(0);
    // L1 full at 1 m, L2 unlit moved to 1.5 m -> L2 gets the deposit
    const s = game({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', pos: [0, 0, 22.5] }] });
    expect(runWith(NO_DECAY, s, 1, [{ tick: 0, interact: true }])[0]!.event).toEqual({ name: 'deposit', data: { lantern_id: 'L2', amount: 5, deposited: 5 } });
  });
  it('candidate selection: nearest receivable lantern, equal distance -> smaller id', () => {
    const s = game({ player: { pos: [0, 0, 0], carried: 10 }, lanterns: [{ id: 'L2', pos: [0, 0, -1] }, { id: 'L1', pos: [0, 0, 1], lit: true, fuel: 50 }] });
    expect(runSteps(s, 1, [{ tick: 0, interact: true }])[0]!.event.name).toBe('refuel'); // L1 (lit, not full) wins the tie
  });
  it('relight needs 5 motes: +5 each +40, relight: true, relit_count + 1, fuel 100', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: [{ id: 'L1', lit: false, ever_lit: true }] });
    const e = runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(e.map((x) => x.event)).toEqual([
      { name: 'deposit', data: { lantern_id: 'L1', amount: 5, deposited: 5 } },
      { name: 'lantern_lit', data: { lantern_id: 'L1', relight: true } },
    ]);
    expect(L(s, 'L1')).toMatchObject({ lit: true, fuel: 6000, relitCount: 1, everLit: true });
    expect(s.score).toBe(5 * 5 + 40);
    expect(s.player.carried).toBe(5);
  });
  it('full cycle: light -> out -> relight in two deposits (progress remembered)', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 1 }] });
    const e = runSteps(s, 70, [{ tick: 65, interact: true }]);
    expect(names(e)).toEqual(['lantern_out', 'deposit']); // out at 60, 3 of 5 deposited at 66
    expect(L(s, 'L1')).toMatchObject({ lit: false, deposited: 3 });
    s.player.carried = 2;
    const e2 = runSteps(s, 2, [{ tick: 0, interact: false }, { tick: 71, interact: true }]);
    expect(e2.map((x) => x.event)).toEqual([
      { name: 'deposit', data: { lantern_id: 'L1', amount: 2, deposited: 5 } },
      { name: 'lantern_lit', data: { lantern_id: 'L1', relight: true } },
    ]);
  });
});

describe('P3-2 drain', () => {
  it('fuel exactly 30 keeps the safe zone (shade inside is expelled); 29.9 has none (shade drains)', () => {
    const keep = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 30 }], shades: [{ id: 'A', pos: [0, 1, 22] }] });
    runWith(NO_DECAY, keep, 20);
    expect(distXZ(keep.shades[0]!.pos, [0, 0, 25])).toBeGreaterThanOrEqual(6);
    expect(keep.shades[0]!.state).not.toBe('drain');
    // 29.9: wander heads for weak L1 at 4/60 m per tick: 3 - k/15 <= 2 at k = 15 -> drain on tick 15
    const weak = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 29.9 }], shades: [{ id: 'A', pos: [0, 1, 22] }] });
    runSteps(weak, 14);
    expect(weak.shades[0]!.state).toBe('wander');
    runSteps(weak, 1);
    expect(weak.shades[0]).toMatchObject({ state: 'drain', targetLanternId: 'L1' });
  });
  it('weak lantern preferred over unlit; nearest weak, ties -> smaller id (L2 vs L5)', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L2', lit: true, fuel: 10 }, { id: 'L5', lit: true, fuel: 10 }], shades: [{ id: 'A', pos: [0, 1, 7.7] }] });
    runSteps(s, 1);
    expect(s.shades[0]!.targetLanternId).toBe('L2');
    expect(s.shades[0]!.pos[0]).toBeCloseTo(4 / 60, 9); // moved toward L2 (+X)
  });
  it('without weak lanterns a wander shade goes to the nearest unlit lantern', () => {
    const s = game({ player: FAR, shades: [{ id: 'A', pos: [0, 1, 15] }] });
    runSteps(s, 1);
    expect(s.shades[0]!.targetLanternId).toBe('L1');
    expect(s.shades[0]!.pos[2]).toBeCloseTo(15 + 4 / 60, 9);
  });
  it('a chasing shade keeps chasing past a weak lantern', () => {
    const s = game({ player: { pos: [0, 0, 15] }, lanterns: [{ id: 'L1', lit: true, fuel: 10 }], shades: [{ id: 'A', pos: [0, 1, 26], state: 'chase' }] });
    runSteps(s, 1);
    expect(s.shades[0]!.state).toBe('chase');
    expect(s.shades[0]!.pos[2]).toBeCloseTo(26 - 4 / 60, 9);
  });
  it('one shade drains 5/s on top of the 1/s decay; fuel_drain every 60 drained ticks; out at 200', () => {
    // 1200 units, 6 per tick: 840 (14.0) @60, 480 (8.0) @120, 120 (2.0) @180, 0 @200
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    const e = runSteps(s, 210);
    expect(ev(e, 'fuel_drain').map((x) => [x.tick, x.event.data])).toEqual([
      [60, { lantern_id: 'L1', shade_id: 'A', fuel: 14 }], [120, { lantern_id: 'L1', shade_id: 'A', fuel: 8 }], [180, { lantern_id: 'L1', shade_id: 'A', fuel: 2 }],
    ]);
    expect(ev(e, 'lantern_out').map((x) => x.tick)).toEqual([200]);
    expect(s.shades[0]!.state).toBe('wander'); // lantern out -> wander
  });
  it('two shades stack: 11 units per tick', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }, { id: 'B', pos: [1, 1, 25], state: 'drain', target_lantern_id: 'L1' }] });
    const e = runSteps(s, 60);
    expect(L(s, 'L1').fuel).toBe(1200 - 60 * 11);
    expect(ev(e, 'fuel_drain').map((x) => x.event.data)).toEqual([{ lantern_id: 'L1', shade_id: 'A', fuel: 9 }, { lantern_id: 'L1', shade_id: 'B', fuel: 9 }]);
  });
  it('drain -> chase when Mây comes within 6 m (7 m: keeps draining)', () => {
    const at6 = game({ player: { pos: [0, 0, 30] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    runSteps(at6, 1);
    expect(at6.shades[0]!.state).toBe('chase');
    const at7 = game({ player: { pos: [0, 0, 31] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    runSteps(at7, 1);
    expect(at7.shades[0]!.state).toBe('drain');
  });
  it('pulse stuns a draining shade for a total of +15; back to wander when the stun ends', () => {
    const s = game({ player: { pos: [0, 0, 28], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    const e = runSteps(s, 1, [{ tick: 0, pulse: true }]);
    expect(e[0]!.event).toEqual({ name: 'pulse', data: { stunned_ids: ['A'] } });
    expect(s.score).toBe(15);
    expect(s.shades[0]!.state).toBe('stunned');
    runSteps(s, 119);
    expect(s.shades[0]!.state).toBe('stunned');
    runSteps(s, 1);
    expect(s.shades[0]!.state).not.toBe('stunned'); // wander at tick 121 (then its normal rules)
  });
  it('refuel to >= 30 next to a draining shade: zone back, shade expelled (harmless) and leaves drain', () => {
    // 1200 - 6 = 1194; used = ceil(4806 / 600) = 9 -> 6594 -> 6000
    const s = game({ player: { pos: [0, 0, 26.5], carried: 10 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }] });
    const e = runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(e.map((x) => x.event)).toEqual([{ name: 'refuel', data: { lantern_id: 'L1', amount: 9, fuel: 100 } }]);
    expect(s.shades[0]).toMatchObject({ state: 'wander', expelling: true });
    const e2 = runSteps(s, 30);
    expect(ev(e2, 'player_hit')).toEqual([]);
    expect(distXZ(s.shades[0]!.pos, [0, 0, 25])).toBeGreaterThanOrEqual(6);
  });
  it('drain -> wander when more than 2 m from its lantern', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 22], state: 'drain', target_lantern_id: 'L1' }] });
    runSteps(s, 1);
    expect(s.shades[0]!.state).toBe('wander'); // 3 m away, then walks back toward weak L1
  });
});

describe('P3 review fixes (independent review of Phase 3)', () => {
  it('m1: a scenario drain shade at a healthy (>= 30) or distant (> 2 m) lantern drains nothing', () => {
    const full = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 50 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    runSteps(full, 1);
    expect(L(full, 'L1').fuel).toBe(3000 - 1); // decay only
    expect(full.shades[0]!.state).not.toBe('drain');
    const far = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 22], state: 'drain', target_lantern_id: 'L1' }] });
    runSteps(far, 1);
    expect(L(far, 'L1').fuel).toBe(1200 - 1);
  });
  it('m2: scenario fuel just below 30 stays below 30 (floor to 1/60 units): no safe zone', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 29.995 }], shades: [{ id: 'A', pos: [0, 1, 23.5] }] });
    expect(L(s, 'L1').fuel).toBe(1799);
    runSteps(s, 1);
    expect(s.shades[0]).toMatchObject({ state: 'drain', expelling: false }); // weak: no zone, 1.5 m -> drain
  });
  it('drain -> chase exactly at 6.0 m', () => {
    const s = game({ player: { pos: [0, 0, 30] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    runSteps(s, 1);
    expect(s.shades[0]!.state).toBe('chase');
  });
  it('relight with a shade waiting inside 6 m: zone back, shade expelled and harmless', () => {
    const s = game({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', ever_lit: true }], shades: [{ id: 'A', pos: [0, 1, 27], state: 'recoil', state_ticks_left: 1 }] });
    const e = runSteps(s, 1, [{ tick: 0, interact: true }]);
    expect(names(e)).toEqual(['deposit', 'lantern_lit']);
    expect(s.shades[0]!.expelling).toBe(true);
    expect(ev(runSteps(s, 30), 'player_hit')).toEqual([]);
    expect(distXZ(s.shades[0]!.pos, [0, 0, 25])).toBeGreaterThanOrEqual(6);
  });
});

describe('P3-3 dawn rules', () => {
  const lit = (ids: string[]) => ids.map((id) => ({ id, lit: true }));
  const dawn = (night: 1 | 2 | 3, ids: string[], extra = {}) => {
    const s = game({ lanterns: lit(ids), time_left_s: 1 / 60, ...extra }, night);
    return { s, e: runSteps(s, 3) };
  };
  it.each([
    [1, ['L1', 'L2', 'L3'], 'won'], [1, ['L1', 'L2'], 'lost'],
    [2, ['L1', 'L2', 'L3', 'L4'], 'won'], [2, ['L1', 'L2', 'L3'], 'lost'],
    [3, ['L1', 'L2', 'L3', 'L4', 'L5'], 'won'], [3, ['L1', 'L2', 'L3', 'L4'], 'lost'],
  ] as const)('night %i with %j lit at dawn -> %s', (night, ids, result) => {
    const { s, e } = dawn(night, [...ids]);
    expect(e.at(-1)!.event).toEqual({ name: 'game_over', data: { result, reason: result === 'won' ? 'dawn_survived' : 'dawn' } });
    // win: per lit lantern 50 + floor(99.983) = 149, + 50 per flame; loss: no dawn bonus
    expect(s.score).toBe(result === 'won' ? ids.length * 149 + 150 : 0);
  });
  it('all lanterns lit long before dawn: the night goes on', () => {
    const s = game({ lanterns: lit(['L1', 'L2', 'L3', 'L4', 'L5']) });
    runSteps(s, 600);
    expect(s.status).toBe('playing');
  });
  it('a lantern running out on the dawn tick can turn a win into a loss', () => {
    const { e } = dawn(1, ['L2', 'L3'], { lanterns: [{ id: 'L1', lit: true, fuel: 1 / 60 }, ...lit(['L2', 'L3'])] });
    expect(names(e)).toEqual(['lantern_out', 'game_over']);
    expect(e.at(-1)!.event.data).toEqual({ result: 'lost', reason: 'dawn' });
  });
  it('losing the last flame on the dawn tick -> no_flames even with enough lanterns', () => {
    const { e } = dawn(1, ['L1', 'L2', 'L3'], { player: { flames: 1 }, shades: [{ id: 'A', pos: [0.5, 1, 0], state: 'chase' }] });
    expect(names(e)).toEqual(['player_hit', 'game_over']);
    expect(e.at(-1)!.event.data).toEqual({ result: 'lost', reason: 'no_flames' });
  });
});

describe('P3-4 capacity', () => {
  it('starts at 10 every night; +2 per successful light (relights too); max 20; refuel and pre-lit do not count', () => {
    for (const n of [1, 2, 3] as const) expect(capacity(createGame(T, 1, n), T)).toBe(10);
    const pre = game({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }] });
    expect(capacity(pre, T)).toBe(10);
    const s = game({ player: { pos: [0, 0, 24], carried: 10, successful_lights: 4 }, lanterns: [{ id: 'L1', lit: false, ever_lit: true }] });
    expect(capacity(s, T)).toBe(18);
    runSteps(s, 1, [{ tick: 0, interact: true }]); // relight -> 5th successful light
    expect(capacity(s, T)).toBe(20);
    runSteps(s, 2, [{ tick: 0, interact: false }, { tick: 2, interact: true }]); // refuel uses 1 mote
    expect(s.player.successfulLights).toBe(5);
    expect(capacity(game({ player: { successful_lights: 9 } }), T)).toBe(20);
  });
  it('pickup fills up to the current capacity (12 after one light)', () => {
    const s = game({ player: { carried: 11, successful_lights: 1 }, motes: [{ pos: [0, 0, 0.2] }, { pos: [0, 0, 0.4] }, { pos: [0, 0, 0.6] }] });
    const e = runSteps(s, 1);
    expect(ev(e, 'mote_picked').map((x) => x.event.data)).toEqual([{ carried: 12 }]);
    expect((snapshotRecord(s, T).player as any).capacity).toBe(12);
  });
});

describe('P3-5 pause + contract v1.2', () => {
  it('pause freezes fuel decay, drain, fuel_drain and the night clock', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }] });
    const e = runSteps(s, 200, [{ tick: 0, pause: true }]);
    expect(names(e)).toEqual(['paused']);
    expect(L(s, 'L1').fuel).toBe(1200);
    expect(s.simTick).toBe(0);
  });
  it('scenario: lit without fuel -> 100; fuel rounded to 1 decimal in snapshots; unlit fuel 0', () => {
    const s = game({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true, fuel: 33.333 }, { id: 'L3', ever_lit: true }] });
    const snap = snapshotRecord(s, T).lanterns as any[];
    expect(snap[0]).toEqual({ id: 'L1', pos: [0, 0, 25], lit: true, deposited: 0, fuel: 100, ever_lit: true, relit_count: 0 });
    expect(snap[1].fuel).toBe(33.3);
    expect(snap[2]).toMatchObject({ lit: false, fuel: 0, ever_lit: true });
  });
  it('scenario parser: drain state, target_lantern_id, successful_lights, fuel, ever_lit; bad values -> FormatError', () => {
    const ids = ['L1', 'L2', 'L3', 'L4', 'L5'];
    const spec = parseScenario({ player: { successful_lights: 2 }, shades: [{ pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }], lanterns: [{ id: 'L1', lit: true, fuel: 12.5, ever_lit: true }] }, ids, []);
    expect(spec.shades![0]).toMatchObject({ state: 'drain', target_lantern_id: 'L1' });
    expect(spec.player!.successful_lights).toBe(2);
    expect(spec.lanterns![0]).toEqual({ id: 'L1', lit: true, fuel: 12.5, ever_lit: true });
    expect(() => parseScenario({ shades: [{ pos: [0, 1, 0], target_lantern_id: 'L9' }] }, ids, [])).toThrow(FormatError);
    expect(() => parseScenario({ lanterns: [{ id: 'L1', fuel: -1 }] }, ids, [])).toThrow(FormatError);
    expect(() => parseScenario({ lanterns: [{ id: 'L1', ever_lit: 'yes' }] }, ids, [])).toThrow(FormatError);
  });
  it('scenario drain without target_lantern_id drains the nearest lit lantern', () => {
    const s = game({ player: FAR, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'A', pos: [0, 1, 24], state: 'drain' }] });
    expect(s.shades[0]!.targetLanternId).toBe('L1');
  });
});
