/**
 * 3D client entry. Runs the SAME core `step()` as the headless CLI at a fixed 60 Hz
 * and only reads GameState to draw. No game rules live here.
 *   input.ts  keyboard/mouse -> InputState     hud.ts  DOM HUD/overlays     models.ts  meshes
 */
import * as THREE from 'three';
import contractJson from '../../game.contract.json' with { type: 'json' };
import { DT } from '../core/constants.js';
import { createGame, step } from '../core/sim.js';
import { parseTuning } from '../core/tuning.js';
import type { GameState, TimedEvent } from '../core/types.js';
import { Hud } from './hud.js';
import { InputController } from './input.js';
import {
  WARM, buildCloudSea, buildIsland, buildLantern, buildMote, buildPlayer, buildPulseRing, buildShade,
  type LanternView, type ShadeView,
} from './models.js';

const tuning = parseTuning(contractJson);

// ---------- renderer / scene ----------
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x0d0820);
const DAWNISH = new THREE.Color(0x2b1f4a);
scene.background = NIGHT.clone();
scene.fog = new THREE.FogExp2(0x140b2a, 0.028);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
const hemi = new THREE.HemisphereLight(0x6a5ba8, 0x1a1030, 0.5);
const moon = new THREE.DirectionalLight(0x8f86d8, 0.35);
moon.position.set(-30, 40, -20);
scene.add(hemi, moon);

const island = buildIsland();
scene.add(island.group, buildCloudSea());
const player = buildPlayer();
scene.add(player.group);
const pulseRing = buildPulseRing();
scene.add(pulseRing);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- state ----------
let state: GameState | undefined;
let mode: 'title' | 'playing' | 'over' = 'title';
let lanternViews = new Map<string, LanternView>();
const moteViews = new Map<string, THREE.Mesh>();
const shadeViews = new Map<string, ShadeView>();
let pulseAnim = -1;
let accumulator = 0;

const hud = new Hud(tuning, startGame);
const input = new InputController(canvas, (code) => {
  if (code === 'KeyR' || (code === 'Enter' && mode !== 'playing')) startGame();
});

function clearViews() {
  for (const v of lanternViews.values()) scene.remove(v.group);
  for (const m of moteViews.values()) scene.remove(m);
  for (const s of shadeViews.values()) scene.remove(s.group);
  lanternViews = new Map();
  moteViews.clear();
  shadeViews.clear();
}

function startGame() {
  clearViews();
  const seed = Math.floor(Math.random() * 1e9); // client only: each play is a new night
  state = createGame(tuning, seed);
  for (const l of state.lanterns) {
    const v = buildLantern(tuning.safe_radius);
    v.group.rotation.y = Math.atan2(l.pos[0], l.pos[2]) + Math.PI / 2;
    scene.add(v.group);
    lanternViews.set(l.id, v);
  }
  input.reset();
  accumulator = 0;
  mode = 'playing';
  hud.showPlaying();
  hud.toast('Đêm 1 – Đảo Bến');
}

function onEvents(s: GameState, events: TimedEvent[]) {
  for (const { event } of events) {
    if (event.name === 'pulse') pulseAnim = 0;
    else if (event.name === 'lantern_lit') hud.toast(`Đèn ${event.data.lantern_id} đã sáng!`);
    else if (event.name === 'player_hit') hud.flashHit();
    else if (event.name === 'shade_spawned') hud.toast('Bóng Mực trồi lên từ sương…');
    else if (event.name === 'game_over') { mode = 'over'; hud.showGameOver(s, event.data.result, event.data.reason); }
  }
}

