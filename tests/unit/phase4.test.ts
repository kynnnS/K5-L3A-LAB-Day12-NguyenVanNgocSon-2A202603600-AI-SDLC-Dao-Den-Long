/** Ticket-04 (Contract v1.3): bench scene + metrics, soak, leaderboard, key remapping. Expectations derived by hand. */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BENCH_MOTES, BENCH_SHADES, createBenchGame } from '../../src/core/bench.js';
import { distXZ, step } from '../../src/core/sim.js';
import { runSoakNights } from '../../src/headless/soak-core.js';
import { frameMetrics } from '../../src/shared/benchMetrics.js';
import { DEFAULT_KEYMAP, keyConflicts, sanitizeKeymap } from '../../src/shared/keymap.js';
import { addEntry, isValidName, isoWithOffset, sortEntries, type LeaderboardEntry } from '../../src/shared/leaderboard.js';
import { IDLE, ROOT, T } from '../helpers.js';

describe('P4-1 bench scene', () => {
  it('Night 1, exactly 200 wander shades and 100 motes on the island, L1-L3 lit with fuel 100, Mây at the origin', () => {
    const s = createBenchGame(T, 42);
    expect(s.night).toBe(1);
    expect(s.shades).toHaveLength(BENCH_SHADES);
    expect(BENCH_SHADES).toBe(200);
    expect(s.motes).toHaveLength(BENCH_MOTES);
    expect(BENCH_MOTES).toBe(100);
    expect(s.shades.every((x) => x.state === 'wander' && distXZ(x.pos, [0, 0, 0]) <= 38)).toBe(true);
    expect(s.motes.every((m) => distXZ(m.pos, [0, 0, 0]) <= 38)).toBe(true);
    expect(s.lanterns.map((l) => [l.id, l.lit, l.fuel])).toEqual([['L1', true, 6000], ['L2', true, 6000], ['L3', true, 6000], ['L4', false, 0], ['L5', false, 0]]);
    expect(s.player.pos).toEqual([0, 0, 0]);
  });
  it('same seed -> same spread; spread covers the whole disk (all four quadrants)', () => {
    expect(createBenchGame(T, 42).shades.map((x) => x.pos)).toEqual(createBenchGame(T, 42).shades.map((x) => x.pos));
    const q = new Set(createBenchGame(T, 42).shades.map((x) => `${Math.sign(x.pos[0])}${Math.sign(x.pos[2])}`));
    expect(q.size).toBe(4);
  });
  it('bench step: no spawns, damage, pickups, fuel use or end of night; shades keep wandering (they move)', () => {
    const s = createBenchGame(T, 42);
    const before = s.shades.map((x) => [...x.pos]);
    const events = [];
    for (let k = 0; k < 60 * 400; k++) events.push(...step(s, T, IDLE)); // 400 s > the 240 s night
    expect(events.filter((e) => e.event.name !== 'lantern_lit')).toEqual([]);
    expect(s.status).toBe('playing');
    expect(s.shades).toHaveLength(200);
    expect(s.motes).toHaveLength(100);
    expect(s.player.flames).toBe(3);
    expect(s.player.carried).toBe(0);
    expect(s.lanterns.slice(0, 3).map((l) => l.fuel)).toEqual([6000, 6000, 6000]);
    expect(s.shades.every((x) => x.state === 'wander')).toBe(true);
    expect(s.shades.some((x, i) => distXZ(x.pos, before[i] as [number, number, number]) > 1)).toBe(true);
  });
});

describe('P4-1 bench metrics (Ticket-04 formulas)', () => {
  it('avg_fps = 1000 N / sum dt; p1_low = 1000 / mean(k worst), k = max(1, ceil(0.01 N)); p95 nearest-rank', () => {
    // 99 frames of 10 ms + 1 frame of 40 ms: sum 1030 -> avg 1000*100/1030 = 97.087; k = 1 -> 1000/40 = 25; p95 = 95th of sorted = 10
    const m = frameMetrics([...Array(99).fill(10), 40]);
    expect(m.frames).toBe(100);
    expect(m.avg_fps).toBeCloseTo(97.087, 3);
    expect(m.p1_low_fps).toBe(25);
    expect(m.frame_ms_p95).toBe(10);
    // N = 250 -> k = ceil(2.5) = 3 worst = 30, 20, 20 -> mean 23.33 -> 42.857; p95 = rank ceil(237.5) = 238
    // (1-based) = sorted[237]; indices 0..239 are 5 ms -> 5. With 230 x 5 ms the 238th value is 12 ms.
    const dts = [...Array(240).fill(5), ...Array(7).fill(12), 20, 20, 30];
    const m2 = frameMetrics(dts);
    expect(m2.p1_low_fps).toBeCloseTo(1000 / (70 / 3), 9);
    expect(m2.frame_ms_p95).toBe(5);
    expect(frameMetrics([...Array(230).fill(5), ...Array(17).fill(12), 20, 20, 30]).frame_ms_p95).toBe(12);
  });
});

