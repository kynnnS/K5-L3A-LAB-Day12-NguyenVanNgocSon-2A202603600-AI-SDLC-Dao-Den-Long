#!/usr/bin/env node
/**
 * Benchmark runner (Ticket-04 §1, Contract v1.3):  node build/headless/bench.js --seed 42 --duration 30 --out bench.json
 * Serves dist/, opens the game in bench mode (?bench=1) in a 1280x720 browser window, receives the per-frame
 * times measured by the page (3 s warm-up excluded) and writes bench.json. Exit 0 on success.
 * Browser: $DDL_BROWSER, else Chrome/Chromium (launched with vsync off, own profile, RSS sampled), else the
 * system default browser (macOS: Safari) - then vsync cannot be turned off and peak_mem_mb is null.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem, type as osType, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { frameMetrics, round1 } from '../shared/benchMetrics.js';
import { openBrowser, startServer } from './serve.js';

const PROCESS_START = performance.timeOrigin; // epoch ms when this process started

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function findChrome(): string | undefined {
  const env = process.env.DDL_BROWSER;
  if (env) return env;
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  for (const p of mac) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim() || undefined; } catch { /* not found */ }
  }
  return undefined;
}

/** Sum of RSS (MB) of a process and all its descendants (ps-based; macOS / Linux). */
function treeRssMb(rootPid: number): number | null {
  try {
    const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
    const kids = new Map<number, number[]>();
    for (const [pid, ppid] of rows) kids.set(ppid!, [...(kids.get(ppid!) ?? []), pid!]);
    const rss = new Map(rows.map(([pid, , kb]) => [pid!, kb!]));
    let total = 0;
    const stack = [rootPid];
    while (stack.length) { const p = stack.pop()!; total += rss.get(p) ?? 0; stack.push(...(kids.get(p) ?? [])); }
    return total / 1024;
  } catch {
    return null;
  }
}

interface PageResult { dts: number[]; firstFrameEpoch: number; renderer: string }

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const seed = Number(argValue(argv, 'seed') ?? 42);
  const duration = Number(argValue(argv, 'duration') ?? 30);
  const out = argValue(argv, 'out');
  if (!out || !Number.isInteger(seed) || !(duration > 0)) { process.stderr.write('usage: bench --seed <int> --duration <s> --out bench.json\n'); return 1; }
  if (!existsSync(new URL('../../dist/index.html', import.meta.url))) { process.stderr.write('error: dist/ not built, run "npm run build" first\n'); return 1; }

  let resolveResult!: (r: PageResult) => void;
  const result = new Promise<PageResult>((r) => { resolveResult = r; });
  const server = await startServer({ port: 0, routes: { '/api/bench-result': (body) => resolveResult(JSON.parse(body) as PageResult) } });
  const port = (server.address() as { port: number }).port;
  const url = `http://localhost:${port}/?bench=1&seed=${seed}&duration=${duration}`;

  const chrome = findChrome();
  let child: ChildProcess | undefined;
  let profile: string | undefined;
  if (chrome) {
    profile = mkdtempSync(join(tmpdir(), 'ddl-bench-'));
    child = spawn(chrome, [
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--window-size=1280,720', '--window-position=0,0', '--disable-gpu-vsync', '--disable-frame-rate-limit',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--app=${url}`,
    ], { stdio: 'ignore' });
  } else {
    openBrowser(url);
  }

  let peak: number | null = null;
  const sampler = setInterval(() => {
    if (!child?.pid) return;
    const mb = treeRssMb(child.pid);
    if (mb !== null) peak = Math.max(peak ?? 0, mb);
  }, 500);
  const limit = duration + 150;
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no result from the browser within ${limit} s (is the bench window visible? hidden windows get no frames)`)), limit * 1000));
  try {
    const r = await Promise.race([result, timeout]);
    if (process.env.DDL_BENCH_DTS) writeFileSync(process.env.DDL_BENCH_DTS, JSON.stringify(r.dts)); // raw frame times (evidence)
    const m = frameMetrics(r.dts);
    const report = {
      contract_version: '1.3',
      avg_fps: round1(m.avg_fps),
      p1_low_fps: round1(m.p1_low_fps),
      frame_ms_p95: round1(m.frame_ms_p95),
      frames: m.frames,
      load_ms: Math.round(r.firstFrameEpoch - PROCESS_START),
      peak_mem_mb: child ? (peak === null ? null : Math.round(peak)) : null,
      vsync_off: Boolean(child),
      renderer: r.renderer,
      os: `${osType()} ${release()} ${arch()} (${platform()}), ${cpus()[0]?.model ?? 'cpu'}, ${Math.round(totalmem() / 1073741824)} GB RAM`,
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    return 0;
  } finally {
    clearInterval(sampler);
    child?.kill();
    server.close();
    if (profile) setTimeout(() => rmSync(profile!, { recursive: true, force: true }), 500);
  }
}

main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 1000).unref(); }, (e) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});
