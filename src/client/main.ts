/**
 * 3D client entry. Runs the SAME core `step()` as the headless CLI at a fixed 60 Hz and only
 * reads GameState to draw. Flow: menu -> night intro -> play -> result -> next night -> dawn.
 */
import * as THREE from 'three';
import contractJson from '../../game.contract.json' with { type: 'json' };
import { DT, WIND_PERIOD_TICKS, WIND_WARNING_TICKS } from '../core/constants.js';
import { getMap } from '../core/maps.js';
import { createGame, step } from '../core/sim.js';
import { parseTuning } from '../core/tuning.js';
import type { GameState, TimedEvent } from '../core/types.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { InputController } from './input.js';
import {
  PAL, buildCharm, buildDrifter, buildLantern, buildLeaves, buildMote, buildPlayer, buildPulseRing, buildShade, buildWorld,
  type LanternView, type ShadeView,
} from './models.js';
import { loadSettings, saveSettings } from './settings.js';

const tuning = parseTuning(contractJson);
const $ = (id: string) => document.getElementById(id)!;

const INTRO: Record<number, string[]> = {
  1: ['Ông Đăng: "Mây ơi, sương đen nuốt hết ánh sáng của Đảo Bến rồi."', '"Gom đom đóm, thắp lại năm ngọn Đèn Lồng Lớn trước khi trời sáng nhé."'],
  2: ['Ông Đăng: "Đảo Cau có hai hòn, nối nhau bằng cây cầu tre không lan can."', '"Coi chừng Gió Lạc: nó thích cướp đom đóm. Bục nhảy sẽ đưa con sang đảo bên kia."'],
  3: ['Ông Đăng: "Đảo Chuông cao ba tầng, gió mạnh thổi từng cơn."', '"Leo dốc, dùng bục nhảy lên đỉnh tháp chuông. Đây là đêm cuối rồi, cố lên con!"'],
};

// ---------- renderer / scene ----------
const canvas = $('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.FogExp2(PAL.fog, 0.02);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
const ambient = new THREE.HemisphereLight(0x8a90d0, 0x1b2350, 0.15);
const moon = new THREE.DirectionalLight(0x9aa0e0, 0.25);
moon.position.set(-30, 40, -20);
scene.add(ambient, moon);
const player = buildPlayer();
const pulseRing = buildPulseRing();
const leaves = buildLeaves();
scene.add(player.group, pulseRing, leaves);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- systems ----------
const settings = loadSettings();
const audio = new Audio();
audio.setVolume(settings.volume);
const hud = new Hud(tuning);
type Mode = 'menu' | 'intro' | 'playing' | 'result' | 'dawn';
let mode: Mode = 'menu';
let night: 1 | 2 | 3 = 1;
const wonScores: number[] = [0, 0, 0];
let state: GameState | undefined;
let forcePauseTicks = 0; // menu buttons toggle pause through the same input edge as Esc/P

const settingsOpen = () => !$('settings').classList.contains('hidden');
const input = new InputController(canvas, (code) => {
  audio.unlock();
  if (code === 'Enter' && mode !== 'playing' && !settingsOpen()) ($('ov-primary') as HTMLButtonElement).click();
});

// Leaving the tab while playing pauses the night (same input edge as Esc/P).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing' && state && !state.paused && forcePauseTicks === 0) forcePauseTicks = 2;
});
input.sensitivity = settings.sensitivity;

// ---------- world views ----------
let world: THREE.Group | null = null;
let lanternViews = new Map<string, LanternView>();
const moteViews = new Map<string, THREE.Group>();
const shadeViews = new Map<string, ShadeView>();
const drifterViews = new Map<string, THREE.Group>();
const charmViews = new Map<string, THREE.Group>();
let pulseAnim = -1;

function clearWorld() {
  if (world) scene.remove(world);
  for (const v of lanternViews.values()) scene.remove(v.group);
  for (const m of [moteViews, drifterViews, charmViews]) { for (const o of m.values()) scene.remove(o); m.clear(); }
  for (const s of shadeViews.values()) scene.remove(s.group);
  shadeViews.clear();
  lanternViews = new Map();
}

