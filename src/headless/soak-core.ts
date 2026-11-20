/**
 * Ticket-04 §2 soak run (pure part). Nights 1 -> 2 -> 3 cycle; night i (1-based, D1) uses seed + i.
 * Seeded random input (separate PRNG from the game): new move direction every 30 ticks; each tick
 * jump 5 %, dash 3 %, pulse 2 %, interact 10 %. Each night runs until it ends or its standard duration.
 */
import { nightDuration } from '../core/maps.js';
import { nextRandom, seedToState } from '../core/rng.js';
import { createGame, step } from '../core/sim.js';
import type { GameState, InputState, Tuning } from '../core/types.js';

export type NightResult = 'won' | 'lost' | 'playing' | 'crash';

export interface SoakHooks {
  /** Called once, right after the first night has been loaded (mem_start). */
  afterFirstLoad?: () => void;
}

/** Plays one night with seeded random input; returns the final state. */
export function playRandomNight(tuning: Tuning, night: 1 | 2 | 3, seed: number, state: GameState = createGame(tuning, seed, night)): GameState {
  let rs = seedToState((seed ^ 0x5bd1e995) >>> 0); // input PRNG, independent of the game's own PRNG
  const rnd = () => { const [v, s] = nextRandom(rs); rs = s; return v; };
  const maxTicks = Math.round(nightDuration(night, tuning) * 60);
  let move: [number, number] = [0, 0];
  for (let k = 0; k < maxTicks && (state.status === 'playing' || state.status === 'paused'); k++) {
    if (k % 30 === 0) { const a = rnd() * 2 * Math.PI; move = [Math.cos(a), Math.sin(a)]; }
    const input: InputState = {
      move, camYawDeg: 0, pause: false,
      jump: rnd() < 0.05, dash: rnd() < 0.03, pulse: rnd() < 0.02, interact: rnd() < 0.1,
    };
    step(state, tuning, input);
  }
  return state;
}

export function runSoakNights(tuning: Tuning, seed: number, nights: number, hooks: SoakHooks = {}): { results: NightResult[]; crashes: number } {
  const results: NightResult[] = [];
  let crashes = 0;
  for (let i = 1; i <= nights; i++) {
    const night = (((i - 1) % 3) + 1) as 1 | 2 | 3;
    try {
      let state: GameState | undefined = createGame(tuning, seed + i, night);
      if (i === 1) hooks.afterFirstLoad?.();
      state = playRandomNight(tuning, night, seed + i, state);
      results.push(state.status === 'won' || state.status === 'lost' ? state.status : 'playing');
      state = undefined; // reset: drop every reference to the finished night
    } catch {
      crashes += 1;
      results.push('crash');
    }
  }
  return { results, crashes };
}
