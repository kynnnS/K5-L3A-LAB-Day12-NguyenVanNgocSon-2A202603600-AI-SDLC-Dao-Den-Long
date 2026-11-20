/** Headless run loop shared by the CLI and tests (no I/O). */
import { endRecord, eventRecord, snapshotRecord } from './output.js';
import { createGame, step } from './sim.js';
import { createInputReader, type InputFrame, type ScenarioSpec } from './spec.js';
import type { Tuning } from './types.js';

export interface RunOptions {
  tuning: Tuning;
  seed: number;
  night?: 1 | 2 | 3;
  ticks: number;
  snapshotEvery: number;
  scenario?: ScenarioSpec;
  frames?: InputFrame[];
}

/** Runs exactly `ticks` steps (or until the game ends) and returns JSONL lines. */
export function runHeadless(opts: RunOptions): string[] {
  const night = opts.night ?? 1;
  const state = createGame(opts.tuning, opts.seed, night, opts.scenario);
  const readInput = createInputReader(opts.frames ?? []);
  const lines: string[] = [JSON.stringify(snapshotRecord(state))];
  // Assumption B5: night_start is reported once, at tick 0, right after the tick-0 snapshot.
  lines.push(JSON.stringify(eventRecord({ tick: 0, event: { name: 'night_start', data: { night } } })));
  for (let k = 0; k < opts.ticks && (state.status === 'playing' || state.status === 'paused'); k++) {
    for (const e of step(state, opts.tuning, readInput(k))) lines.push(JSON.stringify(eventRecord(e)));
    if (state.tick % opts.snapshotEvery === 0) lines.push(JSON.stringify(snapshotRecord(state)));
  }
  lines.push(JSON.stringify(endRecord(state)));
  return lines;
}