describe('P4-2 soak', () => {
  it('10 nights cycle 1 -> 2 -> 3 with seeds 8..17, no crash, deterministic results', () => {
    const a = runSoakNights(T, 7, 10);
    expect(a.crashes).toBe(0);
    expect(a.results).toHaveLength(10);
    expect(a.results.every((r) => r === 'won' || r === 'lost')).toBe(true);
    expect(runSoakNights(T, 7, 10)).toEqual(a);
  });
  it('soak CLI writes the contract fields and passes the memory budget', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ddl-soak-')), 'soak.json');
    const r = spawnSync('node', ['--expose-gc', '--jitless', 'build/headless/soak.js', '--seed', '7', '--nights', '10', '--out', out], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const j = JSON.parse(readFileSync(out, 'utf8'));
    expect(Object.keys(j)).toEqual(['nights', 'crashes', 'results', 'mem_start_mb', 'mem_end_mb', 'duration_s']);
    expect(j.nights).toBe(10);
    expect(j.crashes).toBe(0);
    expect(j.mem_end_mb).toBeLessThanOrEqual(1.2 * j.mem_start_mb);
  });
});

describe('P4-3 leaderboard', () => {
  const e = (name: string, score: number, at: string, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({ name, score, nights_won: 1, achieved_at: at, seed: 1, ...extra });
  it('names: 3-12 of [A-Za-z0-9_] (+ Vietnamese letters as the bonus); everything else rejected', () => {
    for (const ok of ['abc', 'Ngoc_Son_123', 'A1_', 'Sơn', 'NgọcSơn']) expect(isValidName(ok)).toBe(true);
    for (const bad of ['ab', 'abcdefghijklm', 'a b c', 'abc!', '', 'x-y-z']) expect(isValidName(bad)).toBe(false);
  });
  it('score descending; equal score -> earlier achieved_at first; top 10 kept', () => {
    let list: LeaderboardEntry[] = [];
    list = addEntry(list, e('late', 500, '2026-11-20T20:00:00+07:00'));
    list = addEntry(list, e('early', 500, '2026-11-20T12:00:00Z')); // 19:00 +07:00 -> earlier
    list = addEntry(list, e('top', 900, '2026-11-20T21:00:00+07:00'));
    expect(list.map((x) => x.name)).toEqual(['top', 'early', 'late']);
    for (let i = 0; i < 12; i++) list = addEntry(list, e(`p${i}xx`, 100 + i, '2026-11-20T10:00:00+07:00'));
    expect(list).toHaveLength(10);
    expect(list.at(-1)!.score).toBe(105); // 900, 500, 500 + the 7 best of 100..111 (111..105); 100..104 pushed out
    expect(sortEntries(list)).toEqual(list);
  });
  it('rejects invalid entries; achieved_at is ISO 8601 with a time-zone offset', () => {
    expect(() => addEntry([], e('ab', 1, '2026-11-20T10:00:00+07:00'))).toThrow();
    expect(() => addEntry([], e('abc', 1, '2026-11-20 10:00'))).toThrow();
    expect(() => addEntry([], e('abc', 1, '2026-11-20T10:00:00+07:00', { nights_won: 4 }))).toThrow();
    expect(isoWithOffset(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
  it('--export-leaderboard writes {"entries": [...]} in order from the on-disk file (exit 0)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddl-lb-'));
    const file = join(dir, 'lb.json');
    const out = join(dir, 'out.json');
    const entries = [e('bbb', 10, '2026-11-20T10:00:00+07:00'), e('aaa', 30, '2026-11-20T11:00:00+07:00')];
    writeFileSync(file, JSON.stringify({ entries }));
    const r = spawnSync('node', ['build/headless/serve.js', '--export-leaderboard', out], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DDL_LEADERBOARD: file } });
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ entries: [entries[1], entries[0]] });
    const empty = join(dir, 'empty.json');
    expect(spawnSync('node', ['build/headless/serve.js', '--export-leaderboard', empty], { cwd: ROOT, env: { ...process.env, DDL_LEADERBOARD: join(dir, 'none.json') } }).status).toBe(0);
    expect(JSON.parse(readFileSync(empty, 'utf8'))).toEqual({ entries: [] });
    expect(existsSync(out)).toBe(true);
  });
});

describe('P4-4 key remapping', () => {
  it('defaults have no conflicts; duplicates and reserved keys are reported; bad stored maps fall back', () => {
    expect(keyConflicts(DEFAULT_KEYMAP)).toEqual([]);
    expect(keyConflicts({ ...DEFAULT_KEYMAP, jump: 'KeyE' })).toEqual([{ code: 'KeyE', actions: ['jump', 'interact'], reserved: false }]);
    expect(keyConflicts({ ...DEFAULT_KEYMAP, pause: 'Escape' })).toEqual([{ code: 'Escape', actions: ['pause'], reserved: true }]);
    expect(sanitizeKeymap({ jump: 'KeyJ', dash: 3 })).toEqual({ ...DEFAULT_KEYMAP, jump: 'KeyJ' });
  });
});
