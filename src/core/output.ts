/** Contract v1.1 output records (JSONL lines). Coordinates rounded to 3 decimals. */
import { round3, TICKS_PER_SECOND } from './constants.js';
import { timeLeft } from './sim.js';
import type { GameState, TimedEvent, Vec3 } from './types.js';

const r3 = (v: Vec3): Vec3 => [round3(v[0]), round3(v[1]), round3(v[2])];
const secs = (ticks: number) => round3(ticks / TICKS_PER_SECOND);

export function snapshotRecord(state: GameState): Record<string, unknown> {
  const p = state.player;
  return {
    type: 'snapshot',
    tick: state.tick,
    sim_tick: state.simTick,
    night: state.night,
    state: state.status,
    time_left_s: round3(timeLeft(state)),
    score: state.score,
    wind: { active: state.wind.active, dir_deg: state.wind.active ? state.wind.dirDeg : null },
    player: {
      pos: r3(p.pos),
      vel: r3(p.vel),
      grounded: p.grounded,
      invuln: p.invulnTicks > 0,
      flames: p.flames,
      carried: p.carried,
      dash_cd_s: secs(p.dashCdTicks),
      pulse_cd_s: secs(p.pulseCdTicks),
      charm_s: secs(p.charmTicks),
    },
    lanterns: state.lanterns.map((l) => ({ id: l.id, pos: r3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: state.shades.map((s) => ({ id: s.id, pos: r3(s.pos), state: s.state })),
    motes_active: state.motes.length,
    motes: state.motes.map((m) => ({ id: m.id, pos: r3(m.pos), kind: m.kind, ttl_s: m.ttlTicks === null ? null : secs(m.ttlTicks) })),
    drifters: state.drifters.map((d) => ({ id: d.id, pos: r3(d.pos), state: d.state, stolen: d.stolen })),
    charms: state.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: secs(c.respawnTicks) })),
  };
}

export function eventRecord(e: TimedEvent): Record<string, unknown> {
  return { type: 'event', tick: e.tick, name: e.event.name, data: e.event.data };
}

export function endRecord(state: GameState): Record<string, unknown> {
  return { type: 'end', ticks: state.tick, state: state.status, score: state.score };
}
