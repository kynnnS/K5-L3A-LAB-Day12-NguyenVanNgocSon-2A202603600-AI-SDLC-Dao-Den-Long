import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, step } from '../src/core/sim.js';
import { createInputReader, type InputFrame, type ScenarioSpec } from '../src/core/spec.js';
import { parseTuning } from '../src/core/tuning.js';
import type { GameState, InputState, TimedEvent } from '../src/core/types.js';

export const ROOT = new URL('..', import.meta.url).pathname;
export const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
export const T = parseTuning(contract);

export const IDLE: InputState = { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false };

/** Isolated scenario: no random spawns unless overridden. */
export function game(spec: ScenarioSpec = {}, seed = 1): GameState {
  return createGame(T, seed, { random_motes: false, random_shades: false, motes: [], shades: [], ...spec });
}

/** Runs n steps with frames, returns all events. */
export function runSteps(state: GameState, n: number, frames: InputFrame[] = []): TimedEvent[] {
  const read = createInputReader(frames);
  const events: TimedEvent[] = [];
  for (let k = 0; k < n && state.status === 'playing'; k++) events.push(...step(state, T, read(state.tick)));
  return events;
}

export const names = (ev: TimedEvent[]) => ev.map((e) => e.event.name);

export interface CliResult {
  code: number | null;
  stderr: string;
  stdout: string;
  raw: string;
  lines: Array<Record<string, any>>;
}

/** Runs the real built CLI (build/headless/cli.js) like the grader would. */
export function runCli(opts: {
  seed?: number;
  ticks: number;
  scenario?: unknown;
  inputs?: unknown;
  snapshotEvery?: number;
  extra?: string[];
  rawScenario?: string;
  rawInputs?: string;
}): CliResult {
  const dir = mkdtempSync(join(tmpdir(), 'ddl-'));
  const out = join(dir, 'out.jsonl');
  const args = ['build/headless/cli.js', '--seed', String(opts.seed ?? 1), '--night', '1', '--ticks', String(opts.ticks), '--out', out];
  if (opts.snapshotEvery !== undefined) args.push('--snapshot-every', String(opts.snapshotEvery));
  if (opts.scenario !== undefined || opts.rawScenario !== undefined) {
    writeFileSync(join(dir, 's.json'), opts.rawScenario ?? JSON.stringify(opts.scenario));
    args.push('--scenario', join(dir, 's.json'));
  }
  if (opts.inputs !== undefined || opts.rawInputs !== undefined) {
    writeFileSync(join(dir, 'i.json'), opts.rawInputs ?? JSON.stringify(opts.inputs));
    args.push('--inputs', join(dir, 'i.json'));
  }
  args.push(...(opts.extra ?? []));
  const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' });
  let raw = '';
  try { raw = readFileSync(out, 'utf8'); } catch { /* no output on error */ }
  return {
    code: r.status,
    stderr: r.stderr,
    stdout: r.stdout,
    raw,
    lines: raw.trim() ? raw.trim().split('\n').map((l) => JSON.parse(l)) : [],
  };
}
