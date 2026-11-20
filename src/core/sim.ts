/**
 * Game simulation (Ticket-02 / Contract v1.1). One step = 1/60 s. Pure logic: no rendering,
 * no wall clock, no Math.random. Used by both the 3D client and the headless CLI.
 *
 * Mandatory order inside a tick (Ticket-02 Part 1):
 *  1 input (pause first)  2 counters  3 move Mây (+fall)  4 pickups  5 lanterns  6 safe zones
 *  7 pulse  8 shades + drifters  9 contacts (drifters steal, then shades hit, by id)
 *  10 spawns  11 win/lose  (12 snapshot: done by the caller)
 */
import {
  CHARM_RESPAWN_TICKS, CHARM_SPEED, CHARM_TICKS, DRIFTER_CHASE_CARRY, DRIFTER_CHASE_DIST,
  DRIFTER_DROP_FLEE_TICKS, DRIFTER_FLEE_TICKS, DRIFTER_HEIGHT, DRIFTER_IDLE_SPEED, DRIFTER_MAX,
  DRIFTER_SPAWN_TICKS, DRIFTER_SPEED, DRIFTER_STEAL_MAX, DRIFTER_STEAL_RADIUS, DROP_RING_MAX,
  DROP_RING_MIN, DROP_TTL_TICKS, DT, FALL_Y, GRAVITY, JUMP_SPEED, MOTE_CAP, MOTE_INITIAL,
  MOTE_RESPAWN_TICKS, PICKUP_HEIGHT, PULSE_CENTER_Y, PULSE_PUSH_TICKS, RESPAWN_WAIT_TICKS,
  SAFE_EXPEL_TICKS, SAFE_MARGIN, SHADE_DETECT, SHADE_FIRST_SPAWN_COUNT, SHADE_FIRST_SPAWN_TICK,
  SHADE_HEIGHT, SHADE_HIT_HEIGHT, SHADE_LOSE, SHADE_RECOIL_M, SHADE_RECOIL_TICKS,
  SHADE_SPAWNING_TICKS, SHADE_SPAWN_MIN_DIST, SHADE_WANDER_SPEED, STEP_UP, TICKS_PER_SECOND,
  WIND_DURATION_TICKS, WIND_PERIOD_TICKS, WIND_SPEED,
} from './constants.js';
import { blockedByTower, getMap, groundHeight, nightDuration, type NightMap } from './maps.js';
import { nextRandom, seedToState } from './rng.js';
import type { ScenarioSpec } from './spec.js';
import type {
  Drifter, GameEvent, GameState, InputState, Lantern, Shade, TimedEvent, Tuning, Vec3,
} from './types.js';

const EPS = 1e-9;

export function secondsToTicks(s: number): number {
  return Math.round(s * TICKS_PER_SECOND);
}

