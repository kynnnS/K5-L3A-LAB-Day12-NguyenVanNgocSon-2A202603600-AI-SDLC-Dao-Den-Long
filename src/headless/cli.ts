#!/usr/bin/env node
/**
 * Headless runner (Test Contract v1.1).
 * <cmd> --seed <int> --night <1|2|3> [--scenario f] [--inputs f] --ticks <int> --out f.jsonl [--snapshot-every <int>]
 * Exit codes: 0 ok, 1 usage/runtime error, 2 malformed inputs/scenario file. Errors go to stderr only.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { run as runLoop } from './run-cli.js';

class UsageError extends Error {}

interface CliArgs {
  seed: number;
  night: number;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenario?: string;
  inputs?: string;
}

function parseIntArg(name: string, value: string | undefined, min: number): number {
  if (value === undefined || !/^-?\d+$/.test(value)) throw new UsageError(`--${name} expects an integer`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) throw new UsageError(`--${name} must be an integer >= ${min}`);
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    if (!key.startsWith('--')) throw new UsageError(`unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${key} requires a value`);
    map.set(key.slice(2), value);
    i++;
  }
  const known = new Set(['seed', 'night', 'ticks', 'out', 'snapshot-every', 'scenario', 'inputs']);
  for (const k of map.keys()) if (!known.has(k)) throw new UsageError(`unknown option --${k}`);
  for (const req of ['seed', 'night', 'ticks', 'out']) if (!map.has(req)) throw new UsageError(`missing --${req}`);
  const night = parseIntArg('night', map.get('night'), 1);
  if (night > 3) throw new UsageError(`--night ${night} is not available (1, 2 or 3)`);
  const args: CliArgs = {
    seed: parseIntArg('seed', map.get('seed'), Number.MIN_SAFE_INTEGER),
    night,
    ticks: parseIntArg('ticks', map.get('ticks'), 0),
    out: map.get('out')!,
    snapshotEvery: map.has('snapshot-every') ? parseIntArg('snapshot-every', map.get('snapshot-every'), 1) : 10,
  };
  if (map.has('scenario')) args.scenario = map.get('scenario')!;
  if (map.has('inputs')) args.inputs = map.get('inputs')!;
  return args;
}

function main(): number {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 1;
  }
  const contract = JSON.parse(readFileSync(new URL('../../game.contract.json', import.meta.url), 'utf8')) as unknown;
  const result = runLoop(contract, args, (p) => readFileSync(p, 'utf8'));
  if (!result.ok) {
    process.stderr.write(`error: ${result.message}\n`);
    return result.code;
  }
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, result.lines.join('\n') + '\n');
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exitCode = 1;
}
