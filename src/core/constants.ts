/**
 * Standard numbers from Ticket-02 Part 1 that are NOT keys of the contract `tuning`.
 * Tuning-key numbers live only in game.contract.json (read via parseTuning).
 */
export const TICKS_PER_SECOND = 60;
export const DT = 1 / TICKS_PER_SECOND;

// Movement
export const GRAVITY = 20; // m/s^2 (downwards)
export const JUMP_SPEED = 7; // m/s
export const STEP_UP = 0.35; // max ground rise walkable per tick (ramps ok, 3 m cliffs block)
export const FALL_Y = -10; // below this = fell off the island

// Fireflies
export const PICKUP_HEIGHT = 1.5; // |feet y - mote ground y|
export const MOTE_INITIAL = 20;
export const MOTE_CAP = 30;
export const MOTE_RESPAWN_TICKS = 240;
export const DROP_RING_MIN = 1.5;
export const DROP_RING_MAX = 2.5;
export const DROP_TTL_TICKS = 480;

// Lantern safe zone
export const SAFE_EXPEL_TICKS = 30; // shades inside a newly lit zone leave within 30 ticks
export const SAFE_MARGIN = 0.001; // shades are kept strictly outside (> r)

// Pulse
export const PULSE_CENTER_Y = 0.8;
export const PULSE_PUSH_TICKS = 15;

// Shades
export const SHADE_HEIGHT = 1; // centre above ground
export const SHADE_DETECT = 12;
export const SHADE_LOSE = 18;
export const SHADE_HIT_HEIGHT = 1.5;
export const SHADE_SPAWNING_TICKS = 60; // assumption B2
export const SHADE_WANDER_SPEED = 2; // assumption B2
export const SHADE_RECOIL_M = 2;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_FIRST_SPAWN_TICK = 300;
export const SHADE_FIRST_SPAWN_COUNT = 2;
export const SHADE_SPAWN_MIN_DIST = 15;

// Player hit / fall
export const HIT_INVULN_TICKS = 90;
export const RESPAWN_WAIT_TICKS = 60;

// Drifters (Gio Lac)
export const DRIFTER_HEIGHT = 1;
export const DRIFTER_SPEED = 7;
export const DRIFTER_IDLE_SPEED = 2;
export const DRIFTER_MAX = 2;
export const DRIFTER_SPAWN_TICKS = 1200;
export const DRIFTER_CHASE_CARRY = 5;
export const DRIFTER_CHASE_DIST = 15;
export const DRIFTER_STEAL_RADIUS = 1.2;
export const DRIFTER_STEAL_MAX = 3;
export const DRIFTER_FLEE_TICKS = 240;
export const DRIFTER_DROP_FLEE_TICKS = 120;

// Wind charm (Bua Gio)
export const CHARM_TICKS = 600;
export const CHARM_SPEED = 7.2;
export const CHARM_RESPAWN_TICKS = 2700;

// Strong wind (night 3)
export const WIND_PERIOD_TICKS = 1800;
export const WIND_DURATION_TICKS = 300;
export const WIND_WARNING_TICKS = 120;
export const WIND_SPEED = 2;

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
}

// Ticket-03 (Contract v1.2) non-tuning standard numbers.
/** Internal fuel unit = 1/60 fuel (integer arithmetic, no float drift). */
export const FUEL_UNITS = 60;
export const CAPACITY_PER_LIGHT = 2;
export const DRAIN_RADIUS = 2; // wander -> drain within 2 m (XZ) of a weak lantern
export const DRAIN_CHASE_RADIUS = 6; // drain -> chase when Mây is within 6 m
export const FUEL_DRAIN_EVENT_TICKS = 60;
export const SCORE_RELIGHT = 40;
export const SCORE_STUN_DRAIN = 15; // total for a shade that was draining (replaces the +5)
export const SCORE_DAWN_LANTERN = 50; // + floor(fuel) per lit lantern on a dawn win
export const round1 = (v: number): number => { const r = Math.round(v * 10) / 10; return r === 0 ? 0 : r; };
