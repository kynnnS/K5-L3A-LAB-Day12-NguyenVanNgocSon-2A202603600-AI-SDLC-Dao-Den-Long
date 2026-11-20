/**
 * Game simulation: one fixed step = 1/60 s. Pure logic, no rendering, no wall clock,
 * no Math.random. Used by both the 3D client and the headless CLI.
 *
 * Step order (documented in docs/notes/phase-1.md, assumption A10):
 *   1 input edges  2 move + jump  3 pickup  4 interact (deposit/light)  5 pulse
 *   6 spawns  7 shades (stun / chase / lantern safe zones)  8 hits  9 end checks
 */
import {
  DT, GRAVITY, JUMP_SPEED, MOTE_INITIAL, MOTE_MAX, MOTE_MAX_R, MOTE_MIN_R,
  MOTE_RESPAWN_TICKS, SHADE_FIRST_SPAWN_TICK, SHADE_HEIGHT, SHADE_MAX_NIGHT1,
  SHADE_SPAWN_INTERVAL_TICKS, SHADE_SPAWN_R, TICKS_PER_SECOND, defaultLanternPositions,
} from './constants.js';
import { nextRandom, seedToState } from './rng.js';
import type { ScenarioSpec } from './spec.js';
import type { GameEvent, GameState, InputState, Lantern, Mote, Shade, TimedEvent, Tuning, Vec3 } from './types.js';

const EPS = 1e-9;

export function secondsToTicks(s: number): number {
  return Math.round(s * TICKS_PER_SECOND);
}

export function lanternIds(tuning: Tuning): string[] {
  return defaultLanternPositions(tuning.lantern_count_night1).map((l) => l.id);
}

