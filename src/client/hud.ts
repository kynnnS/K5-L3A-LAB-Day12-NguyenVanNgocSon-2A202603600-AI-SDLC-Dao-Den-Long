/** DOM HUD (Ticket-02 layout + Ticket-03 fuel/capacity/dawn goal). Reads GameState only; never changes it. */
import * as THREE from 'three';
import { FUEL_UNITS } from '../core/constants.js';
import { capacity, distXZ, fuelOut, idCompare, requiredLit, timeLeft } from '../core/sim.js';
import type { GameState, Lantern, Tuning } from '../core/types.js';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private toastTimer = 0;
  private lastSecond = -1;
  private cells = -1;
  colorblind = false;

  constructor(private tuning: Tuning) {}

  /** New attempt: the 10 s countdown beeps start again. */
  reset(): void {
    this.lastSecond = -1;
  }

  show(on: boolean): void {
    $('hud').classList.toggle('hidden', !on);
  }

  toast(text: string): void {
    const el = $('hud-toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  flashHit(): void {
    const f = $('flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  /** Same candidate rule as core step 5: unlit, or lit and not full; nearest in range, ties -> smaller id. */
  private interactTarget(state: GameState): Lantern | undefined {
    const t = this.tuning;
    const max = t.fuel_max * FUEL_UNITS;
    return state.lanterns
      .filter((l) => (!l.lit || l.fuel < max) && distXZ(state.player.pos, l.pos) <= t.interact_radius)
      .sort((a, b) => distXZ(state.player.pos, a.pos) - distXZ(state.player.pos, b.pos) || idCompare(a.id, b.id))[0];
  }

  /** Returns the whole seconds left when it changes in the last 10 s (for the countdown sound). */
  update(state: GameState, camera: THREE.Camera, totalScore: number): number | null {
    const t = this.tuning;
    const p = state.player;
    const warn = this.colorblind ? '⚠ ' : '';
    $('hud-flames').innerHTML = Array.from({ length: Math.max(t.flames, p.flames) }, (_, i) => `<span class="${i < p.flames ? '' : 'off'}"></span>`).join('');
    const secs = Math.ceil(timeLeft(state));
    const timer = $('hud-time');
    timer.textContent = `${secs <= 30 ? warn : ''}${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    timer.classList.toggle('danger', secs <= 30);
    const lit = state.lanterns.filter((l) => l.lit).length;
    const need = requiredLit(state, t);
    const lanternsEl = $('hud-lanterns');
    lanternsEl.textContent = `${lit < need ? warn : ''}${lit}/${state.lanterns.length} · cần ${need}`;
    lanternsEl.classList.toggle('danger', lit < need);
    $('hud-score').textContent = String(totalScore + state.score);

    // Mote bar: one cell per capacity slot (10 + 2 per successful light, max 20) + "carried / capacity".
    const cap = capacity(state, t);
    if (cap !== this.cells) {
      $('hud-motes').innerHTML = Array.from({ length: cap }, () => '<span></span>').join('');
      this.cells = cap;
    }
    const cells = $('hud-motes').children;
    for (let i = 0; i < cells.length; i++) cells[i]!.classList.toggle('on', i < p.carried);
    $('hud-carry').textContent = `${p.carried}/${cap}`;

    const dashCd = p.charmTicks > 0 ? 0 : p.dashCdTicks / (t.dash_cooldown_s * 60);
    const pulseCd = p.pulseCdTicks / (t.pulse_cooldown_s * 60);
    ($('cd-dash') as HTMLElement).style.setProperty('--cd', String(dashCd));
    ($('cd-pulse') as HTMLElement).style.setProperty('--cd', String(pulseCd));
    $('cd-pulse').classList.toggle('poor', p.carried < t.pulse_cost);
    $('cd-dash').classList.toggle('charm', p.charmTicks > 0);

    // Interaction prompt: first light (x/10), relight (x/5) or refuel (fuel/100).
    const near = this.interactTarget(state);
    const prompt = $('hud-prompt');
    if (near && p.carried > 0) {
      prompt.textContent = near.lit
        ? `E — Châm dầu (${Math.floor(fuelOut(near))}/${t.fuel_max})`
        : near.everLit
          ? `E — Thắp lại (${near.deposited}/${t.relight_cost})`
          : `E — Nạp ánh sáng (${near.deposited}/${t.lantern_cost})`;
      prompt.classList.add('show');
    } else prompt.classList.remove('show');

    // Arrow towards the nearest lantern that needs Mây (unlit, or lit with low fuel) when off-screen.
    const arrow = $('hud-arrow');
    const low = t.low_fuel_threshold * FUEL_UNITS;
    const target = state.lanterns.filter((l) => !l.lit || l.fuel < low).sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos))[0];
    if (target) {
      const v = new THREE.Vector3(target.pos[0], target.pos[1] + 2.5, target.pos[2]).project(camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.9;
      arrow.classList.toggle('hidden', onScreen);
      if (!onScreen) {
        const sx = v.z < 1 ? v.x : -v.x;
        const sy = v.z < 1 ? v.y : -v.y;
        const ang = Math.atan2(-sy, sx);
        const r = 0.42;
        arrow.style.left = `${50 + Math.cos(ang) * r * 100}%`;
        arrow.style.top = `${50 + Math.sin(ang) * r * 100}%`;
        arrow.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
      }
    } else arrow.classList.add('hidden');

    if (secs <= 10 && secs !== this.lastSecond && state.status === 'playing') {
      this.lastSecond = secs;
      return secs;
    }
    return null;
  }
}