// ---------- overlay screens ----------
function screen(title: string, sub: string, body: string, primary: string, onPrimary: () => void, secondary?: [string, () => void]) {
  $('ov-title').textContent = title;
  $('ov-sub').textContent = sub;
  $('ov-body').innerHTML = body;
  const p = $('ov-primary') as HTMLButtonElement;
  p.textContent = primary;
  p.onclick = () => { audio.unlock(); onPrimary(); };
  const s = $('ov-secondary') as HTMLButtonElement;
  s.classList.toggle('hidden', !secondary);
  if (secondary) { s.textContent = secondary[0]; s.onclick = secondary[1]; }
  $('overlay').classList.remove('hidden');
  hud.show(false);
}

function showMenu() {
  mode = 'menu';
  state = undefined;
  clearWorld();
  audio.stopMusic();
  $('pause-menu').classList.add('hidden');
  screen('Đảo Đèn Lồng', 'Ba hòn đảo · ba đêm', '<p>Giúp <b>Mây</b> gom đom đóm và thắp lại các <b>Đèn Lồng Lớn</b>. Tránh <b class="ink">Bóng Mực</b> và <b class="drift">Gió Lạc</b>.</p>',
    'Bắt đầu (Enter)', () => { wonScores.fill(0); showIntro(1); }, ['Cài đặt', () => openSettings()]);
}

function showIntro(n: 1 | 2 | 3) {
  mode = 'intro';
  night = n;
  const map = getMap(n, tuning);
  screen(`Đêm ${n} — ${map.name}`, `${map.lanterns.length} Đèn Lồng Lớn`, INTRO[n]!.map((l) => `<p>${l}</p>`).join(''), 'Vào đêm (Enter)', () => startNight());
}

function startNight() {
  clearWorld();
  const map = getMap(night, tuning);
  state = createGame(tuning, Math.floor(Math.random() * 1e9), night); // client: each attempt is a new seed
  world = buildWorld(map);
  scene.add(world);
  for (const l of state.lanterns) {
    const v = buildLantern(tuning.safe_radius);
    v.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
    scene.add(v.group);
    lanternViews.set(l.id, v);
  }
  input.reset();
  input.camYawDeg = 0;
  hud.reset();
  forcePauseTicks = 0;
  accumulator = 0;
  mode = 'playing';
  $('overlay').classList.add('hidden');
  hud.show(true);
  hud.toast(`Đêm ${night} — ${map.name}`);
  audio.startMusic();
}

function showResult(result: 'won' | 'lost', reason: string) {
  const s = state!;
  if (result === 'won') {
    wonScores[night - 1] = s.score; // replays overwrite, never double count
    audio.play('win');
    const total = wonScores.reduce((a, b) => a + b, 0);
    if (night === 3) {
      mode = 'dawn';
      screen('Bình Minh', 'Ba hòn đảo đã sáng trở lại', `<p>Điểm Đêm 3: <b>${s.score}</b></p><p class="big">Tổng điểm: <b>${total}</b></p><p>Ông Đăng: "Cảm ơn con, Mây."</p>`,
        'Về menu (Enter)', () => showMenu());
    } else {
      mode = 'result';
      screen(`Thắng Đêm ${night}!`, getMap(night, tuning).name, `<p>Điểm đêm: <b>${s.score}</b> · Lửa còn: ${s.player.flames}</p><p>Tổng điểm: <b>${total}</b></p>`,
        'Đêm kế tiếp (Enter)', () => showIntro((night + 1) as 2 | 3));
    }
  } else {
    mode = 'result';
    audio.play('lose');
    screen(`Thua Đêm ${night}`, reason === 'dawn' ? 'Bình minh đến trước khi kịp thắp hết đèn' : 'Ngọn lửa của Mây đã tắt',
      `<p>Điểm đêm này không được tính.</p>`, 'Chơi lại Đêm (Enter)', () => startNight(), ['Về menu', () => showMenu()]);
  }
}

// ---------- pause + settings ----------
$('pm-resume').onclick = () => { forcePauseTicks = 2; };
$('pm-restart').onclick = () => { $('pause-menu').classList.add('hidden'); startNight(); };
$('pm-settings').onclick = () => openSettings();
$('pm-menu').onclick = () => showMenu();
const vol = $('set-volume') as HTMLInputElement;
const sens = $('set-sens') as HTMLInputElement;
vol.value = String(settings.volume);
sens.value = String(settings.sensitivity);
vol.oninput = () => audio.setVolume(Number(vol.value)); // live preview; saved on "Lưu"
function openSettings() { $('settings').classList.remove('hidden'); }
$('set-close').onclick = () => {
  settings.volume = Number(vol.value);
  settings.sensitivity = Number(sens.value);
  audio.setVolume(settings.volume);
  input.sensitivity = settings.sensitivity;
  saveSettings(settings);
  $('settings').classList.add('hidden');
};