export function timeLeft(state: GameState): number {
  return Math.max(0, state.startTimeLeft - state.simTick / TICKS_PER_SECOND);
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function unit(dx: number, dz: number): [number, number] {
  const d = Math.hypot(dx, dz);
  return d < EPS ? [1, 0] : [dx / d, dz / d];
}

/** Id order: same prefix -> numeric suffix (S2 < S10), else lexicographic. */
export function idCompare(a: string, b: string): number {
  const ma = /^(\D*)(\d+)$/.exec(a);
  const mb = /^(\D*)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}

function random(state: GameState): number {
  const [v, s] = nextRandom(state.rngState);
  state.rngState = s;
  return v;
}

function freeId(prefix: string, counter: () => number, taken: Set<string>): string {
  let id: string;
  do id = `${prefix}${counter()}`;
  while (taken.has(id));
  taken.add(id);
  return id;
}

export interface Ctx { map: NightMap; tuning: Tuning }


// ---------------------------------------------------------------- creation

/** Builds the initial state (snapshot tick 0). Scenario setup emits no events and awards no points. */
export function createGame(tuning: Tuning, seed: number, night: 1 | 2 | 3 = 1, scenario: ScenarioSpec = {}): GameState {
  const map = getMap(night, tuning);
  const sp = scenario.player ?? {};
  const pos: Vec3 = sp.pos ? [...sp.pos] : [...map.start];
  const g = groundHeight(map, pos[0], pos[2]);
  const state: GameState = {
    night,
    tick: 0,
    simTick: 0,
    status: 'playing',
    paused: false,
    score: 0,
    startTimeLeft: scenario.time_left_s ?? nightDuration(night, tuning),
    player: {
      pos,
      vel: [0, 0, 0],
      grounded: g !== null && Math.abs(pos[1] - g) < 1e-6,
      facing: [0, 1],
      flames: sp.flames ?? tuning.flames,
      carried: sp.carried ?? 0,
      invulnTicks: sp.invuln_ticks ?? 0,
      dashTicks: 0,
      dashDir: [0, 1],
      dashCdTicks: sp.dash_cd_ticks ?? 0,
      pulseCdTicks: sp.pulse_cd_ticks ?? 0,
      charmTicks: sp.charm_ticks ?? 0,
      launch: null,
      respawnTicks: 0,
      fallen: false,
    },
    lanterns: map.lanterns.map((l) => ({ id: l.id, pos: [...l.pos], lit: false, deposited: 0 })),
    shades: [],
    motes: [],
    drifters: [],
    charms: map.charms.map((c) => ({ id: c.id, pos: [...c.pos], available: true, respawnTicks: 0 })),
    wind: { active: false, dirDeg: null, ticksLeft: 0 },
    windEnabled: scenario.wind_enabled ?? map.wind,
    randomMotes: scenario.random_motes ?? true,
    randomShades: scenario.random_shades ?? true,
    randomDrifters: scenario.random_drifters ?? map.drifters,
    rngState: seedToState(seed),
    nextMoteId: 1,
    nextShadeId: 1,
    nextDrifterId: 1,
    prevButtons: { jump: false, interact: false, pulse: false, dash: false, pause: false },
  };

  for (const l of scenario.lanterns ?? []) {
    const lantern = state.lanterns.find((x) => x.id === l.id)!;
    if (l.pos) lantern.pos = [...l.pos];
    if (l.deposited !== undefined) lantern.deposited = l.deposited;
    if (l.lit !== undefined) lantern.lit = l.lit;
    if (lantern.deposited >= tuning.lantern_cost) lantern.lit = true;
  }

  const moteCounter = () => state.nextMoteId++;
  if (scenario.motes) {
    const taken = new Set(scenario.motes.map((m) => m.id).filter((x): x is string => !!x));
    state.motes = scenario.motes.map((m) => ({
      id: m.id ?? freeId('M', moteCounter, taken),
      pos: [...m.pos],
      kind: m.kind ?? 'random',
      ttlTicks: (m.kind ?? 'random') === 'dropped' ? m.ttl_ticks ?? DROP_TTL_TICKS : null,
      point: -1,
    }));
  } else if (state.randomMotes) {
    const taken = new Set<string>();
    const free = map.motePoints.map((_, i) => i);
    for (let k = 0; k < MOTE_INITIAL && free.length > 0; k++) {
      const i = free.splice(Math.floor(random(state) * free.length), 1)[0]!;
      state.motes.push({ id: freeId('M', moteCounter, taken), pos: [...map.motePoints[i]!], kind: 'random', ttlTicks: null, point: i });
    }
  }

  if (scenario.shades) {
    const taken = new Set(scenario.shades.map((s) => s.id).filter((x): x is string => !!x));
    state.shades = scenario.shades.map((s) => {
      const st = s.state ?? 'wander';
      const defTicks = st === 'spawning' ? SHADE_SPAWNING_TICKS : st === 'recoil' ? SHADE_RECOIL_TICKS : st === 'stunned' ? secondsToTicks(tuning.pulse_stun_s) : 0;
      return {
        id: s.id ?? freeId('S', () => state.nextShadeId++, taken),
        pos: [...s.pos], state: st, stateTicks: s.state_ticks_left ?? defTicks,
        pushTicks: 0, pushDir: [1, 0], recoilDir: unit(s.pos[0] - pos[0], s.pos[2] - pos[2]),
        wanderTarget: null, expelling: false,
      };
    });
  }

  if (scenario.drifters) {
    const taken = new Set(scenario.drifters.map((d) => d.id).filter((x): x is string => !!x));
    state.drifters = scenario.drifters.map((d) => ({
      id: d.id ?? freeId('D', () => state.nextDrifterId++, taken),
      pos: [...d.pos], state: d.state ?? 'idle', stolen: d.stolen ?? 0, hasStolen: (d.stolen ?? 0) > 0,
      stateTicks: d.state_ticks_left ?? (d.state === 'flee' ? DRIFTER_FLEE_TICKS : 0), wanderTarget: null,
    }));
  }

  if (scenario.charms) {
    const taken = new Set(scenario.charms.map((c) => c.id).filter((x): x is string => !!x));
    let n = 1;
    state.charms = scenario.charms.map((c) => {
      const id = c.id ?? freeId('C', () => n++, taken);
      const def = map.charms.find((m) => m.id === id);
      const available = c.available ?? true;
      return { id, pos: [...(c.pos ?? def!.pos)], available, respawnTicks: available ? 0 : c.respawn_ticks ?? CHARM_RESPAWN_TICKS };
    });
  }
  return state;
}

// ---------------------------------------------------------------- helpers

function moteBlockedPoint(state: GameState, i: number): boolean {
  return state.motes.some((m) => m.point === i);
}

function inLitZone(state: GameState, pos: Vec3, r: number): Lantern | undefined {
  return state.lanterns.find((l) => l.lit && distXZ(pos, l.pos) <= r);
}

/** Shade/drifter obstacle test for a horizontal position. */
function shadeBlocked(state: GameState, ctx: Ctx, x: number, z: number, y: number, respectSafe: boolean): boolean {
  if (groundHeight(ctx.map, x, z) === null) return true; // island edge / cloud sea
  if (blockedByTower(ctx.map, x, z, y)) return true;
  if (respectSafe && inLitZone(state, [x, 0, z], ctx.tuning.safe_radius)) return true;
  return false;
}

function setHoverY(ctx: Ctx, pos: Vec3, h: number): void {
  const g = groundHeight(ctx.map, pos[0], pos[2]);
  pos[1] = (g ?? 0) + h;
}

/** Keeps a shade outside every lit lantern zone (blocked at the 6 m edge). */
function clampOutOfZones(state: GameState, s: Shade, r: number): void {
  for (const l of state.lanterns) {
    if (!l.lit) continue;
    const d = distXZ(s.pos, l.pos);
    if (d > r) continue;
    const [ux, uz] = unit(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]);
    s.pos[0] = l.pos[0] + ux * (r + SAFE_MARGIN);
    s.pos[2] = l.pos[2] + uz * (r + SAFE_MARGIN);
  }
}

