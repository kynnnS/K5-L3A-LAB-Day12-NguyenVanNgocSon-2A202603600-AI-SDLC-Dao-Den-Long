/**
 * 3D client. Runs the SAME core `step()` as the headless CLI at a fixed 60 Hz,
 * and only reads GameState to draw. No game rules live here.
 */
import * as THREE from 'three';
import contractJson from '../../game.contract.json' with { type: 'json' };
import { DT } from '../core/constants.js';
import { createGame, distXZ, step, timeLeft } from '../core/sim.js';
import { parseTuning } from '../core/tuning.js';
import type { GameState, InputState, TimedEvent } from '../core/types.js';
import {
  WARM, buildCloudSea, buildIsland, buildLantern, buildMote, buildPlayer, buildPulseRing, buildShade,
  type LanternView, type ShadeView,
} from './models.js';

const tuning = parseTuning(contractJson);
const $ = (id: string) => document.getElementById(id)!;

// ---------- renderer / scene ----------
const canvas = $('scene') as HTMLCanvasElement;
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

// ---------- input ----------
const keys = new Set<string>();
let camYawDeg = 0;
let dragging = false;
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if ((e.code === 'Enter' || e.code === 'KeyR') && (mode !== 'playing' || e.code === 'KeyR')) startGame();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => { if (dragging) camYawDeg -= e.movementX * 0.3; });

function readInput(): InputState {
  if (keys.has('ArrowLeft')) camYawDeg += 120 * DT;
  if (keys.has('ArrowRight')) camYawDeg -= 120 * DT;
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  // Camera looks along (sin yaw, cos yaw); contract input x maps to -screenRight, so negate strafe.
  return {
    move: [-strafe, fwd],
    camYawDeg,
    jump: keys.has('Space'),
    interact: keys.has('KeyE'),
    pulse: keys.has('KeyF'),
  };
}

// ---------- game state + views ----------
let state: GameState;
let mode: 'title' | 'playing' | 'over' = 'title';
let lanternViews: Map<string, LanternView> = new Map();
const moteViews = new Map<string, THREE.Mesh>();
const shadeViews = new Map<string, ShadeView>();
let pulseAnim = -1;
let accumulator = 0;

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
    v.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
    v.group.rotation.y = Math.atan2(l.pos[0], l.pos[2]) + Math.PI / 2;
    scene.add(v.group);
    lanternViews.set(l.id, v);
  }
  camYawDeg = 0;
  accumulator = 0;
  mode = 'playing';
  $('overlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toast('Đêm 1 – Đảo Bến');
}

