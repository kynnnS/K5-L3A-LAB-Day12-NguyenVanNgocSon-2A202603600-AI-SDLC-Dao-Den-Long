/** Low-poly model builders. World geometry is generated from the SAME NightMap the simulation uses. */
import * as THREE from 'three';
import type { NightMap } from '../core/maps.js';

/** Ticket-02 standard palette. */
export const PAL = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, cloudSea: 0x12384a,
  lanternLit: 0xffb347, lanternCore: 0xffe9b0, lanternOff: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shadeBody: 0x120a1a, shadeRim: 0x7a3cff, shadeStunned: 0x3a3450, robe: 0xe8e2d0, scarf: 0xc8102e,
  gold: 0xf2c14e, drifter: 0x8fa3b8,
  /** Ticket-03 colour-blind palette: shade rim + eyes. */
  shadeRimCb: 0x00b3ff,
};

const flat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

function disk(r: number, h: number, mat: THREE.Material, x: number, yTop: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat);
  m.position.set(x, yTop - h / 2, z);
  return m;
}

export function buildWorld(map: NightMap): THREE.Group {
  const g = new THREE.Group();
  const grass = flat(PAL.grass);
  const sand = flat(PAL.sand);
  for (const d of map.islands) {
    g.add(disk(d.r, 0.6, grass, d.cx, 0, d.cz));
    g.add(disk(d.r + 0.6, 0.5, sand, d.cx, -0.35, d.cz));
    const rock = new THREE.Mesh(new THREE.ConeGeometry(d.r, d.r * 0.5, 32), flat(0x2a2f45));
    rock.rotation.x = Math.PI;
    rock.position.set(d.cx, -0.6 - d.r * 0.25, d.cz);
    g.add(rock);
  }
  if (map.bridge) {
    const b = map.bridge;
    const wood = flat(PAL.wood);
    for (let x = b.x0; x < b.x1; x += 0.6) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, b.z1 - b.z0), wood);
      plank.position.set(x + 0.25, -0.075, (b.z0 + b.z1) / 2);
      g.add(plank);
    }
  }
  if (map.tiers) {
    const tierMat = flat(0x3a6b5c);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    const tier1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 32 }), tierMat);
    tier1.rotation.x = Math.PI / 2; // shape XY -> XZ (y of shape becomes +Z), extrude goes down
    tier1.position.y = 3;
    g.add(tier1);
    g.add(disk(8, 6, flat(0x447a69), 0, 6, 0));
    for (const ramp of map.ramps) {
      const len = Math.hypot(ramp.r0 - ramp.r1, ramp.h1);
      const box = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, ramp.width), flat(PAL.wood));
      const a = (ramp.angleDeg * Math.PI) / 180;
      const mid = (ramp.r0 + ramp.r1) / 2;
      box.position.set(Math.cos(a) * mid, ramp.h1 / 2 - 0.15, Math.sin(a) * mid);
      box.rotation.y = -a;
      box.rotation.z = -Math.atan2(ramp.h1, ramp.r0 - ramp.r1); // high end towards the centre (local -X)
      g.add(box);
    }
  }
  if (map.tower) {
    const t = map.tower;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r * 1.1, t.height, 12), flat(0x4a3a5a));
    tower.position.set(t.x, t.y0 + t.height / 2, t.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(t.r * 1.5, 2.5, 12), flat(PAL.wood));
    roof.position.set(t.x, t.y0 + t.height + 1.25, t.z);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), flat(PAL.gold, { metalness: 0.6, roughness: 0.4 }));
    bell.position.set(t.x, t.y0 + t.height - 0.5, t.z);
    g.add(tower, roof, bell);
  }
  for (const p of map.pads) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.12, 24), new THREE.MeshStandardMaterial({ color: PAL.gold, emissive: PAL.gold, emissiveIntensity: 0.8 }));
    pad.position.set(p.x, p.y + 0.06, p.z);
    g.add(pad);
  }
  const sea = new THREE.Mesh(new THREE.CircleGeometry(500, 48), new THREE.MeshStandardMaterial({ color: PAL.cloudSea, roughness: 1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -8;
  g.add(sea);
  return g;
}

export interface LanternView {
  group: THREE.Group; body: THREE.MeshStandardMaterial; core: THREE.Mesh; light: THREE.PointLight; ring: THREE.Mesh; fill: THREE.Mesh;
  /** Paper shell (squashed 20% when unlit), tear marks (unlit only), fuel bar (lit only). */
  shell: THREE.Mesh; tear: THREE.Group; fuelBar: THREE.Group; fuelFill: THREE.Mesh;
}

export function buildLantern(safeRadius: number): LanternView {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6), flat(PAL.wood));
  post.position.y = 1.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), flat(PAL.wood));
  arm.position.set(0.5, 3.1, 0);
  const body = new THREE.MeshStandardMaterial({ color: PAL.lanternOff, emissive: 0x000000, flatShading: true });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 8), body);
  shell.position.set(1, 2.55, 0);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.lanternCore }));
  core.position.copy(shell.position);
  core.visible = false;
  // Torn paper: dark jagged slashes on the shell, visible only when the lantern is out (shape cue, not colour).
  const tear = new THREE.Group();
  const tearMat = new THREE.MeshBasicMaterial({ color: 0x0b0d18, side: THREE.DoubleSide });
  for (const [a, y, rz] of [[0.3, 2.65, 0.5], [2.2, 2.45, -0.7], [4.1, 2.6, 0.9]] as const) {
    const slash = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.5), tearMat);
    slash.position.set(1 + Math.cos(a) * 0.46, y, Math.sin(a) * 0.46);
    slash.rotation.set(0, -a + Math.PI / 2, rz);
    tear.add(slash);
  }
  const light = new THREE.PointLight(PAL.lanternLit, 0, 16, 1.6);
  light.position.set(1, 2.6, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(safeRadius - 0.12, safeRadius, 48),
    new THREE.MeshBasicMaterial({ color: PAL.lanternLit, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), new THREE.MeshBasicMaterial({ color: PAL.lanternCore }));
  fill.position.set(1, 2.2, 0);
  fill.scale.y = 0.001;
  // Fuel bar above the lantern (billboarded in main.ts): dark back + gold fill scaled by fuel / max.
  const fuelBar = new THREE.Group();
  fuelBar.position.set(1, 3.55, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.18), new THREE.MeshBasicMaterial({ color: 0x0b0d18, transparent: true, opacity: 0.8 }));
  const fuelFill = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.1), new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true }));
  fuelFill.position.z = 0.01;
  fuelBar.add(back, fuelFill);
  group.add(post, arm, shell, core, tear, light, ring, fill, fuelBar);
  return { group, body, core, light, ring, fill, shell, tear, fuelBar, fuelFill };
}

