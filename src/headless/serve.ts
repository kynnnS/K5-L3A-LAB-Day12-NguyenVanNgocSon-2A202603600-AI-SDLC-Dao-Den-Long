#!/usr/bin/env node
/**
 * Game server / run_cmd (Contract v1.3):
 *   node build/headless/serve.js [--port 4173] [--no-open]      serve dist/ + local leaderboard API, open the browser
 *   node build/headless/serve.js --export-leaderboard out.json  write {"entries": [...]} (top 10, ordered) and exit 0
 * Leaderboard file (survives restarts): $DDL_LEADERBOARD or ~/.dao-den-long/leaderboard.json
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, isValidEntry, sortEntries, type LeaderboardEntry } from '../shared/leaderboard.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
};

export function leaderboardPath(): string {
  return process.env.DDL_LEADERBOARD ?? join(homedir(), '.dao-den-long', 'leaderboard.json');
}

export function readLeaderboard(file = leaderboardPath()): LeaderboardEntry[] {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { entries?: unknown[] };
    return sortEntries((raw.entries ?? []).filter(isValidEntry));
  } catch {
    return []; // missing or corrupt file -> empty board
  }
}

export function writeLeaderboard(entries: LeaderboardEntry[], file = leaderboardPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ entries: sortEntries(entries) }, null, 2) + '\n');
}

function send(res: ServerResponse, code: number, body: string, type = 'application/json'): void {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => { data += c; if (data.length > 5_000_000) reject(new Error('body too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export interface ServerOptions {
  port: number;
  /** Extra POST routes (used by the bench runner). */
  routes?: Record<string, (body: string) => void>;
}

export function startServer(opts: ServerOptions): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/leaderboard') {
        if (req.method === 'GET') return send(res, 200, JSON.stringify({ entries: readLeaderboard() }));
        if (req.method === 'POST') {
          const entry = JSON.parse(await readBody(req)) as LeaderboardEntry;
          if (!isValidEntry({ ...entry, name: String(entry.name ?? '').normalize('NFC').trim() })) return send(res, 400, JSON.stringify({ error: 'invalid entry' }));
          const entries = addEntry(readLeaderboard(), entry);
          writeLeaderboard(entries);
          return send(res, 200, JSON.stringify({ entries }));
        }
        return send(res, 405, '{}');
      }
      const route = opts.routes?.[url.pathname];
      if (route && req.method === 'POST') { route(await readBody(req)); return send(res, 200, '{}'); }
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      let file = join(DIST, rel || 'index.html');
      if (!file.startsWith(DIST)) return send(res, 403, 'forbidden', 'text/plain');
      if (!existsSync(file) || !extname(file)) file = join(DIST, 'index.html');
      send(res, 200, readFileSync(file) as unknown as string, TYPES[extname(file)] ?? 'application/octet-stream');
    } catch (e) {
      send(res, 500, JSON.stringify({ error: (e as Error).message }));
    }
  });
  return new Promise((resolve) => server.listen(opts.port, '127.0.0.1', () => resolve(server)));
}

export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
}

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--export-leaderboard')) {
    const out = argValue(argv, 'export-leaderboard');
    if (!out || out.startsWith('--')) { process.stderr.write('error: --export-leaderboard expects a file path\n'); return 1; }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ entries: readLeaderboard() }, null, 2) + '\n');
    return 0;
  }
  if (!existsSync(join(DIST, 'index.html'))) { process.stderr.write('error: dist/ not built, run "npm run build" first\n'); return 1; }
  const port = Number(argValue(argv, 'port') ?? 4173);
  await startServer({ port });
  const url = `http://localhost:${port}/`;
  process.stderr.write(`Đảo Đèn Lồng: ${url}  (leaderboard: ${leaderboardPath()})  Ctrl+C to stop\n`);
  if (!argv.includes('--no-open')) openBrowser(url);
  return -1; // keep serving
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  main().then((code) => { if (code >= 0) process.exitCode = code; }, (e) => { process.stderr.write(`error: ${(e as Error).message}\n`); process.exitCode = 1; });
}