// ---------- events -> feedback ----------
function onEvents(events: TimedEvent[]) {
  for (const { event } of events) {
    switch (event.name) {
      case 'mote_picked': audio.play('pickup'); break;
      case 'lantern_lit': audio.play('lantern'); hud.toast(`Đèn ${event.data.lantern_id} đã sáng!`); break;
      case 'pulse': audio.play('pulse'); pulseAnim = 0; break;
      case 'player_hit': audio.play('hit'); hud.flashHit(); if (event.data.by === 'fall') hud.toast('Mây rơi xuống biển mây…'); break;
      case 'dash': audio.play('dash'); break;
      case 'shade_spawned': audio.play('shade'); break;
      case 'charm_picked': hud.toast('Bùa Gió! Chạy nhanh, lướt không hồi chiêu'); break;
      case 'drifter_steal': hud.toast(`Gió Lạc cướp ${event.data.amount} đom đóm!`); break;
      case 'paused': $('pause-menu').classList.remove('hidden'); break;
      case 'resumed': $('pause-menu').classList.add('hidden'); break;
      case 'game_over': showResult(event.data.result, event.data.reason); break;
      default: break;
    }
  }
}

// ---------- per-frame sync (read-only view of state) ----------
function syncEntity<T extends THREE.Object3D>(views: Map<string, T>, items: Array<{ id: string }>, make: (item: { id: string }) => T, place: (o: T, item: any) => void) {
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.id);
    let o = views.get(it.id);
    if (!o) { o = make(it); scene.add(o); views.set(it.id, o); }
    place(o, it);
  }
  for (const [id, o] of views) if (!seen.has(id)) { scene.remove(o); views.delete(id); }
}