export function timeLeft(state: GameState): number {
  return Math.max(0, state.startTimeLeft - state.tick / TICKS_PER_SECOND);
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function random(state: GameState): number {
  const [v, s] = nextRandom(state.rngState);
  state.rngState = s;
  return v;
}

function randomIslandPoint(state: GameState): Vec3 {
  const a = random(state) * Math.PI * 2;
  const u = random(state);
  const r = Math.sqrt(u * (MOTE_MAX_R ** 2 - MOTE_MIN_R ** 2) + MOTE_MIN_R ** 2);
  return [Math.sin(a) * r, 0, Math.cos(a) * r];
}

/** Next free auto id `M<n>` (skips ids already used by scenario motes). */
function newMote(state: GameState, pos: Vec3, taken: Set<string | undefined>): Mote {
  let id: string;
  do id = `M${state.nextMoteId++}`;
  while (taken.has(id));
  taken.add(id);
  return { id, pos };
}

function newShadeId(state: GameState, taken: Set<string>): string {
  let id: string;
  do id = `S${state.nextShadeId++}`;
  while (taken.has(id));
  return id;
}

/** Builds the initial state (snapshot tick 0). Scenario setup emits no events and awards no points. */
export function createGame(tuning: Tuning, seed: number, scenario: ScenarioSpec = {}): GameState {
  const state: GameState = {
    tick: 0,
    status: 'playing',
    score: 0,
    startTimeLeft: scenario.time_left_s ?? tuning.night1_duration_s,
    player: {
      pos: scenario.player?.pos ? [...scenario.player.pos] : [0, 0, 0],
      velY: 0,
      flames: scenario.player?.flames ?? tuning.flames,
      carried: scenario.player?.carried ?? 0,
      invulnUntil: 0,
      pulseReadyAt: 0,
    },
    lanterns: defaultLanternPositions(tuning.lantern_count_night1).map((l) => ({ id: l.id, pos: l.pos, lit: false, deposited: 0 })),
    shades: [],
    motes: [],
    randomMotes: scenario.random_motes ?? true,
    randomShades: scenario.random_shades ?? true,
    rngState: seedToState(seed),
    nextMoteId: 1,
    nextShadeId: 1,
    shadesSpawned: 0,
    prevButtons: { jump: false, interact: false, pulse: false },
  };

  for (const l of scenario.lanterns ?? []) {
    const lantern = state.lanterns.find((x) => x.id === l.id)!;
    if (l.pos) lantern.pos = [...l.pos];
    if (l.deposited !== undefined) lantern.deposited = l.deposited;
    if (l.lit !== undefined) lantern.lit = l.lit;
    if (lantern.deposited >= tuning.lantern_cost) lantern.lit = true;
  }

  if (scenario.motes) {
    const taken = new Set(scenario.motes.map((m) => m.id).filter(Boolean));
    state.motes = scenario.motes.map((m) => (m.id ? { id: m.id, pos: [...m.pos] } : newMote(state, [...m.pos], taken)));
  } else if (state.randomMotes) {
    const taken = new Set<string>();
    for (let i = 0; i < MOTE_INITIAL; i++) state.motes.push(newMote(state, randomIslandPoint(state), taken));
  }

  if (scenario.shades) {
    const taken = new Set(scenario.shades.map((s) => s.id).filter((x): x is string => !!x));
    state.shades = scenario.shades.map((s) => ({
      id: s.id ?? newShadeId(state, taken),
      pos: [...s.pos],
      state: 'chase',
      stunUntil: 0,
    }));
  }
  return state;
}

/** Moves `pos` to just outside `radius` (strictly > r, so "within r" (<= r) never holds). */
const SAFE_MARGIN = 0.001;
function pushOutOf(pos: Vec3, center: Vec3, radius: number): void {
  const dx = pos[0] - center[0];
  const dz = pos[2] - center[2];
  const d = Math.hypot(dx, dz);
  if (d > radius) return;
  radius += SAFE_MARGIN;
  const [ux, uz] = d < EPS ? [1, 0] : [dx / d, dz / d];
  pos[0] = center[0] + ux * radius;
  pos[2] = center[2] + uz * radius;
}

/** Shades cannot enter the safe radius of a lit lantern. */
function applySafeZones(shade: Shade, lanterns: Lantern[], tuning: Tuning): void {
  for (const l of lanterns) if (l.lit) pushOutOf(shade.pos, l.pos, tuning.safe_radius);
}

/**
 * Advances the game by one tick using the held input for this step.
 * Mutates `state`; returns events stamped with the new tick (k + 1).
 */
export function step(state: GameState, tuning: Tuning, input: InputState): TimedEvent[] {
  if (state.status !== 'playing') return [];
  const t = state.tick + 1;
  const events: TimedEvent[] = [];
  const emit = (event: GameEvent) => events.push({ tick: t, event });
  const p = state.player;
  const sc = tuning.score;

  // 1. Input edges (false -> true).
  const jumpPressed = input.jump && !state.prevButtons.jump;
  const interactPressed = input.interact && !state.prevButtons.interact;
  const pulsePressed = input.pulse && !state.prevButtons.pulse;
  state.prevButtons = { jump: input.jump, interact: input.interact, pulse: input.pulse };

  // 2. Movement (camera-relative, normalised) and jump. No world boundary: fall_enabled=false
  //    means leaving the island has no effect (Mây walks on the cloud sea), see assumption A8.
  let mx = input.move[0];
  let mz = input.move[1];
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (len > 0) {
    const th = (input.camYawDeg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    p.pos[0] += wx * tuning.player_speed * DT;
    p.pos[2] += wz * tuning.player_speed * DT;
  }
  if (jumpPressed && p.pos[1] <= 0) p.velY = JUMP_SPEED;
  if (p.pos[1] > 0 || p.velY > 0) {
    p.velY -= GRAVITY * DT;
    p.pos[1] += p.velY * DT;
    if (p.pos[1] <= 0) { p.pos[1] = 0; p.velY = 0; }
  }

  // 3. Pickup fireflies (in list order) while there is room.
  if (p.carried < tuning.carry_capacity) {
    state.motes = state.motes.filter((m) => {
      if (p.carried >= tuning.carry_capacity || distXZ(p.pos, m.pos) > tuning.pickup_radius + EPS) return true;
      p.carried += 1;
      state.score += sc.per_mote;
      emit({ name: 'mote_picked', data: { carried: p.carried } });
      return false;
    });
  }

  // 4. Interact: deposit into the nearest unlit lantern in range.
  if (interactPressed && p.carried > 0) {
    let target: Lantern | undefined;
    let best = Infinity;
    for (const l of state.lanterns) {
      const d = distXZ(p.pos, l.pos);
      if (!l.lit && d <= tuning.interact_radius + EPS && d < best) { best = d; target = l; }
    }
    if (target) {
      const amount = Math.min(p.carried, Math.max(0, tuning.lantern_cost - target.deposited));
      if (amount > 0) {
        p.carried -= amount;
        target.deposited += amount;
        emit({ name: 'deposit', data: { lantern_id: target.id, amount, deposited: target.deposited } });
        if (target.deposited >= tuning.lantern_cost) {
          target.lit = true;
          state.score += sc.per_lantern;
          emit({ name: 'lantern_lit', data: { lantern_id: target.id } });
        }
      }
    }
  }

  // 5. Pulse: costs carried light, stuns + pushes shades in range.
  if (pulsePressed && t >= p.pulseReadyAt && p.carried >= tuning.pulse_cost) {
    p.carried -= tuning.pulse_cost;
    p.pulseReadyAt = t + secondsToTicks(tuning.pulse_cooldown_s);
    const stunned: string[] = [];
    for (const s of state.shades) {
      const d = distXZ(p.pos, s.pos);
      if (d > tuning.pulse_radius + EPS) continue;
      s.state = 'stunned';
      s.stunUntil = t + secondsToTicks(tuning.pulse_stun_s);
      const [ux, uz] = d < EPS ? [1, 0] : [(s.pos[0] - p.pos[0]) / d, (s.pos[2] - p.pos[2]) / d];
      s.pos[0] += ux * tuning.pulse_push_m;
      s.pos[2] += uz * tuning.pulse_push_m;
      stunned.push(s.id);
      state.score += sc.per_stun;
    }
    emit({ name: 'pulse', data: { stunned_ids: stunned } });
  }

  // 6. Spawns (only when random generation is enabled).
  if (state.randomMotes && t % MOTE_RESPAWN_TICKS === 0 && state.motes.length < MOTE_MAX) {
    state.motes.push(newMote(state, randomIslandPoint(state), new Set(state.motes.map((m) => m.id))));
  }
  if (
    state.randomShades &&
    state.shades.length < SHADE_MAX_NIGHT1 &&
    t >= SHADE_FIRST_SPAWN_TICK &&
    (t - SHADE_FIRST_SPAWN_TICK) % SHADE_SPAWN_INTERVAL_TICKS === 0
  ) {
    const a = random(state) * Math.PI * 2;
    const id = newShadeId(state, new Set(state.shades.map((s) => s.id)));
    state.shades.push({ id, pos: [Math.sin(a) * SHADE_SPAWN_R, SHADE_HEIGHT, Math.cos(a) * SHADE_SPAWN_R], state: 'chase', stunUntil: 0 });
    state.shadesSpawned += 1;
    emit({ name: 'shade_spawned', data: { id } });
  }

  // 7. Shades: stunned ones wait; others chase the player horizontally.
  const stepLen = tuning.shade_speed * DT;
  for (const s of state.shades) {
    if (s.stunUntil > t) {
      s.state = 'stunned';
    } else {
      s.state = 'chase';
      const dx = p.pos[0] - s.pos[0];
      const dz = p.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      if (d <= stepLen) { s.pos[0] = p.pos[0]; s.pos[2] = p.pos[2]; }
      else { s.pos[0] += (dx / d) * stepLen; s.pos[2] += (dz / d) * stepLen; }
    }
    applySafeZones(s, state.lanterns, tuning);
  }

  // 8. Hits: one hit per tick, then invulnerability.
  if (t >= p.invulnUntil) {
    for (const s of state.shades) {
      if (s.state === 'stunned' || distXZ(p.pos, s.pos) > tuning.shade_hit_radius + EPS) continue;
      const dropped = Math.floor(p.carried * tuning.hit_drop_ratio + EPS);
      p.flames = Math.max(0, p.flames - 1);
      p.carried -= dropped;
      p.invulnUntil = t + secondsToTicks(tuning.invuln_s);
      emit({ name: 'player_hit', data: { by: 'shade', flames: p.flames, dropped } });
      break;
    }
  }

  // 9. End conditions (win has priority within the same tick).
  state.tick = t;
  const left = timeLeft(state);
  if (state.lanterns.every((l) => l.lit)) {
    state.status = 'won';
    state.score += sc.per_second_left * Math.floor(left + EPS) + sc.per_flame_left * p.flames;
    emit({ name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  } else if (p.flames <= 0) {
    state.status = 'lost';
    emit({ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
  } else if (left <= EPS) {
    state.status = 'lost';
    emit({ name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
  }
  return events;
}
