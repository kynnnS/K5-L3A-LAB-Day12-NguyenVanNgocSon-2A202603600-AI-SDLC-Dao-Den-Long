/** Declarative expectation matcher for scenario fixtures (used by tests and scripts/run-scenarios). */

export interface Expect {
  events?: Array<Record<string, unknown>>; // ordered subsequence, partial match
  absent_events?: string[];
  event_counts?: Record<string, number>; // exact number of events per name
  snapshots?: Array<Record<string, unknown>>; // matched by tick, partial match
  end?: Record<string, unknown>;
}

/** Partial deep match: every key in `want` must equal (recursively) the key in `got`. Arrays must have the same length and match element-wise. */
export function partialMatch(got: unknown, want: unknown): boolean {
  if (Array.isArray(want)) {
    return Array.isArray(got) && got.length === want.length && want.every((w, i) => partialMatch(got[i], w));
  }
  if (typeof want === 'object' && want !== null) {
    if (typeof got !== 'object' || got === null) return false;
    return Object.entries(want).every(([k, v]) => partialMatch((got as Record<string, unknown>)[k], v));
  }
  return got === want;
}

/** Returns a list of human-readable failures (empty = pass). */
export function checkExpect(lines: Array<Record<string, any>>, expect: Expect): string[] {
  const fails: string[] = [];
  const events = lines.filter((l) => l.type === 'event');
  let cursor = 0;
  for (const want of expect.events ?? []) {
    const idx = events.findIndex((e, i) => i >= cursor && partialMatch(e, want));
    if (idx < 0) fails.push(`missing event (in order): ${JSON.stringify(want)}`);
    else cursor = idx + 1;
  }
  for (const name of expect.absent_events ?? []) {
    if (events.some((e) => e.name === name)) fails.push(`unexpected event: ${name}`);
  }
  for (const [name, n] of Object.entries(expect.event_counts ?? {})) {
    const got = events.filter((e) => e.name === name).length;
    if (got !== n) fails.push(`event count ${name}: got ${got} want ${n}`);
  }
  for (const want of expect.snapshots ?? []) {
    const snap = lines.find((l) => l.type === 'snapshot' && l.tick === want.tick);
    if (!snap) fails.push(`no snapshot at tick ${String(want.tick)}`);
    else if (!partialMatch(snap, want)) fails.push(`snapshot tick ${String(want.tick)} mismatch: want ${JSON.stringify(want)}`);
  }
  const end = lines.at(-1);
  if (!end || end.type !== 'end') fails.push('last line is not an end record');
  else if (expect.end && !partialMatch(end, expect.end)) fails.push(`end mismatch: got ${JSON.stringify(end)} want ${JSON.stringify(expect.end)}`);
  return fails;
}

/** Validates the JSONL schema of Test Contract v1.0. Returns failures. */
export function checkSchema(lines: Array<Record<string, any>>): string[] {
  const fails: string[] = [];
  const isVec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Math.round(x * 1000) / 1000 === x);
  const states = ['playing', 'won', 'lost'];
  const eventData: Record<string, string[]> = {
    mote_picked: ['carried'], deposit: ['lantern_id', 'amount', 'deposited'], lantern_lit: ['lantern_id'],
    pulse: ['stunned_ids'], player_hit: ['by', 'flames', 'dropped'], shade_spawned: ['id'], game_over: ['result', 'reason'],
  };
  lines.forEach((l, i) => {
    const at = `line ${i + 1}`;
    if (l.type === 'snapshot') {
      if (!Number.isInteger(l.tick) || l.sim_tick !== l.tick) fails.push(`${at}: tick/sim_tick`);
      if (!states.includes(l.state)) fails.push(`${at}: state`);
      if (typeof l.time_left_s !== 'number' || typeof l.score !== 'number') fails.push(`${at}: time_left_s/score`);
      if (!isVec(l.player?.pos) || !Number.isInteger(l.player?.flames) || !Number.isInteger(l.player?.carried)) fails.push(`${at}: player`);
      if (!Array.isArray(l.lanterns) || !l.lanterns.every((x: any) => typeof x.id === 'string' && isVec(x.pos) && typeof x.lit === 'boolean' && Number.isInteger(x.deposited))) fails.push(`${at}: lanterns`);
      if (!Array.isArray(l.shades) || !l.shades.every((x: any) => typeof x.id === 'string' && isVec(x.pos) && typeof x.state === 'string')) fails.push(`${at}: shades`);
      if (!Number.isInteger(l.motes_active)) fails.push(`${at}: motes_active`);
    } else if (l.type === 'event') {
      const keys = eventData[l.name];
      if (!Number.isInteger(l.tick) || !keys) fails.push(`${at}: event name/tick`);
      else if (Object.keys(l.data ?? {}).sort().join() !== [...keys].sort().join()) fails.push(`${at}: ${l.name} data keys`);
    } else if (l.type === 'end') {
      if (i !== lines.length - 1) fails.push(`${at}: end not last`);
      if (!Number.isInteger(l.ticks) || !states.includes(l.state) || typeof l.score !== 'number') fails.push(`${at}: end fields`);
    } else fails.push(`${at}: unknown type ${String(l.type)}`);
  });
  if (lines[0]?.type !== 'snapshot' || lines[0]?.tick !== 0) fails.push('first line must be snapshot tick 0');
  return fails;
}
