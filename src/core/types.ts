/** Shared game types. Units: metres, seconds; Y is up. */

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
  night2_duration_s: number;
  night3_duration_s: number;
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
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  // Contract v1.2 (Ticket-03): lantern fuel, dawn win ratio, growing capacity
  fuel_max: number;
  fuel_decay_per_s: number;
  fuel_per_mote: number;
  relight_cost: number;
  win_ratio: number;
  drain_per_s: number;
  low_fuel_threshold: number;
  capacity_max: number;
  score: ScoreTuning;
}

export type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
export type ShadeState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned' | 'drain';
export type DrifterState = 'idle' | 'chase' | 'flee';

export interface Player {
  pos: Vec3;
  /** Horizontal velocity actually applied last tick + vertical velocity. */
  vel: Vec3;
  grounded: boolean;
  facing: [number, number]; // unit XZ
  flames: number;
  carried: number;
  invulnTicks: number;
  dashTicks: number; // remaining dash movement ticks
  dashDir: [number, number];
  dashCdTicks: number;
  pulseCdTicks: number;
  charmTicks: number;
  /** Jump-pad launch velocity (XZ), kept until landing. */
  launch: [number, number] | null;
  /** > 0 while waiting to respawn after a fall. */
  respawnTicks: number;
  fallen: boolean;
  /** Successful lights this night (first lights + relights; scenario pre-lit lanterns excluded). */
  successfulLights: number;
}

export interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
  /** Fuel in integer units of 1/60 (6000 = 100.0). 0 while unlit. */
  fuel: number;
  everLit: boolean;
  relitCount: number;
}

export interface Shade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  stateTicks: number; // remaining ticks for spawning / recoil / stunned
  pushTicks: number; // remaining pulse knock-back ticks
  pushDir: [number, number];
  recoilDir: [number, number];
  wanderTarget: [number, number] | null;
  expelling: boolean; // inside a newly lit safe zone: moving out, harmless
  /** Lantern being drained (state drain) or targeted. */
  targetLanternId: string | null;
  /** Ticks drained since entering drain (fuel_drain event every 60). */
  drainTicks: number;
}

export interface Mote {
  id: string;
  pos: Vec3;
  kind: 'random' | 'dropped';
  ttlTicks: number | null;
  /** Index of the standard spawn point it occupies (random motes from the schedule), else -1. */
  point: number;
}

export interface Drifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  hasStolen: boolean;
  stateTicks: number; // flee ticks left
  wanderTarget: [number, number] | null;
}

export interface Charm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface Wind {
  active: boolean;
  dirDeg: number | null;
  ticksLeft: number;
}

/** Per-tick player input, already resolved from frames (held values). */
export interface InputState {
  move: [number, number];
  camYawDeg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export type GameEvent =
  | { name: 'night_start'; data: { night: number } }
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string; relight: boolean } }
  | { name: 'refuel'; data: { lantern_id: string; amount: number; fuel: number } }
  | { name: 'lantern_out'; data: { lantern_id: string } }
  | { name: 'fuel_drain'; data: { lantern_id: string; shade_id: string; fuel: number } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'player_hit'; data: { by: 'shade'; flames: number; dropped: number } }
  | { name: 'player_hit'; data: { by: 'fall'; flames: number; dropped: number; lost: number } }
  | { name: 'shade_spawned'; data: { id: string } }
  | { name: 'dash'; data: Record<string, never> }
  | { name: 'charm_picked'; data: { charm_id: string; charm_ticks: number } }
  | { name: 'drifter_steal'; data: { drifter_id: string; amount: number; carried: number } }
  | { name: 'drifter_drop'; data: { drifter_id: string; amount: number } }
  | { name: 'paused'; data: Record<string, never> }
  | { name: 'resumed'; data: Record<string, never> }
  | { name: 'game_over'; data: { result: 'won' | 'lost'; reason: 'dawn_survived' | 'dawn' | 'no_flames' } };

export interface TimedEvent {
  tick: number;
  event: GameEvent;
}

export interface GameState {
  night: 1 | 2 | 3;
  /** Steps run (including paused ticks). */
  tick: number;
  /** Gameplay steps run (frozen while paused). */
  simTick: number;
  status: GameStatus;
  paused: boolean;
  score: number;
  startTimeLeft: number;
  player: Player;
  lanterns: Lantern[];
  shades: Shade[];
  motes: Mote[];
  drifters: Drifter[];
  charms: Charm[];
  wind: Wind;
  windEnabled: boolean;
  randomMotes: boolean;
  randomShades: boolean;
  randomDrifters: boolean;
  rngState: number;
  nextMoteId: number;
  nextShadeId: number;
  nextDrifterId: number;
  prevButtons: { jump: boolean; interact: boolean; pulse: boolean; dash: boolean; pause: boolean };
}
