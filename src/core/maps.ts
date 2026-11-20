/**
 * Standard maps (Ticket-02 Part 2). Single source for simulation (ground, collision, spawns)
 * AND rendering. Angles: measured from +X towards +Z (x = r cos a, z = r sin a).
 */
import type { Tuning, Vec3 } from './types.js';

export interface Disk { cx: number; cz: number; r: number }
export interface Pad { x: number; y: number; z: number; r: number; vy: number; vh: number; dir: [number, number] }
export interface Ramp { angleDeg: number; width: number; r0: number; r1: number; h1: number } // y = 0 at r0, h1 at r1
export interface Tower { x: number; z: number; r: number; y0: number; height: number }

export interface NightMap {
  night: 1 | 2 | 3;
  name: string;
  islands: Disk[];
  bridge: { x0: number; x1: number; z0: number; z1: number } | null;
  tiers: boolean; // night 3 terrain
  ramps: Ramp[];
  pads: Pad[];
  tower: Tower | null;
  lanterns: Array<{ id: string; pos: Vec3 }>;
  motePoints: Vec3[];
  shadePoints: Vec3[];
  charms: Array<{ id: string; pos: Vec3 }>;
  shadeSpeed: number;
  shadeIntervalTicks: number;
  shadeMax: number;
  drifters: boolean;
  wind: boolean;
  start: Vec3;
}

const rad = (d: number) => (d * Math.PI) / 180;
const ring = (r: number, angles: number[], y = 0, cx = 0, cz = 0): Vec3[] =>
  angles.map((a) => [cx + r * Math.cos(rad(a)), y, cz + r * Math.sin(rad(a))]);
const every = (step: number, from = 0, count = Math.round(360 / step)) => Array.from({ length: count }, (_, i) => from + i * step);
const lanterns = (list: Vec3[]) => list.map((pos, i) => ({ id: `L${i + 1}`, pos }));

function unit(dx: number, dz: number): [number, number] {
  const d = Math.hypot(dx, dz);
  return [dx / d, dz / d];
}

const NIGHT1: Omit<NightMap, 'shadeSpeed'> = {
  night: 1,
  name: 'Đảo Bến',
  islands: [{ cx: 0, cz: 0, r: 40 }],
  bridge: null,
  tiers: false,
  ramps: [],
  pads: [],
  tower: null,
  lanterns: lanterns([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
  motePoints: [...ring(12, every(45)), ...ring(33, every(22.5))],
  shadePoints: ring(37, every(30, 15)),
  charms: [],
  shadeIntervalTicks: 480,
  shadeMax: 6,
  drifters: false,
  wind: false,
  start: [0, 0, 0],
};

const NIGHT2: Omit<NightMap, 'shadeSpeed'> = {
  night: 2,
  name: 'Đảo Cau',
  islands: [{ cx: 0, cz: 0, r: 28 }, { cx: 70, cz: 0, r: 28 }],
  bridge: { x0: 26, x1: 44, z0: -2, z1: 2 },
  tiers: false,
  ramps: [],
  pads: [
    { x: 20, y: 0, z: 18, r: 1, vy: 14, vh: 24, dir: unit(70 - 20, 0 - 18) },
    { x: 50, y: 0, z: -18, r: 1, vy: 14, vh: 24, dir: unit(0 - 50, 0 + 18) },
  ],
  tower: null,
  lanterns: lanterns([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
  motePoints: [
    ...ring(10, [0, 90, 180, 270]), ...ring(22, every(45)),
    ...ring(10, [0, 90, 180, 270], 0, 70), ...ring(22, every(45), 0, 70),
  ],
  shadePoints: [...ring(26, every(45, 22.5)), ...ring(26, every(45, 22.5), 0, 70)],
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  shadeIntervalTicks: 420,
  shadeMax: 8,
  drifters: true,
  wind: false,
  start: [0, 0, 0],
};

const NIGHT3: Omit<NightMap, 'shadeSpeed'> = {
  night: 3,
  name: 'Đảo Chuông',
  islands: [{ cx: 0, cz: 0, r: 45 }],
  bridge: null,
  tiers: true,
  ramps: [
    { angleDeg: 30, width: 3, r0: 30, r1: 24, h1: 3 },
    { angleDeg: 150, width: 3, r0: 30, r1: 24, h1: 3 },
  ],
  pads: [{ x: 0, y: 3, z: 13, r: 1, vy: 12, vh: 8, dir: [0, -1] }],
  tower: { x: 0, z: 0, r: 2, y0: 6, height: 8 },
  lanterns: lanterns([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
  motePoints: [...ring(34, every(20)), ...ring(18, every(20, 20, 8), 3), ...ring(5, [45, 135, 225, 315], 6)],
  shadePoints: ring(43, every(22.5)),
  charms: [{ id: 'C1', pos: [30, 0, 25] }, { id: 'C2', pos: [-30, 0, 25] }],
  shadeIntervalTicks: 360,
  shadeMax: 10,
  drifters: true,
  wind: true,
  start: [0, 0, -30], // assumption B12: (0,0,0) is inside the bell tower; Ticket-02 only fixes Night 1's start
};

export function getMap(night: number, tuning: Tuning): NightMap {
  if (night === 1) return { ...NIGHT1, shadeSpeed: tuning.shade_speed };
  if (night === 2) return { ...NIGHT2, shadeSpeed: tuning.shade_speed };
  if (night === 3) return { ...NIGHT3, shadeSpeed: 4.5 };
  throw new Error(`unknown night ${night}`);
}

export function nightDuration(night: number, t: Tuning): number {
  return night === 1 ? t.night1_duration_s : night === 2 ? t.night2_duration_s : t.night3_duration_s;
}

/** Ground height at (x, z), or null over the cloud sea (no ground: falls). */
export function groundHeight(map: NightMap, x: number, z: number): number | null {
  let h: number | null = null;
  for (const d of map.islands) if (Math.hypot(x - d.cx, z - d.cz) <= d.r) h = 0;
  const b = map.bridge;
  if (b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) h = 0;
  if (h === null || !map.tiers) return h;
  const r = Math.hypot(x, z);
  if (r <= 8) return 6; // tier 2 disk
  if (r >= 12 && r <= 24 && z > 0) h = 3; // tier 1 half annulus
  for (const ramp of map.ramps) {
    const ux = Math.cos(rad(ramp.angleDeg));
    const uz = Math.sin(rad(ramp.angleDeg));
    const along = x * ux + z * uz;
    const perp = Math.abs(-x * uz + z * ux);
    if (perp <= ramp.width / 2 && along >= ramp.r1 && along <= ramp.r0) {
      h = Math.max(h, (ramp.h1 * (ramp.r0 - along)) / (ramp.r0 - ramp.r1));
    }
  }
  return h;
}

/** True if a body at height y cannot occupy (x, z) because of the bell tower. */
export function blockedByTower(map: NightMap, x: number, z: number, y: number): boolean {
  const t = map.tower;
  return !!t && Math.hypot(x - t.x, z - t.z) < t.r && y < t.y0 + t.height;
}
