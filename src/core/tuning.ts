import type { Tuning } from './types.js';

const NUMERIC_KEYS = [
  'player_speed', 'carry_capacity', 'lantern_cost', 'lantern_count_night1', 'pickup_radius',
  'interact_radius', 'pulse_cost', 'pulse_radius', 'night1_duration_s', 'flames', 'invuln_s',
  'hit_drop_ratio', 'pulse_stun_s', 'pulse_push_m', 'pulse_cooldown_s', 'safe_radius',
  'shade_speed', 'shade_hit_radius',
] as const;
const SCORE_KEYS = ['per_mote', 'per_lantern', 'per_stun', 'per_second_left', 'per_flame_left'] as const;

/** Validates the `tuning` object of game.contract.json and returns it typed. Throws on error. */
export function parseTuning(contract: unknown): Tuning {
  if (typeof contract !== 'object' || contract === null) throw new Error('contract must be an object');
  const t = (contract as { tuning?: unknown }).tuning;
  if (typeof t !== 'object' || t === null) throw new Error('contract.tuning missing');
  const rec = t as Record<string, unknown>;
  for (const k of NUMERIC_KEYS) {
    const v = rec[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`tuning.${k} must be a number >= 0`);
  }
  if (typeof rec.fall_enabled !== 'boolean') throw new Error('tuning.fall_enabled must be boolean');
  const score = rec.score as Record<string, unknown> | undefined;
  if (typeof score !== 'object' || score === null) throw new Error('tuning.score missing');
  for (const k of SCORE_KEYS) {
    if (typeof score[k] !== 'number' || !Number.isFinite(score[k] as number)) throw new Error(`tuning.score.${k} must be a number`);
  }
  return t as Tuning;
}
