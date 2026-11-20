/**
 * Parsing + validation of the contract's scenario and inputs files (pure, no I/O).
 * Any violation throws FormatError -> the CLI maps it to exit code 2. Contract v1.1.
 */
import type { DrifterState, InputState, ShadeState, Vec3 } from './types.js';

export class FormatError extends Error {}

export interface ScenarioSpec {
  player?: {
    pos?: Vec3; carried?: number; flames?: number;
    invuln_ticks?: number; dash_cd_ticks?: number; pulse_cd_ticks?: number; charm_ticks?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Array<{ id?: string; pos: Vec3; kind?: 'random' | 'dropped'; ttl_ticks?: number }>;
  shades?: Array<{ id?: string; pos: Vec3; state?: ShadeState; state_ticks_left?: number }>;
  drifters?: Array<{ id?: string; pos: Vec3; state?: DrifterState; stolen?: number; state_ticks_left?: number }>;
  charms?: Array<{ id?: string; pos?: Vec3; available?: boolean; respawn_ticks?: number }>;
  lanterns?: Array<{ id: string; pos?: Vec3; lit?: boolean; deposited?: number }>;
  time_left_s?: number;
}

export interface InputFrame {
  tick: number;
  move?: [number, number];
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
}

type Obj = Record<string, unknown>;
const SHADE_STATES: readonly ShadeState[] = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
const DRIFTER_STATES: readonly DrifterState[] = ['idle', 'chase', 'flee'];

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function num(v: unknown, where: string, min = -Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) throw new FormatError(`${where}: expected number${min > -Infinity ? ` >= ${min}` : ''}`);
  return v;
}
function int(v: unknown, where: string, min = 0): number {
  const n = num(v, where, min);
  if (!Number.isInteger(n)) throw new FormatError(`${where}: expected integer`);
  return n;
}
function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new FormatError(`${where}: expected boolean`);
  return v;
}
function vec3(v: unknown, where: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) throw new FormatError(`${where}: expected [x, y, z]`);
  return [num(v[0], `${where}[0]`), num(v[1], `${where}[1]`), num(v[2], `${where}[2]`)];
}
function optId(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.length === 0) throw new FormatError(`${where}: expected non-empty string`);
  return v;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], where: string): T {
  if (typeof v !== 'string' || !list.includes(v as T)) throw new FormatError(`${where}: expected one of ${list.join(', ')}`);
  return v as T;
}
function list(raw: Obj, key: string): unknown[] | undefined {
  const v = raw[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new FormatError(`scenario.${key}: expected array`);
  return v;
}
function uniqueIds(items: Array<{ id?: string }>, key: string): void {
  const ids = items.map((e) => e.id).filter((x): x is string => x !== undefined);
  if (new Set(ids).size !== ids.length) throw new FormatError(`scenario.${key}: duplicate id`);
}
/** Entity entry: either [x,y,z] or { id?, pos, ... }. Returns the object form. */
function entity(v: unknown, where: string): Obj & { pos: Vec3 } {
  if (Array.isArray(v)) return { pos: vec3(v, where) };
  if (!isObj(v)) throw new FormatError(`${where}: expected [x,y,z] or {pos}`);
  return { ...v, pos: vec3(v.pos, `${where}.pos`) };
}

export function parseScenario(raw: unknown, lanternIds: readonly string[], charmIds: readonly string[] = []): ScenarioSpec {
  if (!isObj(raw)) throw new FormatError('scenario: expected a JSON object');
  const out: ScenarioSpec = {};
  if (raw.player !== undefined) {
    if (!isObj(raw.player)) throw new FormatError('scenario.player: expected object');
    const p = raw.player;
    const pl: NonNullable<ScenarioSpec['player']> = {};
    if (p.pos !== undefined) pl.pos = vec3(p.pos, 'scenario.player.pos');
    for (const k of ['carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks'] as const) {
      if (p[k] !== undefined) pl[k] = int(p[k], `scenario.player.${k}`);
    }
    out.player = pl;
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (raw[k] !== undefined) out[k] = bool(raw[k], `scenario.${k}`);
  }
  const motes = list(raw, 'motes');
  if (motes) {
    out.motes = motes.map((e, i) => {
      const w = `scenario.motes[${i}]`;
      const o = entity(e, w);
      const m: NonNullable<ScenarioSpec['motes']>[number] = { pos: o.pos };
      const id = optId(o.id, `${w}.id`);
      if (id) m.id = id;
      if (o.kind !== undefined) m.kind = oneOf(o.kind, ['random', 'dropped'] as const, `${w}.kind`);
      if (o.ttl_ticks !== undefined) m.ttl_ticks = int(o.ttl_ticks, `${w}.ttl_ticks`, 1);
      return m;
    });
    uniqueIds(out.motes, 'motes');
  }
  const shades = list(raw, 'shades');
  if (shades) {
    out.shades = shades.map((e, i) => {
      const w = `scenario.shades[${i}]`;
      const o = entity(e, w);
      const s: NonNullable<ScenarioSpec['shades']>[number] = { pos: o.pos };
      const id = optId(o.id, `${w}.id`);
      if (id) s.id = id;
      if (o.state !== undefined) s.state = oneOf(o.state, SHADE_STATES, `${w}.state`);
      if (o.state_ticks_left !== undefined) s.state_ticks_left = int(o.state_ticks_left, `${w}.state_ticks_left`);
      return s;
    });
    uniqueIds(out.shades, 'shades');
  }
  const drifters = list(raw, 'drifters');
  if (drifters) {
    out.drifters = drifters.map((e, i) => {
      const w = `scenario.drifters[${i}]`;
      const o = entity(e, w);
      const d: NonNullable<ScenarioSpec['drifters']>[number] = { pos: o.pos };
      const id = optId(o.id, `${w}.id`);
      if (id) d.id = id;
      if (o.state !== undefined) d.state = oneOf(o.state, DRIFTER_STATES, `${w}.state`);
      if (o.stolen !== undefined) d.stolen = int(o.stolen, `${w}.stolen`);
      if (o.state_ticks_left !== undefined) d.state_ticks_left = int(o.state_ticks_left, `${w}.state_ticks_left`);
      return d;
    });
    uniqueIds(out.drifters, 'drifters');
  }
  const charms = list(raw, 'charms');
  if (charms) {
    out.charms = charms.map((e, i) => {
      const w = `scenario.charms[${i}]`;
      if (!isObj(e)) throw new FormatError(`${w}: expected object`);
      const c: NonNullable<ScenarioSpec['charms']>[number] = {};
      const id = optId(e.id, `${w}.id`);
      if (id) c.id = id;
      if (e.pos !== undefined) c.pos = vec3(e.pos, `${w}.pos`);
      else if (!id || !charmIds.includes(id)) throw new FormatError(`${w}.pos: required (unless id is a default charm of this night)`);
      if (e.available !== undefined) c.available = bool(e.available, `${w}.available`);
      if (e.respawn_ticks !== undefined) c.respawn_ticks = int(e.respawn_ticks, `${w}.respawn_ticks`);
      return c;
    });
    uniqueIds(out.charms, 'charms');
  }
  const lanterns = list(raw, 'lanterns');
  if (lanterns) {
    out.lanterns = lanterns.map((l, i) => {
      const w = `scenario.lanterns[${i}]`;
      if (!isObj(l)) throw new FormatError(`${w}: expected object`);
      if (typeof l.id !== 'string' || !lanternIds.includes(l.id)) throw new FormatError(`${w}.id: expected one of ${lanternIds.join(', ')}`);
      const entry: { id: string; pos?: Vec3; lit?: boolean; deposited?: number } = { id: l.id };
      if (l.pos !== undefined) entry.pos = vec3(l.pos, `${w}.pos`);
      if (l.lit !== undefined) entry.lit = bool(l.lit, `${w}.lit`);
      if (l.deposited !== undefined) entry.deposited = int(l.deposited, `${w}.deposited`);
      return entry;
    });
  }
  if (raw.time_left_s !== undefined) out.time_left_s = num(raw.time_left_s, 'scenario.time_left_s', 0);
  return out;
}

export function parseInputs(raw: unknown): InputFrame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames)) throw new FormatError('inputs: expected {"frames": [...]}');
  let prevTick = -1;
  return raw.frames.map((f, i) => {
    const where = `inputs.frames[${i}]`;
    if (!isObj(f)) throw new FormatError(`${where}: expected object`);
    const tick = int(f.tick, `${where}.tick`);
    if (tick <= prevTick) throw new FormatError(`${where}.tick: ticks must be strictly increasing`);
    prevTick = tick;
    const frame: InputFrame = { tick };
    if (f.move !== undefined) {
      if (!Array.isArray(f.move) || f.move.length !== 2) throw new FormatError(`${where}.move: expected [x, z]`);
      frame.move = [num(f.move[0], `${where}.move[0]`), num(f.move[1], `${where}.move[1]`)];
    }
    if (f.cam_yaw_deg !== undefined) frame.cam_yaw_deg = num(f.cam_yaw_deg, `${where}.cam_yaw_deg`);
    for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (f[b] !== undefined) frame[b] = bool(f[b], `${where}.${b}`);
    }
    return frame;
  });
}

/**
 * Returns a reader that yields the held InputState for tick k.
 * Must be called with k = 0, 1, 2, ... in order.
 */
export function createInputReader(frames: readonly InputFrame[]): (tick: number) => InputState {
  const held: InputState = { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  let idx = 0;
  return (tick: number) => {
    while (idx < frames.length && frames[idx]!.tick <= tick) {
      const f = frames[idx++]!;
      if (f.move) held.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) held.camYawDeg = f.cam_yaw_deg;
      for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) if (f[b] !== undefined) held[b] = f[b];
    }
    return { ...held, move: [held.move[0], held.move[1]] };
  };
}
