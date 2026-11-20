#!/usr/bin/env node
/**
 * Soak test (Ticket-04 §2, Contract v1.3):  node --expose-gc build/headless/soak.js --seed 7 --nights 10 --out soak.json
 * Output: {"nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"}. RSS in MB (1 decimal).
 * With --expose-gc a full GC runs before each memory reading so RSS reflects live memory, not garbage.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseTuning } from '../core/tuning.js';
import { runSoakNights } from './soak-core.js';

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function intArg(argv: string[], name: string, def: number | undefined, min: number): number {
  const v = arg(argv, name);
  if (v === undefined) { if (def === undefined) throw new Error(`--${name} is required`); return def; }
  if (!/^-?\d+$/.test(v) || Number(v) < min) throw new Error(`--${name} expects an integer >= ${min}`);
  return Number(v);
}
const rssMb = () => {
  (globalThis as { gc?: () => void }).gc?.();
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

function main(): number {
  const argv = process.argv.slice(2);
  let seed: number, nights: number, out: string | undefined;
  try {
    seed = intArg(argv, 'seed', 7, -2147483648);
    nights = intArg(argv, 'nights', 10, 1);
    out = arg(argv, 'out');
    if (!out) throw new Error('--out is required');
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 1;
  }
  const tuning = parseTuning(JSON.parse(readFileSync(new URL('../../game.contract.json', import.meta.url), 'utf8')));
  const t0 = performance.now();
  let memStart = 0;
  const { results, crashes } = runSoakNights(tuning, seed, nights, { afterFirstLoad: () => { memStart = rssMb(); } });
  const memEnd = rssMb();
  const report = { nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: Math.round((performance.now() - t0) / 100) / 10 };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report) + '\n');
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exitCode = 1;
}
