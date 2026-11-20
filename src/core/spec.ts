/**
 * Parsing + validation of the contract's scenario and inputs files (pure, no I/O).
 * Any violation throws FormatError -> the CLI maps it to exit code 2.
 */
import type { InputState, Vec3 } from './types.js';

export class FormatError extends Error {}

export interface ScenarioSpec {
  player?: { pos?: Vec3; carried?: number; flames?: number };
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Array<{ id?: string; pos: Vec3 }>;
  shades?: Array<{ id?: string; pos: Vec3 }>;
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
}

type Obj = Record<string, unknown>;

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

/** Entity entry: either [x,y,z] or { id?, pos }. */
function entity(v: unknown, where: string): { id?: string; pos: Vec3 } {
  if (Array.isArray(v)) return { pos: vec3(v, where) };
  if (!isObj(v)) throw new FormatError(`${where}: expected [x,y,z] or {pos}`);
  const id = optId(v.id, `${where}.id`);
  return id === undefined ? { pos: vec3(v.pos, `${where}.pos`) } : { id, pos: vec3(v.pos, `${where}.pos`) };
}

export function parseScenario(raw: unknown, lanternIds: readonly string[]): ScenarioSpec {
  if (!isObj(raw)) throw new FormatError('scenario: expected a JSON object');
  const out: ScenarioSpec = {};
  if (raw.player !== undefined) {
    if (!isObj(raw.player)) throw new FormatError('scenario.player: expected object');
    const p = raw.player;
    out.player = {};
    if (p.pos !== undefined) out.player.pos = vec3(p.pos, 'scenario.player.pos');
    if (p.carried !== undefined) out.player.carried = int(p.carried, 'scenario.player.carried');
    if (p.flames !== undefined) out.player.flames = int(p.flames, 'scenario.player.flames');
  }
  if (raw.random_motes !== undefined) out.random_motes = bool(raw.random_motes, 'scenario.random_motes');
  if (raw.random_shades !== undefined) out.random_shades = bool(raw.random_shades, 'scenario.random_shades');
  for (const key of ['motes', 'shades'] as const) {
    const list = raw[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new FormatError(`scenario.${key}: expected array`);
    const parsed = list.map((e, i) => entity(e, `scenario.${key}[${i}]`));
    const ids = parsed.map((e) => e.id).filter((x): x is string => x !== undefined);
    if (new Set(ids).size !== ids.length) throw new FormatError(`scenario.${key}: duplicate id`);
    out[key] = parsed;
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) throw new FormatError('scenario.lanterns: expected array');
    out.lanterns = raw.lanterns.map((l, i) => {
      const where = `scenario.lanterns[${i}]`;
      if (!isObj(l)) throw new FormatError(`${where}: expected object`);
      if (typeof l.id !== 'string' || !lanternIds.includes(l.id)) throw new FormatError(`${where}.id: expected one of ${lanternIds.join(', ')}`);
      const entry: { id: string; pos?: Vec3; lit?: boolean; deposited?: number } = { id: l.id };
      if (l.pos !== undefined) entry.pos = vec3(l.pos, `${where}.pos`);
      if (l.lit !== undefined) entry.lit = bool(l.lit, `${where}.lit`);
      if (l.deposited !== undefined) entry.deposited = int(l.deposited, `${where}.deposited`);
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
    for (const b of ['jump', 'interact', 'pulse'] as const) {
      if (f[b] !== undefined) frame[b] = bool(f[b], `${where}.${b}`);
    }
    // Unknown keys (e.g. "dash") are ignored: this game has no such action.
    return frame;
  });
}

/**
 * Returns a reader that yields the held InputState for tick k.
 * Must be called with k = 0, 1, 2, ... in order.
 */
export function createInputReader(frames: readonly InputFrame[]): (tick: number) => InputState {
  const held: InputState = { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false };
  let idx = 0;
  return (tick: number) => {
    while (idx < frames.length && frames[idx]!.tick <= tick) {
      const f = frames[idx++]!;
      if (f.move) held.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) held.camYawDeg = f.cam_yaw_deg;
      if (f.jump !== undefined) held.jump = f.jump;
      if (f.interact !== undefined) held.interact = f.interact;
      if (f.pulse !== undefined) held.pulse = f.pulse;
    }
    return held;
  };
}
