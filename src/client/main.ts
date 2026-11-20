/**
 * 3D client entry. Runs the SAME core `step()` as the headless CLI at a fixed 60 Hz and only
 * reads GameState to draw. Flow: menu -> night intro -> play -> result -> next night -> dawn.
 */
import * as THREE from 'three';
import contractJson from '../../game.contract.json' with { type: 'json' };
import { DT, FUEL_UNITS, WIND_PERIOD_TICKS, WIND_WARNING_TICKS } from '../core/constants.js';
import { createBenchGame } from '../core/bench.js';
import { getMap, nightDuration } from '../core/maps.js';
import { capacity, createGame, requiredLit, step } from '../core/sim.js';
import { parseTuning } from '../core/tuning.js';
import type { GameState, TimedEvent } from '../core/types.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { InputController } from './input.js';
import {
  PAL, buildCharm, buildDrifter, buildLantern, buildLeaves, buildMote, buildPlayer, buildPulseRing, buildShade, buildWorld,
  type LanternView, type ShadeView,
} from './models.js';
import { ACTIONS, ACTION_LABELS, DEFAULT_KEYMAP, keyConflicts, keyLabel, type KeyMap } from '../shared/keymap.js';
import { isValidName, isoWithOffset, normalizeName, type LeaderboardEntry } from '../shared/leaderboard.js';
import { loadLeaderboard, saveScore } from './leaderboard.js';
import { loadSettings, saveSettings } from './settings.js';

const tuning = parseTuning(contractJson);
// Ticket-04 bench mode: ?bench=1&seed=42&duration=30 (opened by build/headless/bench.js).
const params = new URLSearchParams(location.search);
const BENCH = params.get('bench') === '1';
const BENCH_SEED = Number(params.get('seed') ?? 42);
const BENCH_DURATION_MS = Number(params.get('duration') ?? 30) * 1000;
const BENCH_WARMUP_MS = 3000;
const $ = (id: string) => document.getElementById(id)!;

const INTRO: Record<number, string[]> = {
  1: ['Ông Đăng: "Mây ơi, sương đen nuốt hết ánh sáng của Đảo Bến rồi."', '"Gom đom đóm thắp Đèn Lồng Lớn. Đèn cạn dầu dần, nhớ châm thêm, kẻo Bóng Mực tới hút."'],
  2: ['Ông Đăng: "Đảo Cau có hai hòn, nối nhau bằng cây cầu tre không lan can."', '"Coi chừng Gió Lạc: nó thích cướp đom đóm. Bục nhảy sẽ đưa con sang đảo bên kia."'],
  3: ['Ông Đăng: "Đảo Chuông cao ba tầng, gió mạnh thổi từng cơn."', '"Leo dốc, dùng bục nhảy lên đỉnh tháp chuông. Đây là đêm cuối rồi, cố lên con!"'],
};

