/** Low-poly model builders (visual only; no game rules here). */
import * as THREE from 'three';
import { ISLAND_RADIUS } from '../core/constants.js';

const flat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

export const WARM = 0xffa64d;

export function buildIsland(): { group: THREE.Group; grass: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const grass = flat(0x27324a);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 3, 3, 40, 1), grass);
  top.position.y = -1.5;
  group.add(top);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(ISLAND_RADIUS - 3, 18, 40, 1), flat(0x2a2238));
  rock.rotation.x = Math.PI;
  rock.position.y = -12;
  group.add(rock);

  // Deterministic decoration (trees + stones), purely visual.
  let s = 1234;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const treeMat = flat(0x1f3b3a);
  const trunkMat = flat(0x3b2a22);
  const stoneMat = flat(0x3d3a52);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 8 + rnd() * (ISLAND_RADIUS - 10);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (Math.abs(r - 22) < 4) continue; // keep lantern ring clear
    if (rnd() < 0.6) {
      const h = 2 + rnd() * 2.5;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, h * 0.4, 5), trunkMat);
      trunk.position.y = h * 0.2;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9 + rnd() * 0.5, h, 6), treeMat);
      crown.position.y = h * 0.4 + h * 0.5;
      tree.add(trunk, crown);
      tree.position.set(x, 0, z);
      group.add(tree);
    } else {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rnd() * 0.6, 0), stoneMat);
      st.position.set(x, 0.2, z);
      st.rotation.set(rnd() * 3, rnd() * 3, 0);
      group.add(st);
    }
  }
  return { group, grass };
}

export function buildCloudSea(): THREE.Group {
  const group = new THREE.Group();
  // Walkable cloud floor just below the island top (core has no world boundary, assumption A8).
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: 0x2f2558, roughness: 1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.15;
  group.add(sea);
  const puffMat = flat(0x3a2f66, { transparent: true, opacity: 0.85 });
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2;
    const r = ISLAND_RADIUS + 8 + rnd() * 90;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rnd() * 6, 0), puffMat);
    puff.position.set(Math.sin(a) * r, -1.2 + rnd() * 0.8, Math.cos(a) * r);
    puff.scale.y = 0.45;
    group.add(puff);
  }
  return group;
}

export interface LanternView {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
}

export function buildLantern(safeRadius: number): LanternView {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6), flat(0x4a3324));
  post.position.y = 1.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), flat(0x4a3324));
  arm.position.set(0.5, 3.1, 0);
  const body = new THREE.MeshStandardMaterial({ color: 0x7a2a1e, emissive: 0x000000, flatShading: true });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 8), body);
  shell.position.set(1, 2.55, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 8), flat(0x2c1a12));
  cap.position.set(1, 3.15, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 8), flat(0x3d3a52));
  base.position.y = 0.15;
  const light = new THREE.PointLight(WARM, 0, 16, 1.6);
  light.position.set(1, 2.6, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(safeRadius - 0.12, safeRadius, 48),
    new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  // Progress pillar: grows as light is deposited.
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  fill.position.set(1, 2.2, 0);
  fill.scale.y = 0.001;
  group.add(post, arm, shell, cap, base, light, ring, fill);
  return { group, body, light, ring, fill };
}

export interface PlayerView {
  group: THREE.Group;
  lanternLight: THREE.PointLight;
  lanternGlow: THREE.MeshStandardMaterial;
}

/** Mây: small keeper wearing a nón lá with a little lantern hanging from the brim. */
export function buildPlayer(): PlayerView {
  const group = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 8), flat(0x3f6fb5));
  robe.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), flat(0xf1c9a5));
  head.position.y = 1.28;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.32, 14), flat(0xe8cf8a));
  hat.position.y = 1.56;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4), flat(0x3b2a22));
  stick.position.set(0.5, 1.2, 0.25);
  const lanternGlow = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: WARM, emissiveIntensity: 1.5, flatShading: true });
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), lanternGlow);
  lantern.position.set(0.5, 0.95, 0.25);
  const lanternLight = new THREE.PointLight(WARM, 6, 9, 1.8);
  lanternLight.position.copy(lantern.position);
  group.add(robe, head, hat, stick, lantern, lanternLight);
  return { group, lanternLight, lanternGlow };
}

export function buildMote(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0xfff2a8, emissive: 0xffe066, emissiveIntensity: 2.2 }),
  );
}

export interface ShadeView {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
}

export function buildShade(): ShadeView {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a0a26, emissive: 0x3a0f5c, emissiveIntensity: 0.6, flatShading: true, transparent: true, opacity: 0.95 });
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), mat);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd9b8ff });
  for (const x of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), eyeMat);
    eye.position.set(x, 0.15, 0.65);
    group.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 7), mat);
  tail.position.y = -0.75;
  tail.rotation.x = Math.PI;
  group.add(blob, tail);
  return { group, mat };
}

export function buildPulseRing(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  return ring;
}
