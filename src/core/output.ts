/** Contract v1.0 output records (JSONL lines). Coordinates rounded to 3 decimals. */
import { round3 } from './constants.js';
import { timeLeft } from './sim.js';
import type { GameState, TimedEvent, Vec3 } from './types.js';

const r3 = (v: Vec3): Vec3 => [round3(v[0]), round3(v[1]), round3(v[2])];

export function snapshotRecord(state: GameState): Record<string, unknown> {
  return {
    type: 'snapshot',
    tick: state.tick,
    sim_tick: state.tick,
    state: state.status,
    time_left_s: round3(timeLeft(state)),
    score: state.score,
    player: { pos: r3(state.player.pos), flames: state.player.flames, carried: state.player.carried },
    lanterns: state.lanterns.map((l) => ({ id: l.id, pos: r3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: state.shades.map((s) => ({ id: s.id, pos: r3(s.pos), state: s.state })),
    motes_active: state.motes.length,
    motes: state.motes.map((m) => ({ id: m.id, pos: r3(m.pos) })),
  };
}

export function eventRecord(e: TimedEvent): Record<string, unknown> {
  return { type: 'event', tick: e.tick, name: e.event.name, data: e.event.data };
}

export function endRecord(state: GameState): Record<string, unknown> {
  return { type: 'end', ticks: state.tick, state: state.status, score: state.score };
}