// ---------- renderer / scene ----------
const canvas = $('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(BENCH ? 1 : Math.min(window.devicePixelRatio, 2)); // bench renders exactly 1280x720
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
  const w = BENCH ? 1280 : window.innerWidth;
  const h = BENCH ? 720 : window.innerHeight;
  renderer.setSize(w, h, BENCH); // bench: fixed 1280x720 canvas (CSS size too)
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- systems ----------
const settings = loadSettings();
const audio = new Audio();
audio.setVolume(settings.volume);
const hud = new Hud(tuning);
type Mode = 'menu' | 'intro' | 'playing' | 'result' | 'dawn' | 'bench';
let mode: Mode = 'menu';
let night: 1 | 2 | 3 = 1;
const wonScores: number[] = [0, 0, 0];
const wonFlags: boolean[] = [false, false, false];
let nightSeed = 0;
let shakeUntil = 0;
let state: GameState | undefined;
let forcePauseTicks = 0; // menu buttons toggle pause through the same input edge as Esc/P

const settingsOpen = () => !$('settings').classList.contains('hidden');
const input = new InputController(canvas, (code) => {
  audio.unlock();
  const typing = (document.activeElement as HTMLElement | null)?.tagName === 'INPUT';
  if (code === 'Enter' && mode !== 'playing' && !settingsOpen() && !typing) ($('ov-primary') as HTMLButtonElement).click();
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
function screen(title: string, sub: string, body: string, primary: string, onPrimary: () => void, ...extra: Array<[string, () => void]>) {
  $('ov-title').textContent = title;
  $('ov-sub').textContent = sub;
  $('ov-body').innerHTML = body;
  const p = $('ov-primary') as HTMLButtonElement;
  p.textContent = primary;
  p.onclick = () => { audio.unlock(); onPrimary(); };
  const box = $('ov-buttons');
  for (const b of [...box.querySelectorAll('button.extra')]) b.remove();
  for (const [label, fn] of extra) {
    const b = document.createElement('button');
    b.className = 'ghost extra';
    b.textContent = label;
    b.onclick = fn;
    box.appendChild(b);
  }
  $('overlay').classList.remove('hidden');
  hud.show(false);
}

// ---------- leaderboard (Ticket-04 §3) ----------
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function leaderboardTable(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) return '<p>Chưa có điểm nào.</p>';
  return '<table class="lb"><tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Thời điểm</th></tr>'
    + entries.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.score}</td><td>${e.nights_won}</td><td>${esc(e.achieved_at.replace('T', ' ').slice(0, 16))}</td></tr>`).join('') + '</table>';
}
async function showLeaderboard(back: () => void = () => showMenu()) {
  const entries = await loadLeaderboard();
  screen('Bảng xếp hạng', 'Top 10 · tổng điểm các Đêm đã thắng', leaderboardTable(entries), 'Quay lại (Enter)', back);
}
/** Name form after the Dawn screen or a lost night. */
function scoreForm(): string {
  const total = wonScores.reduce((a, b) => a + b, 0);
  return `<form id="lb-form"><p>Lưu điểm <b>${total}</b> (${wonFlags.filter(Boolean).length} Đêm thắng) vào bảng xếp hạng:</p>`
    + '<p><input id="lb-name" type="text" maxlength="12" placeholder="Tên (3–12 ký tự)" autocomplete="off" aria-label="Tên" /> <button type="submit">Lưu điểm</button></p>'
    + '<p class="small">Chữ, số, dấu gạch dưới; có thể dùng tiếng Việt có dấu.</p><p id="lb-msg" class="warn" role="alert"></p></form>';
}
function wireScoreForm() {
  const form = document.getElementById('lb-form') as HTMLFormElement | null;
  if (!form) return;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const name = normalizeName(($('lb-name') as HTMLInputElement).value);
    if (!isValidName(name)) { $('lb-msg').textContent = '⚠ Tên phải có 3–12 ký tự: chữ, số hoặc _.'; return; }
    const entry: LeaderboardEntry = { name, score: wonScores.reduce((a, b) => a + b, 0), nights_won: wonFlags.filter(Boolean).length, achieved_at: isoWithOffset(new Date()), seed: nightSeed };
    await saveScore(entry);
    void showLeaderboard();
  };
}

function showMenu() {
  mode = 'menu';
  state = undefined;
  clearWorld();
  audio.stopMusic();
  $('pause-menu').classList.add('hidden');
  screen('Đảo Đèn Lồng', 'Ba hòn đảo · ba đêm', '<p>Giúp <b>Mây</b> gom đom đóm và thắp lại các <b>Đèn Lồng Lớn</b>. Tránh <b class="ink">Bóng Mực</b> và <b class="drift">Gió Lạc</b>.</p>',
    'Bắt đầu (Enter)', () => { wonScores.fill(0); wonFlags.fill(false); showIntro(1); }, ['Bảng xếp hạng', () => void showLeaderboard()], ['Cài đặt', () => openSettings()]);
}

function showIntro(n: 1 | 2 | 3) {
  mode = 'intro';
  night = n;
  const map = getMap(n, tuning);
  const need = Math.ceil(tuning.win_ratio * map.lanterns.length - 1e-9);
  const goal = `<p class="big">Mục tiêu: giữ ít nhất <b>${need}/${map.lanterns.length}</b> đèn sáng tới bình minh (${nightDuration(n, tuning)} giây).</p>`
    + '<p>Đèn hao 1 dầu/giây. E ở đèn đang sáng để châm dầu; đèn tắt thì thắp lại chỉ cần 5 đom đóm. Mỗi lần thắp thành công túi đựng thêm 2 (tối đa 20).</p>';
  screen(`Đêm ${n} — ${map.name}`, `${map.lanterns.length} Đèn Lồng Lớn`, INTRO[n]!.map((l) => `<p>${l}</p>`).join('') + goal, 'Vào đêm (Enter)', () => startNight());
}

function startNight() {
  clearWorld();
  const map = getMap(night, tuning);
  nightSeed = Math.floor(Math.random() * 1e9); // client: each attempt is a new seed
  state = createGame(tuning, nightSeed, night);
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
    wonFlags[night - 1] = true;
    audio.play('win');
    const total = wonScores.reduce((a, b) => a + b, 0);
    if (night === 3) {
      mode = 'dawn';
      screen('Bình Minh', 'Ba hòn đảo đã sáng trở lại', `<p>Điểm Đêm 3: <b>${s.score}</b></p><p class="big">Tổng điểm: <b>${total}</b></p><p>Ông Đăng: "Cảm ơn con, Mây."</p>` + scoreForm(),
        'Về menu', () => showMenu(), ['Bảng xếp hạng', () => void showLeaderboard()]);
      wireScoreForm();
    } else {
      mode = 'result';
      screen(`Thắng Đêm ${night}!`, `${getMap(night, tuning).name} · ${s.lanterns.filter((l) => l.lit).length}/${s.lanterns.length} đèn sáng lúc bình minh`, `<p>Điểm đêm: <b>${s.score}</b> · Lửa còn: ${s.player.flames}</p><p>Tổng điểm: <b>${total}</b></p>`,
        'Đêm kế tiếp (Enter)', () => showIntro((night + 1) as 2 | 3));
    }
  } else {
    mode = 'result';
    audio.play('lose');
    const litNow = s.lanterns.filter((l) => l.lit).length;
    screen(`Thua Đêm ${night}`, reason === 'dawn' ? `Bình minh đến nhưng chỉ ${litNow}/${s.lanterns.length} đèn sáng (cần ${requiredLit(s, tuning)})` : 'Ngọn lửa của Mây đã tắt',
      `<p>Điểm đêm này không được tính.</p>` + scoreForm(), 'Chơi lại Đêm', () => startNight(), ['Về menu', () => showMenu()]);
    wireScoreForm();
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
const cb = $('set-cb') as HTMLInputElement;
cb.checked = settings.colorblind;
const rm = $('set-rm') as HTMLInputElement;
const lt = $('set-lt') as HTMLInputElement;
/** View-only settings (colour-blind palette, reduced motion, large text): never touch GameState / headless output. */
function applyPalette() {
  document.body.classList.toggle('cb', settings.colorblind);
  document.body.classList.toggle('rm', settings.reducedMotion);
  document.documentElement.classList.toggle('large', settings.largeText);
  hud.colorblind = settings.colorblind;
  hud.reducedMotion = settings.reducedMotion;
  input.keymap = { ...settings.keymap };
  const k = settings.keymap;
  $('hud-hint').textContent = `${[k.up, k.left, k.down, k.right].map(keyLabel).join('')} di chuyển · Kéo chuột / ← → xoay camera · ${keyLabel(k.jump)} nhảy · ${keyLabel(k.dash)} lướt · ${keyLabel(k.interact)} nạp/châm đèn · ${keyLabel(k.pulse)} tỏa sáng · Esc/${keyLabel(k.pause)} tạm dừng`;
}
// Key remapping (Ticket-04 §4): click a key, press the new one; duplicates are flagged and block saving.
let draftKeys: KeyMap = { ...settings.keymap };
let waiting: string | null = null;
function renderKeymap() {
  const conflicts = keyConflicts(draftKeys);
  const bad = new Set(conflicts.flatMap((c) => c.actions));
  $('keymap').innerHTML = ACTIONS.map((a) => `<div><span>${ACTION_LABELS[a]}</span><button type="button" data-action="${a}" class="ghost${bad.has(a) ? ' dup' : ''}${waiting === a ? ' wait' : ''}">${waiting === a ? 'Nhấn phím…' : esc(keyLabel(draftKeys[a]))}</button></div>`).join('');
  $('key-warn').textContent = conflicts.map((c) => c.reserved
    ? `⚠ ${keyLabel(c.code)} là phím hệ thống (${c.actions.map((x) => ACTION_LABELS[x]).join(', ')})`
    : `⚠ Trùng phím ${keyLabel(c.code)}: ${c.actions.map((x) => ACTION_LABELS[x]).join(', ')}`).join(' · ');
  ($('set-close') as HTMLButtonElement).disabled = conflicts.length > 0;
  for (const b of $('keymap').querySelectorAll('button')) {
    (b as HTMLButtonElement).onclick = () => { waiting = (b as HTMLButtonElement).dataset.action!; input.capturing = true; renderKeymap(); };
  }
}
window.addEventListener('keydown', (e) => {
  if (!waiting) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  draftKeys = { ...draftKeys, [waiting]: e.code };
  waiting = null;
  input.capturing = false;
  renderKeymap();
}, true);
$('key-reset').onclick = () => { draftKeys = { ...DEFAULT_KEYMAP }; waiting = null; input.capturing = false; renderKeymap(); };
applyPalette();
function openSettings() {
  draftKeys = { ...settings.keymap };
  rm.checked = settings.reducedMotion;
  lt.checked = settings.largeText;
  renderKeymap();
  $('settings').classList.remove('hidden');
}
$('set-close').onclick = () => {
  if (keyConflicts(draftKeys).length > 0) return;
  settings.volume = Number(vol.value);
  settings.sensitivity = Number(sens.value);
  audio.setVolume(settings.volume);
  input.sensitivity = settings.sensitivity;
  settings.colorblind = cb.checked;
  settings.reducedMotion = rm.checked;
  settings.largeText = lt.checked;
  settings.keymap = { ...draftKeys };
  applyPalette();
  saveSettings(settings);
  $('settings').classList.add('hidden');
};

// ---------- events -> feedback ----------
function onEvents(events: TimedEvent[]) {
  for (const { event } of events) {
    switch (event.name) {
      case 'mote_picked': audio.play('pickup'); break;
      case 'lantern_lit': audio.play('lantern'); hud.toast(`Đèn ${event.data.lantern_id} ${event.data.relight ? 'thắp lại' : 'đã sáng'}! Túi đựng: ${capacity(state!, tuning)}`); break;
      case 'refuel': audio.play('pickup'); hud.toast(`Châm dầu ${event.data.lantern_id}: ${Math.floor(event.data.fuel)}/${tuning.fuel_max}`); break;
      case 'lantern_out': audio.play('shade'); hud.toast(`${settings.colorblind ? '⚠ ' : ''}Đèn ${event.data.lantern_id} đã tắt!`); hud.caption(`Đèn ${event.data.lantern_id} đã tắt`); break;
      case 'pulse': audio.play('pulse'); pulseAnim = 0; break;
      case 'player_hit': audio.play('hit'); hud.flashHit(); shakeUntil = performance.now() + 300; if (event.data.by === 'fall') hud.toast('Mây rơi xuống biển mây…'); break;
      case 'dash': audio.play('dash'); break;
      case 'shade_spawned': audio.play('shade'); hud.caption('Bóng Mực xuất hiện'); hud.pointAtShade(event.data.id); break;
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
  const glow = 0.35 + 0.65 * (p.carried / capacity(s, tuning));
  player.lanternLight.intensity = 3 + glow * 7;
  player.lanternGlow.emissiveIntensity = 0.8 + glow * 2;

  // Ticket-03 lanterns: fuel bar when lit; fuel < 30 -> lantern + bar blink slowly (1 Hz);
  // unlit -> squashed 20% with torn paper (distinguishable without colour); ring only with a safe zone.
  const maxU = tuning.fuel_max * FUEL_UNITS;
  const lowU = tuning.low_fuel_threshold * FUEL_UNITS;
  const blinkOff = Math.floor(time * 2) % 2 === 1;
  const warnHex = settings.colorblind ? 0xffffff : 0xff5a5f;
  for (const l of s.lanterns) {
    const v = lanternViews.get(l.id)!;
    const weak = l.lit && l.fuel < lowU;
    const dim = weak && blinkOff;
    const cost = l.everLit ? tuning.relight_cost : tuning.lantern_cost;
    v.fill.scale.y = Math.max(0.001, (l.deposited / cost) * 0.7);
    v.fill.visible = !l.lit && l.deposited > 0;
    v.shell.scale.set(1, l.lit ? 1 : 0.8, 1);
    v.tear.visible = !l.lit;
    v.body.color.setHex(l.lit ? PAL.lanternLit : PAL.lanternOff);
    v.body.emissive.setHex(l.lit ? PAL.lanternLit : 0x000000);
    v.body.emissiveIntensity = l.lit ? (dim ? 0.3 : 1.6) : 0;
    v.core.visible = l.lit && !dim;
    v.light.intensity = THREE.MathUtils.lerp(v.light.intensity, l.lit ? (dim ? 12 : 40) : 0, 0.15);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = l.lit && !weak ? 0.35 : 0;
    const ratio = Math.max(0, l.fuel) / maxU;
    v.fuelBar.visible = l.lit && !dim;
    v.fuelBar.quaternion.copy(camera.quaternion); // billboard
    v.fuelFill.scale.x = Math.max(0.001, ratio);
    v.fuelFill.position.x = -0.6 * (1 - ratio);
    (v.fuelFill.material as THREE.MeshBasicMaterial).color.setHex(weak ? warnHex : PAL.gold);
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
    const rimHex = settings.colorblind ? PAL.shadeRimCb : PAL.shadeRim;
    v.rimMat.color.setHex(rimHex);
    v.eyeMat.color.setHex(rimHex);
    v.body.emissive.setHex(rimHex);
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

  if (mode === 'bench') return; // bench camera is driven by the orbit in frame()
  const yaw = (input.camYawDeg * Math.PI) / 180;
  camera.position.lerp(new THREE.Vector3(p.pos[0] - Math.sin(yaw) * 9, p.pos[1] + 5.5, p.pos[2] - Math.cos(yaw) * 9), 0.15);
  camera.lookAt(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  // Camera shake on hit (0.3 s), off with reduced motion (Ticket-04).
  if (!settings.reducedMotion && performance.now() < shakeUntil) {
    camera.position.x += (Math.random() - 0.5) * 0.3;
    camera.position.y += (Math.random() - 0.5) * 0.3;
  }
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
  if (state && mode === 'bench') {
    accumulator += elapsed;
    while (accumulator >= DT) { step(state, tuning, IDLE_INPUT); accumulator -= DT; }
    // Orbit: centre (0,0,0), radius 30 m, Y 15 m, from (30,15,0), counter-clockwise seen from above
    // (+X towards +Z, the maps' angle convention), one turn per 15 s; always looking at (0,0,0).
    const t = benchStart < 0 ? 0 : (now - benchStart) / 1000;
    const a = (2 * Math.PI * t) / 15;
    camera.position.set(30 * Math.cos(a), 15, 30 * Math.sin(a));
    camera.lookAt(0, 0, 0);
  }
  if (state && mode === 'playing') {
    accumulator += elapsed;
    while (accumulator >= DT && mode === 'playing') {
      const inp = state.paused ? input.idle() : input.read();
      if (settingsOpen()) inp.pause = false; // Esc must not resume the night under the settings box
      if (forcePauseTicks > 0) { inp.pause = forcePauseTicks === 2; forcePauseTicks--; }
      const wasGrounded = state.player.grounded;
      const wasWarning = windWarning(state);
      const lowU = tuning.low_fuel_threshold * FUEL_UNITS;
      const wasWeak = new Set(state.lanterns.filter((l) => l.lit && l.fuel < lowU).map((l) => l.id));
      onEvents(step(state, tuning, inp));
      // Warning cue once per gust, on the simulation tick it starts (not per rendered frame).
      if (!wasWarning && windWarning(state) && state.status === 'playing') { audio.play('wind'); hud.toast('Gió sắp nổi!'); hud.caption('Gió sắp thổi'); }
      for (const l of state.lanterns) if (l.lit && l.fuel < lowU && !wasWeak.has(l.id)) hud.caption(`Đèn ${l.id} sắp cạn dầu (dưới ${tuning.low_fuel_threshold})`);
      if (wasGrounded && !state.player.grounded && state.player.vel[1] > 6 && !state.player.launch) audio.play('jump');
      accumulator -= DT;
    }
  }
  if (state) {
    sync(state, now / 1000);
    if (mode !== 'bench') {
      const tick = hud.update(state, camera, wonScores.reduce((a, b, i) => a + (i === night - 1 ? 0 : b), 0));
      if (tick !== null) { audio.play('tick'); hud.caption(tick === 10 ? '10 giây cuối!' : `Còn ${tick} giây`); }
    }
  } else {
    const a = now / 9000;
    camera.position.set(Math.sin(a) * 55, 26, Math.cos(a) * 55);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
  if (mode === 'bench') benchFrame(now);
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
// ---------- Ticket-04 benchmark ----------
const IDLE_INPUT = { move: [0, 0] as [number, number], camYawDeg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
let benchStart = -1;
let benchLast = 0;
let benchSum = 0;
const benchDts: number[] = [];
let benchFirstFrameEpoch = 0;
let benchDone = false;
function rendererName(): string {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  return `three.js r${THREE.REVISION} WebGL${renderer.capabilities.isWebGL2 ? '2' : '1'} · ${gpu} · ${navigator.userAgent}`;
}
function startBench() {
  mode = 'bench';
  state = createBenchGame(tuning, BENCH_SEED);
  world = buildWorld(getMap(1, tuning));
  scene.add(world);
  for (const l of state.lanterns) {
    const v = buildLantern(tuning.safe_radius);
    v.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
    scene.add(v.group);
    lanternViews.set(l.id, v);
  }
  $('overlay').classList.add('hidden');
  $('fps').classList.add('hidden');
  hud.show(false);
}
/** A hidden window gets no frames (the browser stops rAF): discard and restart warm-up when visible again. */
document.addEventListener('visibilitychange', () => {
  if (mode !== 'bench' || benchDone || !document.hidden) return;
  benchStart = -1;
  benchSum = 0;
  benchDts.length = 0;
});
/** Called after each rendered bench frame: 3 s warm-up, then exactly `duration` seconds of frame times. */
function benchFrame(now: number) {
  if (benchDone) return;
  if (benchStart < 0) {
    benchStart = now;
    benchLast = now;
    if (benchFirstFrameEpoch === 0) benchFirstFrameEpoch = performance.timeOrigin + performance.now(); // first bench frame
    return;
  }
  const dt = now - benchLast;
  benchLast = now;
  if (now - benchStart < BENCH_WARMUP_MS) return;
  benchDts.push(dt);
  benchSum += dt;
  if (benchSum >= BENCH_DURATION_MS) {
    benchDone = true;
    void fetch('/api/bench-result', { method: 'POST', body: JSON.stringify({ dts: benchDts, firstFrameEpoch: benchFirstFrameEpoch, renderer: rendererName() }) });
    document.title = 'bench done';
  }
}

if (BENCH) startBench();
else showMenu();
requestAnimationFrame(frame);
