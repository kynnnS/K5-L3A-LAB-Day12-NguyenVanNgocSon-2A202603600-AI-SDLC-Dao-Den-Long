/**
 * Ticket-04 benchmark scene (pure, deterministic): Night 1, Mây idle at (0,0,0), L1-L3 lit with fuel 100,
 * exactly 200 shades in `wander` and 100 motes spread uniformly over the island (seeded). The scene is
 * flagged `bench`, so step() skips spawns, damage, pickups, fuel use and the end of the night.
 */
import { nextRandom, seedToState } from './rng.js';
import { createGame } from './sim.js';
import type { GameState, Tuning, Vec3 } from './types.js';

export const BENCH_SHADES = 200;
export const BENCH_MOTES = 100;
/** Spread radius: Night 1 island is 40 m; keep 2 m from the edge. */
export const BENCH_RADIUS = 38;

export function createBenchGame(tuning: Tuning, seed = 42): GameState {
  let rs = seedToState(seed);
  const rnd = () => { const [v, s] = nextRandom(rs); rs = s; return v; };
  // Uniform over the disk: r = R * sqrt(u), angle = 2*pi*v.
  const point = (y: number): Vec3 => {
    const r = BENCH_RADIUS * Math.sqrt(rnd());
    const a = 2 * Math.PI * rnd();
    return [r * Math.cos(a), y, r * Math.sin(a)];
  };
  const shades = Array.from({ length: BENCH_SHADES }, (_, i) => ({ id: `S${i + 1}`, pos: point(1), state: 'wander' as const }));
  const motes = Array.from({ length: BENCH_MOTES }, (_, i) => ({ id: `M${i + 1}`, pos: point(0) }));
  const state = createGame(tuning, seed, 1, {
    player: { pos: [0, 0, 0] },
    random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
    lanterns: [{ id: 'L1', lit: true, fuel: 100 }, { id: 'L2', lit: true, fuel: 100 }, { id: 'L3', lit: true, fuel: 100 }],
    shades, motes, drifters: [], charms: [],
  });
  state.bench = true;
  return state;
}