function sync(s: GameState, time: number) {
  const p = s.player;
  player.group.visible = !p.fallen && (p.invulnTicks === 0 || Math.floor(time * 12) % 2 === 0);
  player.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
  player.group.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  const glow = 0.35 + 0.65 * (p.carried / tuning.carry_capacity);
  player.lanternLight.intensity = 3 + glow * 7;
  player.lanternGlow.emissiveIntensity = 0.8 + glow * 2;

  for (const l of s.lanterns) {
    const v = lanternViews.get(l.id)!;
    v.fill.scale.y = Math.max(0.001, (l.deposited / tuning.lantern_cost) * 0.7);
    v.fill.visible = !l.lit && l.deposited > 0;
    v.body.color.setHex(l.lit ? PAL.lanternLit : PAL.lanternOff);
    v.body.emissive.setHex(l.lit ? PAL.lanternLit : 0x000000);
    v.body.emissiveIntensity = l.lit ? 1.6 : 0;
    v.core.visible = l.lit;
    v.light.intensity = THREE.MathUtils.lerp(v.light.intensity, l.lit ? 40 : 0, 0.05);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = l.lit ? 0.35 : 0;
  }
  syncEntity(moteViews, s.motes, (m) => buildMote((m as GameState['motes'][number]).kind === 'dropped'), (o, m) => {
    const ph = m.pos[0] * 1.3 + m.pos[2];
    o.position.set(m.pos[0], m.pos[1] + 0.8 + Math.sin(time * 2.3 + ph) * 0.2, m.pos[2]);
  });
  syncEntity(drifterViews, s.drifters, () => buildDrifter(), (o, d) => {
    o.position.set(d.pos[0], d.pos[1] + Math.sin(time * 4) * 0.2, d.pos[2]);
    o.rotation.y = time * 2;
  });
  syncEntity(charmViews, s.charms, () => buildCharm(), (o, c) => {
    o.visible = c.available;
    o.position.set(c.pos[0], c.pos[1] + 1 + Math.sin(time * 2) * 0.15, c.pos[2]);
    o.rotation.y = time * 1.5;
  });
  const seenS = new Set<string>();
  for (const sh of s.shades) {
    seenS.add(sh.id);
    let v = shadeViews.get(sh.id);
    if (!v) { v = buildShade(); scene.add(v.group); shadeViews.set(sh.id, v); }
    v.group.position.set(sh.pos[0], sh.pos[1] + Math.sin(time * 3 + sh.pos[0]) * 0.12, sh.pos[2]);
    v.group.lookAt(p.pos[0], v.group.position.y, p.pos[2]);
    const stunned = sh.state === 'stunned';
    v.body.color.setHex(stunned ? PAL.shadeStunned : PAL.shadeBody);
    v.body.opacity = sh.state === 'spawning' ? 0.4 : stunned ? 0.6 : 0.95;
    v.group.scale.setScalar(sh.state === 'spawning' ? 0.6 : stunned ? 0.8 : 1);
  }
  for (const [id, v] of shadeViews) if (!seenS.has(id)) { scene.remove(v.group); shadeViews.delete(id); }

  // Ambient light grows with progress: 0.15 + 0.55 * lit / total (Ticket-02).
  const ratio = s.lanterns.filter((l) => l.lit).length / s.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * ratio;
  (scene.fog as THREE.FogExp2).density = 0.02 - ratio * 0.01;

  if (pulseAnim >= 0) {
    pulseAnim += 1 / 60;
    const k = Math.min(1, pulseAnim / 0.4);
    pulseRing.position.set(p.pos[0], p.pos[1] + 0.1, p.pos[2]);
    pulseRing.scale.setScalar(0.5 + k * tuning.pulse_radius);
    (pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    if (k >= 1) pulseAnim = -1;
  }

  // Wind warning (2 s before each gust) and gust: blowing leaves around Mây.
  const warning = windWarning(s);
  const lm = leaves.material as THREE.PointsMaterial;
  lm.opacity = s.wind.active ? 0.9 : warning ? 0.5 : 0;
  leaves.position.set(p.pos[0], p.pos[1] + 3, p.pos[2]);
  if (s.wind.active && s.wind.dirDeg !== null) leaves.rotation.y = -((s.wind.dirDeg * Math.PI) / 180);
  leaves.rotation.x += warning || s.wind.active ? 0.01 : 0;

  const yaw = (input.camYawDeg * Math.PI) / 180;
  camera.position.lerp(new THREE.Vector3(p.pos[0] - Math.sin(yaw) * 9, p.pos[1] + 5.5, p.pos[2] - Math.cos(yaw) * 9), 0.15);
  camera.lookAt(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
}

/** True during the 2 s before each Night 3 gust (Ticket-02 warning). */
function windWarning(s: GameState): boolean {
  return s.windEnabled && !!getMap(s.night, tuning).wind && s.simTick % WIND_PERIOD_TICKS >= WIND_PERIOD_TICKS - WIND_WARNING_TICKS;
}

// ---------- main loop (fixed timestep) + FPS meter ----------
let accumulator = 0;
let last = performance.now();
const fps = { frames: 0, since: performance.now(), samples: [] as number[] };
function frame(now: number) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (state && mode === 'playing') {
    accumulator += elapsed;
    while (accumulator >= DT && mode === 'playing') {
      const inp = state.paused ? input.idle() : input.read();
      if (settingsOpen()) inp.pause = false; // Esc must not resume the night under the settings box
      if (forcePauseTicks > 0) { inp.pause = forcePauseTicks === 2; forcePauseTicks--; }
      const wasGrounded = state.player.grounded;
      const wasWarning = windWarning(state);
      onEvents(step(state, tuning, inp));
      // Warning cue once per gust, on the simulation tick it starts (not per rendered frame).
      if (!wasWarning && windWarning(state) && state.status === 'playing') { audio.play('wind'); hud.toast('Gió sắp nổi!'); }
      if (wasGrounded && !state.player.grounded && state.player.vel[1] > 6 && !state.player.launch) audio.play('jump');
      accumulator -= DT;
    }
  }
  if (state) {
    sync(state, now / 1000);
    const tick = hud.update(state, camera, wonScores.reduce((a, b, i) => a + (i === night - 1 ? 0 : b), 0));
    if (tick !== null) audio.play('tick');
  } else {
    const a = now / 9000;
    camera.position.set(Math.sin(a) * 55, 26, Math.cos(a) * 55);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
  fps.frames++;
  if (now - fps.since >= 1000) {
    fps.samples.push((fps.frames * 1000) / (now - fps.since));
    if (fps.samples.length > 30) fps.samples.shift();
    const avg = fps.samples.reduce((a, b) => a + b, 0) / fps.samples.length;
    $('fps').textContent = `FPS ${fps.samples.at(-1)!.toFixed(0)} · TB ${avg.toFixed(1)} · ${renderer.domElement.width}×${renderer.domElement.height}`;
    fps.frames = 0;
    fps.since = now;
  }
  requestAnimationFrame(frame);
}
showMenu();
requestAnimationFrame(frame);
