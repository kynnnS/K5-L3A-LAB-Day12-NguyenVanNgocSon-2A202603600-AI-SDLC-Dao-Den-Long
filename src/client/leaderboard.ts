/** Leaderboard storage for the client: the local server's disk file (/api/leaderboard), else localStorage. */
import { addEntry, isValidEntry, sortEntries, type LeaderboardEntry } from '../shared/leaderboard.js';

const LOCAL_KEY = 'dao-den-long.leaderboard';

function readLocal(): LeaderboardEntry[] {
  try { return sortEntries(((JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as { entries?: unknown[] }).entries ?? []).filter(isValidEntry)); } catch { return []; }
}

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const r = await fetch('/api/leaderboard');
    if (r.ok) return ((await r.json()) as { entries: LeaderboardEntry[] }).entries;
  } catch { /* no server (static hosting / vite dev) */ }
  return readLocal();
}

export async function saveScore(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  try {
    const r = await fetch('/api/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
    if (r.ok) return ((await r.json()) as { entries: LeaderboardEntry[] }).entries;
  } catch { /* fall back to localStorage */ }
  const entries = addEntry(readLocal(), entry);
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ entries })); } catch { /* ignore */ }
  return entries;
}