// ---------- per-frame sync (read-only view of state) ----------
function syncEntities(s: GameState, time: number) {
  const p = s.player;
  player.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
  player.group.rotation.y = input.facing;
  player.group.visible = s.tick >= p.invulnUntil || Math.floor(time * 12) % 2 === 0;
  const glow = 0.35 + 0.65 * (p.carried / tuning.carry_capacity);
  player.lanternLight.intensity = 3 + glow * 7;
  player.lanternLight.distance = 6 + glow * 6;
  player.lanternGlow.emissiveIntensity = 0.8 + glow * 2;

  for (const l of s.lanterns) {
    const v = lanternViews.get(l.id)!;
    v.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
    v.fill.scale.y = Math.max(0.001, l.deposited / tuning.lantern_cost) * 0.7;
    v.fill.visible = !l.lit && l.deposited > 0;
    v.body.emissive.setHex(l.lit ? WARM : 0x000000);
    v.body.emissiveIntensity = l.lit ? 2 + Math.sin(time * 3 + l.pos[0]) * 0.2 : 0;
    v.light.intensity = THREE.MathUtils.lerp(v.light.intensity, l.lit ? 40 : 0, 0.05);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = l.lit ? 0.35 : 0;
  }

  const seenM = new Set<string>();
  for (const m of s.motes) {
    seenM.add(m.id);
    let mesh = moteViews.get(m.id);
    if (!mesh) { mesh = buildMote(); scene.add(mesh); moteViews.set(m.id, mesh); }
    const ph = m.pos[0] * 1.3 + m.pos[2];
    mesh.position.set(m.pos[0] + Math.sin(time * 1.7 + ph) * 0.15, 0.9 + Math.sin(time * 2.3 + ph) * 0.25, m.pos[2] + Math.cos(time * 1.3 + ph) * 0.15);
  }
  for (const [id, mesh] of moteViews) if (!seenM.has(id)) { scene.remove(mesh); moteViews.delete(id); }

  const seenS = new Set<string>();
  for (const sh of s.shades) {
    seenS.add(sh.id);
    let v = shadeViews.get(sh.id);
    if (!v) { v = buildShade(); scene.add(v.group); shadeViews.set(sh.id, v); }
    const stunned = sh.state === 'stunned';
    v.group.position.set(sh.pos[0], Math.max(1, sh.pos[1]) + Math.sin(time * 3 + sh.pos[0]) * 0.12, sh.pos[2]);
    v.group.lookAt(p.pos[0], v.group.position.y, p.pos[2]);
    v.mat.emissive.setHex(stunned ? 0x8a6cc4 : 0x3a0f5c);
    v.mat.opacity = stunned ? 0.55 : 0.95;
    v.group.scale.setScalar(stunned ? 0.8 : 1 + Math.sin(time * 5) * 0.04);
  }
  for (const [id, v] of shadeViews) if (!seenS.has(id)) { scene.remove(v.group); shadeViews.delete(id); }

  // The island warms up as lanterns are lit.
  const litRatio = s.lanterns.filter((l) => l.lit).length / s.lanterns.length;
  island.grass.color.setHex(0x27324a).lerp(new THREE.Color(0x4f6a3e), litRatio);
  hemi.intensity = 0.5 + litRatio * 0.9;
  (scene.background as THREE.Color).copy(NIGHT).lerp(DAWNISH, litRatio);
  (scene.fog as THREE.FogExp2).density = 0.028 - litRatio * 0.014;

  if (pulseAnim >= 0) {
    pulseAnim += 1 / 60;
    const k = Math.min(1, pulseAnim / 0.4);
    pulseRing.position.set(p.pos[0], 0.1, p.pos[2]);
    pulseRing.scale.setScalar(0.5 + k * tuning.pulse_radius);
    (pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    if (k >= 1) pulseAnim = -1;
  }

  // Third-person camera behind Mây along the camera yaw.
  const yaw = (input.camYawDeg * Math.PI) / 180;
  camera.position.lerp(new THREE.Vector3(p.pos[0] - Math.sin(yaw) * 9, p.pos[1] + 5.5, p.pos[2] - Math.cos(yaw) * 9), 0.15);
  camera.lookAt(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
}

// ---------- main loop (fixed timestep) ----------
let last = performance.now();
function frame(now: number) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (state && mode === 'playing') {
    accumulator += elapsed;
    while (accumulator >= DT && mode === 'playing') {
      onEvents(state, step(state, tuning, input.read()));
      accumulator -= DT;
    }
  }
  if (state) {
    syncEntities(state, now / 1000);
    hud.update(state);
  } else {
    const a = now / 9000; // title screen: slow orbit
    camera.position.set(Math.sin(a) * 55, 26, Math.cos(a) * 55);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