export interface PlayerView { group: THREE.Group; lanternLight: THREE.PointLight; lanternGlow: THREE.MeshStandardMaterial }

/** Mây: robe, red scarf, nón lá with a little lantern hanging from the brim. */
export function buildPlayer(): PlayerView {
  const group = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 8), flat(PAL.robe));
  robe.position.y = 0.55;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 6, 12), flat(PAL.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), flat(0xf1c9a5));
  head.position.y = 1.28;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.32, 14), flat(PAL.sand));
  hat.position.y = 1.56;
  const lanternGlow = new THREE.MeshStandardMaterial({ color: PAL.lanternLit, emissive: PAL.lanternLit, emissiveIntensity: 1.5, flatShading: true });
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), lanternGlow);
  lantern.position.set(0.5, 0.95, 0.25);
  const lanternLight = new THREE.PointLight(PAL.lanternLit, 6, 9, 1.8);
  lanternLight.position.copy(lantern.position);
  group.add(robe, scarf, head, hat, lantern, lanternLight);
  return { group, lanternLight, lanternGlow };
}

export function buildMote(dropped: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: PAL.moteCore })));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.moteHalo, transparent: true, opacity: dropped ? 0.25 : 0.4 }));
  g.add(halo);
  return g;
}

export interface ShadeView { group: THREE.Group; body: THREE.MeshStandardMaterial; rimMat: THREE.MeshBasicMaterial; eyeMat: THREE.MeshBasicMaterial }

export function buildShade(): ShadeView {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: PAL.shadeBody, emissive: PAL.shadeRim, emissiveIntensity: 0.35, flatShading: true, transparent: true, opacity: 0.95 });
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), body);
  const rimMat = new THREE.MeshBasicMaterial({ color: PAL.shadeRim, wireframe: true, transparent: true, opacity: 0.5 });
  const rim = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 1), rimMat);
  const eyeMat = new THREE.MeshBasicMaterial({ color: PAL.shadeRim }); // rim + eyes: #7A3CFF, or #00B3FF (colour-blind)
  for (const x of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), eyeMat);
    eye.position.set(x, 0.15, 0.65);
    group.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 7), body);
  tail.position.y = -0.75;
  tail.rotation.x = Math.PI;
  group.add(blob, rim, tail);
  return { group, body, rimMat, eyeMat };
}

export function buildDrifter(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PAL.drifter, emissive: PAL.drifter, emissiveIntensity: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25, 6, 1), mat);
    strip.position.y = i * 0.25;
    strip.rotation.y = i * 0.6;
    g.add(strip);
  }
  return g;
}

export function buildCharm(): THREE.Group {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: PAL.scarf, emissive: PAL.scarf, emissiveIntensity: 0.4 }));
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.88, 0.02), new THREE.MeshBasicMaterial({ color: PAL.gold }));
  border.position.z = -0.02;
  g.add(border, paper);
  return g;
}

export function buildPulseRing(): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48),
    new THREE.MeshBasicMaterial({ color: PAL.lanternCore, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

/** Leaves blown around as the 2 s wind warning. */
export function buildLeaves(): THREE.Points {
  const n = 120;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 30;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9ccf6a, size: 0.25, transparent: true, opacity: 0 }));
}
