/** Loads + validates files for the CLI, then runs the shared headless loop. */
import { runHeadless } from '../core/run.js';
import { getMap } from '../core/maps.js';
import { FormatError, parseInputs, parseScenario, type InputFrame, type ScenarioSpec } from '../core/spec.js';
import { parseTuning } from '../core/tuning.js';

export type RunResult = { ok: true; lines: string[] } | { ok: false; code: number; message: string };

interface Args {
  seed: number;
  night: number;
  ticks: number;
  snapshotEvery: number;
  scenario?: string;
  inputs?: string;
}

function loadJson(path: string, label: string, read: (p: string) => string): unknown {
  let text: string;
  try {
    text = read(path);
  } catch (e) {
    throw new FormatError(`cannot read ${label} file ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new FormatError(`${label} file ${path} is not valid JSON: ${(e as Error).message}`);
  }
}

export function run(contract: unknown, args: Args, read: (p: string) => string): RunResult {
  const tuning = parseTuning(contract);
  let scenario: ScenarioSpec | undefined;
  let frames: InputFrame[] | undefined;
  try {
    const map = getMap(args.night, tuning);
    if (args.scenario) scenario = parseScenario(loadJson(args.scenario, 'scenario', read), map.lanterns.map((l) => l.id), map.charms.map((c) => c.id));
    if (args.inputs) frames = parseInputs(loadJson(args.inputs, 'inputs', read));
  } catch (e) {
    if (e instanceof FormatError) return { ok: false, code: 2, message: e.message };
    throw e;
  }
  const opts = { tuning, seed: args.seed, night: args.night as 1 | 2 | 3, ticks: args.ticks, snapshotEvery: args.snapshotEvery };
  return {
    ok: true,
    lines: runHeadless({ ...opts, ...(scenario ? { scenario } : {}), ...(frames ? { frames } : {}) }),
  };
}
