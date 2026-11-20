/** Integration tests: run the real built CLI exactly as the grader would. */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, runCli } from '../helpers.js';
import { checkExpect, checkSchema, type Expect } from './expect.js';

const FIX_DIR = join(ROOT, 'tests/scenarios/fixtures');
const snapAt = (lines: Array<Record<string, any>>, tick: number) => lines.find((l) => l.type === 'snapshot' && l.tick === tick)!;
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);
/** Numeric checks that need a tolerance (expectations derived by hand in the fixture description). */
const CUSTOM: Record<string, (lines: Array<Record<string, any>>) => string[]> = {
  '21-wind': (lines) => {
    const a = snapAt(lines, 1500).player.pos;
    const b = snapAt(lines, 2100).player.pos;
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return Math.abs(d - 10) < 0.01 ? [] : [`wind displacement ${d} != 10`];
  },
  '23-night2-pad': (lines) => {
    const dir = [50 / Math.hypot(50, 18), -18 / Math.hypot(50, 18)];
    const want = [20 + 83 * 0.4 * dir[0]!, 0, 18 + 83 * 0.4 * dir[1]!];
    const got = snapAt(lines, 84).player.pos;
    return near(got, want, 0.01) ? [] : [`landing ${JSON.stringify(got)} != ${JSON.stringify(want)}`];
  },
};
const fixtures = readdirSync(FIX_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(FIX_DIR, f), 'utf8')) as {
    id: string; requirement: string; night: number; seed: number; ticks: number; snapshot_every: number;
    scenario?: unknown; inputs?: unknown; expect: Expect;
  });

describe('scenario fixtures (real CLI)', () => {
  for (const f of fixtures) {
    it(`${f.id} [${f.requirement}]`, () => {
      const r = runCli({
        seed: f.seed, night: f.night, ticks: f.ticks, snapshotEvery: f.snapshot_every,
        ...(f.scenario !== undefined ? { scenario: f.scenario } : {}),
        ...(f.inputs !== undefined ? { inputs: f.inputs } : {}),
      });
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toBe('');
      expect(checkSchema(r.lines)).toEqual([]);
      expect(checkExpect(r.lines, f.expect)).toEqual([]);
      expect(CUSTOM[f.id]?.(r.lines) ?? []).toEqual([]);
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
    const r = runCli({ ticks: 5, night: 4 });
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
    expect(r.lines.map((l) => l.type)).toEqual(['snapshot', 'event', 'end']); // snapshot 0, night_start, end
  });
});

describe('performance: a full night (21 600 ticks) must finish in <= 30 s', () => {
  for (const night of [1, 2, 3]) {
    it(`night ${night}`, () => {
      const t0 = performance.now();
      const r = runCli({ seed: 99, night, ticks: 21600, scenario: { player: { flames: 999 } } });
      const ms = performance.now() - t0;
      expect(r.code).toBe(0);
      expect(ms).toBeLessThan(30000);
    });
  }
});

describe('C11 determinism (real CLI)', () => {
  it('same seed/scenario/inputs -> byte-identical output', () => {
    const inputs = { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 300, move: [-1, 0], pulse: true }, { tick: 301, pulse: false }] };
    const a = runCli({ seed: 777, night: 3, ticks: 4000, inputs });
    const b = runCli({ seed: 777, night: 3, ticks: 4000, inputs });
    expect(a.code).toBe(0);
    expect(a.raw.length).toBeGreaterThan(1000);
    expect(a.raw).toBe(b.raw);
  });
  it('default snapshot interval is 10', () => {
    const r = runCli({ ticks: 35 });
    expect(r.lines.filter((l) => l.type === 'snapshot').map((l) => l.tick)).toEqual([0, 10, 20, 30]);
  });
});