function pickWanderTarget(state: GameState, ctx: Ctx, from: Vec3): [number, number] | null {
  for (let tries = 0; tries < 4; tries++) {
    const a = random(state) * Math.PI * 2;
    const d = 3 + random(state) * 5;
    const x = from[0] + Math.cos(a) * d;
    const z = from[2] + Math.sin(a) * d;
    if (groundHeight(ctx.map, x, z) !== null) return [x, z];
  }
  return null;
}

function dropMotes(state: GameState, ctx: Ctx, center: Vec3, n: number, ring: boolean): void {
  const taken = new Set(state.motes.map((m) => m.id));
  for (let k = 0; k < n; k++) {
    let x = center[0];
    let z = center[2];
    if (ring) {
      const a = random(state) * Math.PI * 2;
      const r = DROP_RING_MIN + random(state) * (DROP_RING_MAX - DROP_RING_MIN);
      x += Math.cos(a) * r;
      z += Math.sin(a) * r;
    }
    const g = groundHeight(ctx.map, x, z);
    state.motes.push({
      id: freeId('M', () => state.nextMoteId++, taken),
      pos: [x, g ?? Math.max(0, center[1]), z], kind: 'dropped', ttlTicks: DROP_TTL_TICKS, point: -1,
    });
  }
}

// ---------------------------------------------------------------- step

/**
 * Advances one tick using the held input. Mutates `state`; returns events stamped with the new
 * tick (k + 1). While paused, only `tick` advances (sim_tick, timers and spawns are frozen).
 */