let toastTimer = 0;
function toast(text: string) {
  const el = $('hud-toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
}

function onEvents(events: TimedEvent[]) {
  for (const { event } of events) {
    switch (event.name) {
      case 'pulse': pulseAnim = 0; break;
      case 'lantern_lit': toast(`Đèn ${event.data.lantern_id} đã sáng!`); break;
      case 'player_hit': {
        const f = $('flash');
        f.classList.add('on');
        requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
        break;
      }
      case 'shade_spawned': toast('Bóng Mực trồi lên từ sương…'); break;
      case 'game_over': showGameOver(event.data.result, event.data.reason); break;
      default: break;
    }
  }
}

function showGameOver(result: 'won' | 'lost', reason: string) {
  mode = 'over';
  const lit = state.lanterns.filter((l) => l.lit).length;
  $('ov-title').textContent = result === 'won' ? 'Đảo đã sáng trở lại!' : 'Mây đã kiệt sức…';
  $('ov-sub').textContent = result === 'won' ? 'Bạn đã thắp hết Đèn Lồng Lớn' : reason === 'dawn' ? 'Bình minh đến trước khi kịp thắp hết đèn' : 'Ngọn lửa của Mây đã tắt';
  $('ov-body').innerHTML = `<p>Điểm: <b>${state.score}</b> · Đèn: ${lit}/${state.lanterns.length} · Lửa còn: ${state.player.flames}</p>`;
  $('ov-btn').textContent = 'Chơi lại (Enter / R)';
  $('overlay').classList.remove('hidden');
}
$('ov-btn').addEventListener('click', startGame);

// ---------- per-frame sync ----------
function syncEntities(time: number) {
  const p = state.player;
  player.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const inv = state.tick < p.invulnUntil;
  player.group.visible = !inv || Math.floor(time * 12) % 2 === 0;
  const glow = 0.35 + 0.65 * (p.carried / tuning.carry_capacity);
  player.lanternLight.intensity = 3 + glow * 7;
  player.lanternLight.distance = 6 + glow * 6;
  player.lanternGlow.emissiveIntensity = 0.8 + glow * 2;

  for (const l of state.lanterns) {
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
  for (const m of state.motes) {
    seenM.add(m.id);
    let mesh = moteViews.get(m.id);
    if (!mesh) { mesh = buildMote(); scene.add(mesh); moteViews.set(m.id, mesh); }
    const ph = m.pos[0] * 1.3 + m.pos[2];
    mesh.position.set(m.pos[0] + Math.sin(time * 1.7 + ph) * 0.15, 0.9 + Math.sin(time * 2.3 + ph) * 0.25, m.pos[2] + Math.cos(time * 1.3 + ph) * 0.15);
  }
  for (const [id, mesh] of moteViews) if (!seenM.has(id)) { scene.remove(mesh); moteViews.delete(id); }

  const seenS = new Set<string>();
  for (const s of state.shades) {
    seenS.add(s.id);
    let v = shadeViews.get(s.id);
    if (!v) { v = buildShade(); scene.add(v.group); shadeViews.set(s.id, v); }
    const stunned = s.state === 'stunned';
    v.group.position.set(s.pos[0], Math.max(1, s.pos[1]) + Math.sin(time * 3 + s.pos[0]) * 0.12, s.pos[2]);
    v.group.lookAt(p.pos[0], v.group.position.y, p.pos[2]);
    v.mat.emissive.setHex(stunned ? 0x8a6cc4 : 0x3a0f5c);
    v.mat.opacity = stunned ? 0.55 : 0.95;
    v.group.scale.setScalar(stunned ? 0.8 : 1 + Math.sin(time * 5) * 0.04);
  }
  for (const [id, v] of shadeViews) if (!seenS.has(id)) { scene.remove(v.group); shadeViews.delete(id); }

  // Island warms up as lanterns are lit.
  const litRatio = state.lanterns.filter((l) => l.lit).length / state.lanterns.length;
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
  const yaw = (camYawDeg * Math.PI) / 180;
  const target = new THREE.Vector3(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  const want = new THREE.Vector3(p.pos[0] - Math.sin(yaw) * 9, p.pos[1] + 5.5, p.pos[2] - Math.cos(yaw) * 9);
  camera.position.lerp(want, 0.15);
  camera.lookAt(target);
  const input = readInputPreview();
  if (input) player.group.rotation.y = input;
}

let lastFacing = 0;
function readInputPreview(): number | null {
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  if (fwd === 0 && strafe === 0) return lastFacing;
  const th = (camYawDeg * Math.PI) / 180;
  const x = -strafe, z = fwd;
  const wx = x * Math.cos(th) + z * Math.sin(th);
  const wz = -x * Math.sin(th) + z * Math.cos(th);
  lastFacing = Math.atan2(wx, wz);
  return lastFacing;
}

function updateHud() {
  const p = state.player;
  $('hud-flames').innerHTML = Array.from({ length: Math.max(tuning.flames, p.flames) }, (_, i) => `<span class="${i < p.flames ? '' : 'off'}"></span>`).join('');
  $('hud-carried').textContent = `${p.carried} / ${tuning.carry_capacity}`;
  $('hud-lanterns').textContent = `${state.lanterns.filter((l) => l.lit).length} / ${state.lanterns.length}`;
  const t = Math.ceil(timeLeft(state));
  $('hud-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('hud-score').textContent = String(state.score);
  const cd = p.pulseReadyAt - state.tick;
  $('hud-pulse').textContent = cd > 0 ? `${(cd / 60).toFixed(1)}s` : p.carried >= tuning.pulse_cost ? `sẵn sàng (-${tuning.pulse_cost})` : `cần ${tuning.pulse_cost} đom đóm`;

  const near = state.lanterns
    .filter((l) => !l.lit && distXZ(p.pos, l.pos) <= tuning.interact_radius)
    .sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos))[0];
  const prompt = $('hud-prompt');
  if (near) {
    prompt.textContent = p.carried > 0 ? `E: nạp đèn ${near.id} (${near.deposited}/${tuning.lantern_cost})` : `Đèn ${near.id} cần ${tuning.lantern_cost - near.deposited} đom đóm`;
    prompt.classList.add('show');
  } else prompt.classList.remove('show');
}

// ---------- main loop (fixed timestep) ----------
let last = performance.now();
function frame(now: number) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (mode === 'playing') {
    accumulator += elapsed;
    while (accumulator >= DT && mode === 'playing') {
      onEvents(step(state, tuning, readInput()));
      accumulator -= DT;
    }
  }
  if (state) { syncEntities(now / 1000); updateHud(); }
  else {
    const a = now / 9000;
    camera.position.set(Math.sin(a) * 55, 26, Math.cos(a) * 55);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

