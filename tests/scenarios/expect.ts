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

/** Validates the JSONL schema of Test Contract v1.1. Returns failures. */
export function checkSchema(lines: Array<Record<string, any>>): string[] {
  const fails: string[] = [];
  const isNum = (x: unknown) => typeof x === 'number' && Math.round(x * 1000) / 1000 === x;
  const isVec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(isNum);
  const states = ['playing', 'paused', 'won', 'lost'];
  const shadeStates = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
  const drifterStates = ['idle', 'chase', 'flee'];
  const eventData: Record<string, string[]> = {
    night_start: ['night'], mote_picked: ['carried'], deposit: ['lantern_id', 'amount', 'deposited'], lantern_lit: ['lantern_id'],
    pulse: ['stunned_ids'], player_hit: ['by', 'flames', 'dropped'], shade_spawned: ['id'], dash: [],
    charm_picked: ['charm_id', 'charm_ticks'], drifter_steal: ['drifter_id', 'amount', 'carried'],
    drifter_drop: ['drifter_id', 'amount'], paused: [], resumed: [], game_over: ['result', 'reason'],
  };
  lines.forEach((l, i) => {
    const at = `line ${i + 1}`;
    if (l.type === 'snapshot') {
      if (!Number.isInteger(l.tick) || !Number.isInteger(l.sim_tick) || l.sim_tick > l.tick) fails.push(`${at}: tick/sim_tick`);
      if (![1, 2, 3].includes(l.night)) fails.push(`${at}: night`);
      if (!states.includes(l.state)) fails.push(`${at}: state`);
      if (!isNum(l.time_left_s) || typeof l.score !== 'number') fails.push(`${at}: time_left_s/score`);
      if (typeof l.wind?.active !== 'boolean' || !(l.wind.dir_deg === null || typeof l.wind.dir_deg === 'number')) fails.push(`${at}: wind`);
      const p = l.player ?? {};
      if (!isVec(p.pos) || !isVec(p.vel) || typeof p.grounded !== 'boolean' || typeof p.invuln !== 'boolean'
        || !Number.isInteger(p.flames) || !Number.isInteger(p.carried) || !isNum(p.dash_cd_s) || !isNum(p.pulse_cd_s) || !isNum(p.charm_s)) fails.push(`${at}: player`);
      if (!Array.isArray(l.lanterns) || !l.lanterns.every((x: any) => typeof x.id === 'string' && isVec(x.pos) && typeof x.lit === 'boolean' && Number.isInteger(x.deposited))) fails.push(`${at}: lanterns`);
      if (!Array.isArray(l.shades) || !l.shades.every((x: any) => typeof x.id === 'string' && isVec(x.pos) && shadeStates.includes(x.state))) fails.push(`${at}: shades`);
      if (!Number.isInteger(l.motes_active) || !Array.isArray(l.motes) || l.motes.length !== l.motes_active
        || !l.motes.every((m: any) => typeof m.id === 'string' && isVec(m.pos) && ['random', 'dropped'].includes(m.kind) && (m.ttl_s === null || isNum(m.ttl_s)))) fails.push(`${at}: motes`);
      if (!Array.isArray(l.drifters) || !l.drifters.every((d: any) => typeof d.id === 'string' && isVec(d.pos) && drifterStates.includes(d.state) && Number.isInteger(d.stolen))) fails.push(`${at}: drifters`);
      if (!Array.isArray(l.charms) || !l.charms.every((c: any) => typeof c.id === 'string' && typeof c.available === 'boolean' && isNum(c.respawn_s))) fails.push(`${at}: charms`);
    } else if (l.type === 'event') {
      const keys = eventData[l.name];
      if (!Number.isInteger(l.tick) || !keys) fails.push(`${at}: event name/tick`);
      else {
        const want = l.name === 'player_hit' && l.data?.by === 'fall' ? [...keys, 'lost'] : keys;
        if (Object.keys(l.data ?? {}).sort().join() !== [...want].sort().join()) fails.push(`${at}: ${l.name} data keys`);
      }
    } else if (l.type === 'end') {
      if (i !== lines.length - 1) fails.push(`${at}: end not last`);
      if (!Number.isInteger(l.ticks) || !states.includes(l.state) || typeof l.score !== 'number') fails.push(`${at}: end fields`);
    } else fails.push(`${at}: unknown type ${String(l.type)}`);
  });
  if (lines[0]?.type !== 'snapshot' || lines[0]?.tick !== 0) fails.push('first line must be snapshot tick 0');
  if (lines[1]?.name !== 'night_start' || lines[1]?.tick !== 0) fails.push('second line must be night_start at tick 0');
  return fails;
}