export function step(state: GameState, tuning: Tuning, input: InputState): TimedEvent[] {
  if (state.status === 'won' || state.status === 'lost') return [];
  const ctx: Ctx = { map: getMap(state.night, tuning), tuning };
  const events: TimedEvent[] = [];
  const tick = state.tick + 1;
  const emit = (event: GameEvent) => events.push({ tick, event });
  const p = state.player;
  const sc = tuning.score;

  // 1. Input: pause first; edges are false -> true.
  const prev = state.prevButtons;
  const pressed = (b: keyof typeof prev) => input[b] && !prev[b];
  const pausePressed = pressed('pause');
  const jumpPressed = pressed('jump');
  const interactPressed = pressed('interact');
  const pulsePressed = pressed('pulse');
  const dashPressed = pressed('dash');
  state.prevButtons = { jump: input.jump, interact: input.interact, pulse: input.pulse, dash: input.dash, pause: input.pause };
  state.tick = tick;
  if (pausePressed) {
    state.paused = !state.paused;
    emit(state.paused ? { name: 'paused', data: {} } : { name: 'resumed', data: {} });
  }
  if (state.paused) {
    state.status = 'paused';
    return events;
  }
  state.status = 'playing';
  const t = ++state.simTick;

  // 2. Counters.
  const dec = (v: number) => (v > 0 ? v - 1 : 0);
  p.invulnTicks = dec(p.invulnTicks);
  p.dashTicks = dec(p.dashTicks);
  p.dashCdTicks = dec(p.dashCdTicks);
  p.pulseCdTicks = dec(p.pulseCdTicks);
  p.charmTicks = dec(p.charmTicks);
  p.respawnTicks = dec(p.respawnTicks);
  for (const s of state.shades) {
    s.pushTicks = dec(s.pushTicks);
    if (s.state === 'spawning' || s.state === 'recoil' || s.state === 'stunned') {
      s.stateTicks = dec(s.stateTicks);
      if (s.stateTicks === 0) s.state = 'wander';
    }
  }
  state.motes = state.motes.filter((m) => {
    if (m.ttlTicks === null) return true;
    m.ttlTicks -= 1;
    return m.ttlTicks > 0;
  });
  for (const c of state.charms) {
    if (!c.available) {
      c.respawnTicks = dec(c.respawnTicks);
      if (c.respawnTicks === 0) c.available = true;
    }
  }
  state.drifters = state.drifters.filter((d) => {
    if (d.state !== 'flee') return true;
    d.stateTicks = dec(d.stateTicks);
    return d.stateTicks > 0; // flee over -> removed (with whatever it still carries)
  });
  if (state.wind.active) {
    state.wind.ticksLeft = dec(state.wind.ticksLeft);
    if (state.wind.ticksLeft === 0) state.wind = { active: false, dirDeg: null, ticksLeft: 0 };
  }
  if (state.windEnabled && t % WIND_PERIOD_TICKS === 0) {
    state.wind = { active: true, dirDeg: Math.floor(random(state) * 360), ticksLeft: WIND_DURATION_TICKS };
  }

  // 3. Move Mây (jump, dash, pads, wind) then check falling off the island.
  movePlayer(state, ctx, input, jumpPressed, dashPressed, emit);

  // 4. Pick up fireflies and charms.
  if (!p.fallen) {
    state.motes = state.motes.filter((m) => {
      if (p.carried >= tuning.carry_capacity) return true;
      if (distXZ(p.pos, m.pos) > tuning.pickup_radius + EPS || Math.abs(p.pos[1] - m.pos[1]) > PICKUP_HEIGHT + EPS) return true;
      p.carried += 1;
      emit({ name: 'mote_picked', data: { carried: p.carried } });
      return false;
    });
    for (const c of state.charms) {
      if (!c.available || distXZ(p.pos, c.pos) > tuning.pickup_radius + EPS || Math.abs(p.pos[1] - c.pos[1]) > PICKUP_HEIGHT + EPS) continue;
      c.available = false;
      c.respawnTicks = CHARM_RESPAWN_TICKS;
      p.charmTicks = CHARM_TICKS;
      emit({ name: 'charm_picked', data: { charm_id: c.id, charm_ticks: CHARM_TICKS } });
    }
  }

  // 5. Lantern interaction: nearest unlit in range, ties -> smaller id.
  if (interactPressed && !p.fallen && p.carried > 0) {
    let target: Lantern | undefined;
    let best = Infinity;
    for (const l of state.lanterns) {
      if (l.lit) continue;
      const d = distXZ(p.pos, l.pos);
      if (d > tuning.interact_radius + EPS) continue;
      if (d < best - EPS || (Math.abs(d - best) <= EPS && target && idCompare(l.id, target.id) < 0)) { best = d; target = l; }
    }
    if (target) {
      const amount = Math.min(p.carried, Math.max(0, tuning.lantern_cost - target.deposited));
      if (amount > 0) {
        p.carried -= amount;
        target.deposited += amount;
        state.score += sc.per_mote * amount;
        emit({ name: 'deposit', data: { lantern_id: target.id, amount, deposited: target.deposited } });
        if (target.deposited >= tuning.lantern_cost) {
          target.lit = true;
          state.score += sc.per_lantern;
          emit({ name: 'lantern_lit', data: { lantern_id: target.id } });
        }
      }
    }
  }

  // 6. Safe zones: shades inside a lit zone are pushed to the edge within 30 ticks (harmless meanwhile).
  const R = tuning.safe_radius;
  for (const s of state.shades) {
    const l = inLitZone(state, s.pos, R);
    if (!l) { s.expelling = false; continue; }
    s.expelling = true;
    const d = distXZ(s.pos, l.pos);
    const [ux, uz] = unit(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]);
    const nd = Math.min(R + SAFE_MARGIN, d + R / SAFE_EXPEL_TICKS);
    s.pos[0] = l.pos[0] + ux * nd;
    s.pos[2] = l.pos[2] + uz * nd;
    setHoverY(ctx, s.pos, SHADE_HEIGHT);
    if (nd > R) s.expelling = false;
  }

  // 7. Pulse: costs light, targets locked now (3D distance from feet + 0.8 m).
  if (pulsePressed && !p.fallen && p.pulseCdTicks === 0 && p.carried >= tuning.pulse_cost) {
    p.carried -= tuning.pulse_cost;
    p.pulseCdTicks = secondsToTicks(tuning.pulse_cooldown_s);
    const c: Vec3 = [p.pos[0], p.pos[1] + PULSE_CENTER_Y, p.pos[2]];
    const in3d = (q: Vec3) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) <= tuning.pulse_radius + EPS;
    const stunned: string[] = [];
    for (const s of state.shades) {
      if (s.state === 'spawning' || !in3d(s.pos)) continue;
      s.state = 'stunned';
      s.stateTicks = secondsToTicks(tuning.pulse_stun_s);
      s.pushTicks = PULSE_PUSH_TICKS;
      s.pushDir = unit(s.pos[0] - c[0], s.pos[2] - c[2]);
      stunned.push(s.id);
      state.score += sc.per_stun;
    }
    stunned.sort(idCompare);
    emit({ name: 'pulse', data: { stunned_ids: stunned } });
    for (const d of state.drifters) {
      if (!in3d(d.pos)) continue;
      if (d.state === 'chase') { d.state = 'flee'; d.stateTicks = DRIFTER_FLEE_TICKS; }
      else if (d.state === 'flee' && d.stolen > 0) {
        const amount = d.stolen;
        dropMotes(state, ctx, d.pos, amount, false);
        d.stolen = 0;
        d.stateTicks = DRIFTER_DROP_FLEE_TICKS;
        emit({ name: 'drifter_drop', data: { drifter_id: d.id, amount } });
      }
    }
  }

  // 8. Shades and drifters move.
  for (const s of state.shades) moveShade(state, ctx, s);
  for (const d of state.drifters) moveDrifter(state, ctx, d);

  // 9. Contacts: drifters steal first, then shades hit (ids ascending, max one flame per tick).
  if (!p.fallen) {
    for (const d of [...state.drifters].sort((a, b) => idCompare(a.id, b.id))) {
      if (d.state !== 'chase' || d.hasStolen || distXZ(p.pos, d.pos) > DRIFTER_STEAL_RADIUS + EPS) continue;
      const amount = Math.min(DRIFTER_STEAL_MAX, p.carried);
      if (amount <= 0) continue;
      p.carried -= amount;
      d.stolen = amount;
      d.hasStolen = true;
      d.state = 'flee';
      d.stateTicks = DRIFTER_FLEE_TICKS;
      emit({ name: 'drifter_steal', data: { drifter_id: d.id, amount, carried: p.carried } });
    }
    if (p.invulnTicks === 0) {
      for (const s of [...state.shades].sort((a, b) => idCompare(a.id, b.id))) {
        if ((s.state !== 'wander' && s.state !== 'chase') || s.expelling) continue;
        if (distXZ(p.pos, s.pos) > tuning.shade_hit_radius + EPS || Math.abs(p.pos[1] - s.pos[1]) > SHADE_HIT_HEIGHT + EPS) continue;
        const dropped = Math.floor(p.carried * tuning.hit_drop_ratio + EPS);
        p.flames = Math.max(0, p.flames - 1);
        p.carried -= dropped;
        p.invulnTicks = secondsToTicks(tuning.invuln_s);
        dropMotes(state, ctx, p.pos, dropped, true);
        s.state = 'recoil';
        s.stateTicks = SHADE_RECOIL_TICKS + 1; // set after movement: moves on the next 60 ticks (2 m total)
        s.recoilDir = unit(s.pos[0] - p.pos[0], s.pos[2] - p.pos[2]);
        emit({ name: 'player_hit', data: { by: 'shade', flames: p.flames, dropped } });
        break;
      }
    }
  }

  // 10. Spawns (new entities interact from the next tick).
  spawn(state, ctx, t, emit);

  // 11. Win / lose: no flames -> lost; else all lit -> won (even on the dawn tick); else dawn -> lost.
  const left = timeLeft(state);
  if (p.flames <= 0) {
    state.status = 'lost';
    emit({ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
  } else if (state.lanterns.every((l) => l.lit)) {
    state.status = 'won';
    state.score += sc.per_second_left * Math.floor(left + EPS) + sc.per_flame_left * p.flames;
    emit({ name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  } else if (left <= EPS) {
    state.status = 'lost';
    emit({ name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
  }
  return events;
}

// ---------------------------------------------------------------- player movement

function movePlayer(state: GameState, ctx: Ctx, input: InputState, jumpPressed: boolean, dashPressed: boolean, emit: (e: GameEvent) => void): void {
  const { map, tuning } = ctx;
  const p = state.player;
  if (p.fallen) {
    if (p.respawnTicks > 0) return; // waiting: no movement, no pickup, cannot be hit
    p.fallen = false;
    p.pos = [...map.start];
    p.vel = [0, 0, 0];
    p.grounded = true;
    p.launch = null;
    p.dashTicks = 0;
    p.facing = [0, 1];
    p.invulnTicks = secondsToTicks(tuning.invuln_s);
    return;
  }

  let mx = input.move[0];
  let mz = input.move[1];
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = (input.camYawDeg * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  const moving = Math.hypot(wx, wz) > EPS;
  if (moving) p.facing = unit(wx, wz);

  const charm = p.charmTicks > 0;
  if (dashPressed && p.dashTicks === 0 && (p.dashCdTicks === 0 || charm)) {
    p.dashTicks = secondsToTicks(tuning.dash_duration_s);
    p.dashDir = moving ? unit(wx, wz) : [...p.facing];
    p.dashCdTicks = charm ? 0 : secondsToTicks(tuning.dash_cooldown_s);
    emit({ name: 'dash', data: {} });
  }
  if (jumpPressed && p.grounded) {
    p.vel[1] = JUMP_SPEED;
    p.grounded = false;
  }

  let hx: number;
  let hz: number;
  if (p.dashTicks > 0) { hx = p.dashDir[0] * tuning.dash_speed; hz = p.dashDir[1] * tuning.dash_speed; }
  else if (p.launch) { [hx, hz] = p.launch; }
  else { const sp = charm ? CHARM_SPEED : tuning.player_speed; hx = wx * sp; hz = wz * sp; }
  if (state.wind.active && state.wind.dirDeg !== null) {
    const a = (state.wind.dirDeg * Math.PI) / 180;
    hx += Math.cos(a) * WIND_SPEED;
    hz += Math.sin(a) * WIND_SPEED;
  }

  // Horizontal move with walls (higher ground than a step) and the bell tower; slide per axis.
  const tryAt = (dx: number, dz: number) => {
    const nx = p.pos[0] + dx;
    const nz = p.pos[2] + dz;
    const g = groundHeight(map, nx, nz);
    if ((g !== null && g > p.pos[1] + STEP_UP) || blockedByTower(map, nx, nz, p.pos[1])) return false;
    p.pos[0] = nx;
    p.pos[2] = nz;
    return true;
  };
  const dx = hx * DT;
  const dz = hz * DT;
  if (dx !== 0 || dz !== 0) {
    if (!tryAt(dx, dz)) {
      if (!tryAt(dx, 0)) tryAt(0, dz);
    }
  }

  // Vertical: dashing in the air holds altitude; otherwise gravity.
  const dashing = p.dashTicks > 0;
  if (!p.grounded && !dashing) {
    p.vel[1] -= GRAVITY * DT;
    p.pos[1] += p.vel[1] * DT;
  }
  const g = groundHeight(map, p.pos[0], p.pos[2]);
  if (p.grounded) {
    if (g === null || g < p.pos[1] - STEP_UP) { p.grounded = false; p.vel[1] = 0; } // walked off an edge
    else p.pos[1] = g; // follow ramps
  } else if (g !== null && p.pos[1] <= g + 1e-9 && p.vel[1] <= 0 && !dashing) {
    p.pos[1] = g;
    p.vel[1] = 0;
    p.grounded = true;
    p.launch = null;
  }
  p.vel[0] = hx;
  p.vel[2] = hz;

  // Jump pads launch when the feet touch them.
  if (p.grounded) {
    for (const pad of map.pads) {
      if (Math.hypot(p.pos[0] - pad.x, p.pos[2] - pad.z) <= pad.r + EPS && Math.abs(p.pos[1] - pad.y) < 1e-6) {
        p.launch = [pad.dir[0] * pad.vh, pad.dir[1] * pad.vh];
        p.vel = [p.launch[0], pad.vy, p.launch[1]];
        p.grounded = false;
        break;
      }
    }
  }

  // Falling off the island: happens once, ignores invulnerability.
  if (tuning.fall_enabled && p.pos[1] < FALL_Y) {
    const lost = p.carried;
    p.flames = Math.max(0, p.flames - 1);
    p.carried = 0;
    p.fallen = true;
    p.respawnTicks = RESPAWN_WAIT_TICKS;
    p.vel = [0, 0, 0];
    p.dashTicks = 0;
    p.launch = null;
    emit({ name: 'player_hit', data: { by: 'fall', flames: p.flames, dropped: 0, lost } });
  }
}

// ---------------------------------------------------------------- shades / drifters

/** Moves along (ux,uz) by `dist`, stopping at obstacles. Returns false if fully blocked. */
function pushBody(state: GameState, ctx: Ctx, pos: Vec3, ux: number, uz: number, dist: number, respectSafe: boolean): boolean {
  const nx = pos[0] + ux * dist;
  const nz = pos[2] + uz * dist;
  if (shadeBlocked(state, ctx, nx, nz, pos[1], respectSafe)) return false;
  pos[0] = nx;
  pos[2] = nz;
  return true;
}

function moveShade(state: GameState, ctx: Ctx, s: Shade): void {
  const p = state.player;
  const R = ctx.tuning.safe_radius;
  if (s.state === 'spawning') return;
  if (s.expelling) { setHoverY(ctx, s.pos, SHADE_HEIGHT); return; } // leaving a newly lit zone (step 6 moves it)
  if (s.state === 'stunned') {
    if (s.pushTicks > 0) pushBody(state, ctx, s.pos, s.pushDir[0], s.pushDir[1], ctx.tuning.pulse_push_m / PULSE_PUSH_TICKS, true);
  } else if (s.state === 'recoil') {
    pushBody(state, ctx, s.pos, s.recoilDir[0], s.recoilDir[1], SHADE_RECOIL_M / SHADE_RECOIL_TICKS, true);
  } else {
    const targetable = !p.fallen;
    const d = distXZ(s.pos, p.pos);
    if (!targetable) s.state = 'wander';
    else if (s.state === 'wander' && d <= SHADE_DETECT + EPS) s.state = 'chase';
    else if (s.state === 'chase' && d > SHADE_LOSE + EPS) s.state = 'wander';
    if (s.state === 'chase') {
      const stepLen = ctx.map.shadeSpeed * DT;
      const [ux, uz] = unit(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);
      const nx = d <= stepLen ? p.pos[0] : s.pos[0] + ux * stepLen;
      const nz = d <= stepLen ? p.pos[2] : s.pos[2] + uz * stepLen;
      if (!shadeBlocked(state, ctx, nx, nz, s.pos[1], false)) { s.pos[0] = nx; s.pos[2] = nz; }
    } else {
      if (!s.wanderTarget || Math.hypot(s.wanderTarget[0] - s.pos[0], s.wanderTarget[1] - s.pos[2]) < 0.3) {
        s.wanderTarget = pickWanderTarget(state, ctx, s.pos);
      }
      if (s.wanderTarget) {
        const [tx, tz] = s.wanderTarget;
        const dd = Math.hypot(tx - s.pos[0], tz - s.pos[2]);
        const stepLen = Math.min(dd, SHADE_WANDER_SPEED * DT);
        const [ux, uz] = unit(tx - s.pos[0], tz - s.pos[2]);
        if (!pushBody(state, ctx, s.pos, ux, uz, stepLen, false)) s.wanderTarget = null;
      }
    }
    clampOutOfZones(state, s, R);
  }
  setHoverY(ctx, s.pos, SHADE_HEIGHT);
}

function moveDrifter(state: GameState, ctx: Ctx, d: Drifter): void {
  const p = state.player;
  const dist = distXZ(d.pos, p.pos);
  if (d.state !== 'flee') {
    const wants = !p.fallen && !d.hasStolen && p.carried >= DRIFTER_CHASE_CARRY && dist <= DRIFTER_CHASE_DIST + EPS;
    d.state = wants ? 'chase' : 'idle';
  }
  let ux: number;
  let uz: number;
  let speed: number;
  if (d.state === 'chase') {
    [ux, uz] = unit(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]);
    speed = Math.min(DRIFTER_SPEED * DT, dist);
  } else if (d.state === 'flee') {
    [ux, uz] = unit(d.pos[0] - p.pos[0], d.pos[2] - p.pos[2]);
    speed = DRIFTER_SPEED * DT;
  } else {
    if (!d.wanderTarget || Math.hypot(d.wanderTarget[0] - d.pos[0], d.wanderTarget[1] - d.pos[2]) < 0.3) d.wanderTarget = pickWanderTarget(state, ctx, d.pos);
    if (!d.wanderTarget) { setHoverY(ctx, d.pos, DRIFTER_HEIGHT); return; }
    const dd = Math.hypot(d.wanderTarget[0] - d.pos[0], d.wanderTarget[1] - d.pos[2]);
    [ux, uz] = unit(d.wanderTarget[0] - d.pos[0], d.wanderTarget[1] - d.pos[2]);
    speed = Math.min(DRIFTER_IDLE_SPEED * DT, dd);
  }
  // Drifters fly (cloud sea, safe zones and walls do not stop them).
  d.pos[0] += ux * speed;
  d.pos[2] += uz * speed;
  setHoverY(ctx, d.pos, DRIFTER_HEIGHT);
}

// ---------------------------------------------------------------- spawning

function spawn(state: GameState, ctx: Ctx, t: number, emit: (e: GameEvent) => void): void {
  const { map } = ctx;
  if (state.randomMotes && t % MOTE_RESPAWN_TICKS === 0 && state.motes.length < MOTE_CAP) {
    const free = map.motePoints.map((_, i) => i).filter((i) => !moteBlockedPoint(state, i));
    if (free.length > 0) {
      const i = free[Math.floor(random(state) * free.length)]!;
      const taken = new Set(state.motes.map((m) => m.id));
      state.motes.push({ id: freeId('M', () => state.nextMoteId++, taken), pos: [...map.motePoints[i]!], kind: 'random', ttlTicks: null, point: i });
    }
  }
  if (state.randomShades && t >= SHADE_FIRST_SPAWN_TICK && (t - SHADE_FIRST_SPAWN_TICK) % map.shadeIntervalTicks === 0) {
    const count = t === SHADE_FIRST_SPAWN_TICK ? SHADE_FIRST_SPAWN_COUNT : 1;
    const used = new Set<number>();
    for (let k = 0; k < count; k++) {
      if (state.shades.length >= map.shadeMax) break;
      const valid = map.shadePoints.map((_, i) => i).filter((i) => !used.has(i) && distXZ(map.shadePoints[i]!, state.player.pos) >= SHADE_SPAWN_MIN_DIST);
      if (valid.length === 0) break; // no valid point: skip this turn
      const i = valid[Math.floor(random(state) * valid.length)]!;
      used.add(i);
      const taken = new Set(state.shades.map((s) => s.id));
      const id = freeId('S', () => state.nextShadeId++, taken);
      const pos: Vec3 = [...map.shadePoints[i]!];
      setHoverY(ctx, pos, SHADE_HEIGHT);
      state.shades.push({ id, pos, state: 'spawning', stateTicks: SHADE_SPAWNING_TICKS, pushTicks: 0, pushDir: [1, 0], recoilDir: [1, 0], wanderTarget: null, expelling: false });
      emit({ name: 'shade_spawned', data: { id } });
    }
  }
  if (state.randomDrifters && t % DRIFTER_SPAWN_TICKS === 0 && state.drifters.length < DRIFTER_MAX) {
    const i = Math.floor(random(state) * map.shadePoints.length);
    const taken = new Set(state.drifters.map((d) => d.id));
    const pos: Vec3 = [...map.shadePoints[i]!];
    setHoverY(ctx, pos, DRIFTER_HEIGHT);
    state.drifters.push({ id: freeId('D', () => state.nextDrifterId++, taken), pos, state: 'idle', stolen: 0, hasStolen: false, stateTicks: 0, wanderTarget: null });
  }
}

