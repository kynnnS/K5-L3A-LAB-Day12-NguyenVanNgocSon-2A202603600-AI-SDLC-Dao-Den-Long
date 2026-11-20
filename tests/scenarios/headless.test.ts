/** Integration tests: run the real built CLI exactly as the grader would. */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, runCli } from '../helpers.js';
import { checkExpect, checkSchema, type Expect } from './expect.js';

const FIX_DIR = join(ROOT, 'tests/scenarios/fixtures');
const fixtures = readdirSync(FIX_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(FIX_DIR, f), 'utf8')) as {
    id: string; requirement: string; seed: number; ticks: number; snapshot_every: number;
    scenario?: unknown; inputs?: unknown; expect: Expect;
  });

describe('scenario fixtures (real CLI)', () => {
  for (const f of fixtures) {
    it(`${f.id} [${f.requirement}]`, () => {
      const r = runCli({
        seed: f.seed, ticks: f.ticks, snapshotEvery: f.snapshot_every,
        ...(f.scenario !== undefined ? { scenario: f.scenario } : {}),
        ...(f.inputs !== undefined ? { inputs: f.inputs } : {}),
      });
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toBe('');
      expect(checkSchema(r.lines)).toEqual([]);
      expect(checkExpect(r.lines, f.expect)).toEqual([]);
    });
  }
});

describe('C2 CLI exit codes and errors', () => {
  it('malformed inputs JSON -> exit 2 with stderr', () => {
    const r = runCli({ ticks: 5, rawInputs: '{not json' });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/error/);
  });
  it('non-increasing frame ticks -> exit 2', () => {
    expect(runCli({ ticks: 5, inputs: { frames: [{ tick: 3 }, { tick: 2 }] } }).code).toBe(2);
  });
  it('malformed scenario -> exit 2', () => {
    expect(runCli({ ticks: 5, scenario: { player: { pos: 'origin' } } }).code).toBe(2);
    expect(runCli({ ticks: 5, rawScenario: '[1,2' }).code).toBe(2);
  });
  it('unsupported night -> non-zero, message on stderr', () => {
    const r = runCli({ ticks: 5, extra: ['--night', '2'] });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/night/);
  });
  it('missing required args -> exit 1, message on stderr, empty stdout', () => {
    for (const drop of ['--seed', '--night', '--ticks', '--out']) {
      const args = ['build/headless/cli.js', '--seed', '1', '--night', '1', '--ticks', '5', '--out', join(tmpdir(), 'ddl-missing.jsonl')];
      const i = args.indexOf(drop);
      args.splice(i, 2);
      const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' });
      expect(r.status, drop).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`missing ${drop}`));
      expect(r.stdout).toBe('');
    }
  });
  it('--ticks 0 -> only snapshot 0 + end', () => {
    const r = runCli({ ticks: 0 });
    expect(r.code).toBe(0);
    expect(r.lines.map((l) => l.type)).toEqual(['snapshot', 'end']);
  });
});

describe('C11 determinism (real CLI)', () => {
  it('same seed/scenario/inputs -> byte-identical output', () => {
    const inputs = { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 300, move: [-1, 0], pulse: true }, { tick: 301, pulse: false }] };
    const a = runCli({ seed: 777, ticks: 4000, inputs });
    const b = runCli({ seed: 777, ticks: 4000, inputs });
    expect(a.code).toBe(0);
    expect(a.raw.length).toBeGreaterThan(1000);
    expect(a.raw).toBe(b.raw);
  });
  it('default snapshot interval is 10', () => {
    const r = runCli({ ticks: 35 });
    expect(r.lines.filter((l) => l.type === 'snapshot').map((l) => l.tick)).toEqual([0, 10, 20, 30]);
  });
});
