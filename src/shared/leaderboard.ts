/**
 * Ticket-04 §3 local leaderboard (pure). Shared by the Node server (disk storage + CLI export) and the
 * browser client (localStorage fallback). Top 10, score descending, ties -> earlier achieved_at first.
 */
export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export const LEADERBOARD_SIZE = 10;
/** 3-12 letters/digits/underscore. [A-Za-z0-9_] as required, plus Vietnamese (any Unicode letter) as the bonus. */
const NAME_RE = /^[\p{L}\p{N}_]{3,12}$/u;
/** ISO 8601 with an explicit time zone (Z or ±HH:MM). */
const ISO_TZ_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function normalizeName(name: string): string {
  return name.normalize('NFC').trim();
}

export function isValidName(name: string): boolean {
  return NAME_RE.test(normalizeName(name));
}

export function isValidEntry(e: unknown): e is LeaderboardEntry {
  if (typeof e !== 'object' || e === null) return false;
  const o = e as Record<string, unknown>;
  return typeof o.name === 'string' && isValidName(o.name)
    && typeof o.score === 'number' && Number.isInteger(o.score) && o.score >= 0
    && typeof o.nights_won === 'number' && Number.isInteger(o.nights_won) && o.nights_won >= 0 && o.nights_won <= 3
    && typeof o.achieved_at === 'string' && ISO_TZ_RE.test(o.achieved_at) && !Number.isNaN(Date.parse(o.achieved_at))
    && typeof o.seed === 'number' && Number.isInteger(o.seed);
}

/** Score descending; equal score -> earlier achieved_at first; still equal -> existing order (stable). */
export function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e);
}

export function addEntry(entries: LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  const e = { ...entry, name: normalizeName(entry.name) };
  if (!isValidEntry(e)) throw new Error('invalid leaderboard entry');
  return sortEntries([...entries.filter(isValidEntry), e]).slice(0, LEADERBOARD_SIZE);
}

/** Local time as ISO 8601 with the UTC offset, e.g. 2026-11-20T19:30:05+07:00. */
export function isoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    + `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}
