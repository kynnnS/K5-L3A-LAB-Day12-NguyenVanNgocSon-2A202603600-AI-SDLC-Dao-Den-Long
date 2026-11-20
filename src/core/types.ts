/** Shared game types. Units: metres, seconds; Y is up; ground at Y = 0. */

export type Vec3 = [number, number, number];

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

/** Mirrors `tuning` in game.contract.json (single source of truth). */
export interface Tuning {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export type GameStatus = 'playing' | 'won' | 'lost';
export type ShadeState = 'chase' | 'stunned';

export interface Player {
  pos: Vec3;
  velY: number;
  flames: number;
  carried: number;
  /** First tick at which the player can be hit again. */
  invulnUntil: number;
  /** First tick at which a pulse may fire again. */
  pulseReadyAt: number;
}

export interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface Shade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  /** Shade stays stunned while tick < stunUntil. */
  stunUntil: number;
}

export interface Mote {
  id: string;
  pos: Vec3;
}

/** Per-tick player input, already resolved from frames (held values). */
export interface InputState {
  move: [number, number];
  camYawDeg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
}

export type GameEvent =
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number } }
  | { name: 'shade_spawned'; data: { id: string } }
  | { name: 'game_over'; data: { result: 'won' | 'lost'; reason: 'all_lit' | 'dawn' | 'no_flames' } };

export interface TimedEvent {
  tick: number;
  event: GameEvent;
}

export interface GameState {
  /** Number of steps simulated so far. */
  tick: number;
  status: GameStatus;
  score: number;
  /** Night time left at tick 0; time_left_s = startTimeLeft - tick / 60. */
  startTimeLeft: number;
  player: Player;
  lanterns: Lantern[];
  shades: Shade[];
  motes: Mote[];
  randomMotes: boolean;
  randomShades: boolean;
  rngState: number;
  nextMoteId: number;
  nextShadeId: number;
  shadesSpawned: number;
  prevButtons: { jump: boolean; interact: boolean; pulse: boolean };
}
