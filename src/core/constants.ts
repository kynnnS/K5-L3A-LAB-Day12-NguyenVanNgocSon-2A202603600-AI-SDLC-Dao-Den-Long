/**
 * Design constants that are NOT part of the contract tuning.
 * Contract-visible numbers live only in game.contract.json.
 */
import type { Vec3 } from './types.js';

export const TICKS_PER_SECOND = 60;
export const DT = 1 / TICKS_PER_SECOND;

/** Night 1 "Dao Ben": a round island (visual size + spawn ring; NOT a movement boundary, see A8). */
export const ISLAND_RADIUS = 40;
export const LANTERN_RING_RADIUS = 22;

export const GRAVITY = 20; // m/s^2
export const JUMP_SPEED = 7; // m/s  -> apex ~1.2 m, airtime ~0.7 s

/** Shade centre height above ground (pos is the centre). */
export const SHADE_HEIGHT = 1;

/** Random fireflies (when random_motes is on). */
export const MOTE_INITIAL = 20;
export const MOTE_MAX = 24;
export const MOTE_RESPAWN_TICKS = 3 * TICKS_PER_SECOND;
export const MOTE_MIN_R = 3;
export const MOTE_MAX_R = 36;

/** Random shades (when random_shades is on). */
export const SHADE_FIRST_SPAWN_TICK = 10 * TICKS_PER_SECOND;
export const SHADE_SPAWN_INTERVAL_TICKS = 25 * TICKS_PER_SECOND;
export const SHADE_MAX_NIGHT1 = 4;
export const SHADE_SPAWN_R = 38;

/** Lantern ids and default positions for Night 1 (evenly on a ring, L1 at +Z). */
export function defaultLanternPositions(count: number): Array<{ id: string; pos: Vec3 }> {
  const out: Array<{ id: string; pos: Vec3 }> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({
      id: `L${i + 1}`,
      pos: [round3(Math.sin(a) * LANTERN_RING_RADIUS), 0, round3(Math.cos(a) * LANTERN_RING_RADIUS)],
    });
  }
  return out;
}

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
}
