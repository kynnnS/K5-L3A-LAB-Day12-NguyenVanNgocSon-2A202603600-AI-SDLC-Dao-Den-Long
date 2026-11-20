/** DOM HUD (Ticket-02 layout). Reads GameState only; never changes it. */
import * as THREE from 'three';
import { distXZ, timeLeft } from '../core/sim.js';
import type { GameState, Tuning } from '../core/types.js';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private toastTimer = 0;
  private lastSecond = -1;

  constructor(private tuning: Tuning) {
    $('hud-motes').innerHTML = Array.from({ length: tuning.carry_capacity }, () => '<span></span>').join('');
  }

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

  /** Returns the whole seconds left when it changes in the last 10 s (for the countdown sound). */
  update(state: GameState, camera: THREE.Camera, totalScore: number): number | null {
    const t = this.tuning;
    const p = state.player;
    $('hud-flames').innerHTML = Array.from({ length: Math.max(t.flames, p.flames) }, (_, i) => `<span class="${i < p.flames ? '' : 'off'}"></span>`).join('');
    const secs = Math.ceil(timeLeft(state));
    const timer = $('hud-time');
    timer.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    timer.classList.toggle('danger', secs <= 30);
    const lit = state.lanterns.filter((l) => l.lit).length;
    $('hud-lanterns').textContent = `${lit}/${state.lanterns.length}`;
    $('hud-score').textContent = String(totalScore + state.score);
    const cells = $('hud-motes').children;
    for (let i = 0; i < cells.length; i++) cells[i]!.classList.toggle('on', i < p.carried);
    const dashCd = p.charmTicks > 0 ? 0 : p.dashCdTicks / (t.dash_cooldown_s * 60);
    const pulseCd = p.pulseCdTicks / (t.pulse_cooldown_s * 60);
    ($('cd-dash') as HTMLElement).style.setProperty('--cd', String(dashCd));
    ($('cd-pulse') as HTMLElement).style.setProperty('--cd', String(pulseCd));
    $('cd-pulse').classList.toggle('poor', p.carried < t.pulse_cost);
    $('cd-dash').classList.toggle('charm', p.charmTicks > 0);

    const unlit = state.lanterns.filter((l) => !l.lit);
    const near = unlit.filter((l) => distXZ(p.pos, l.pos) <= t.interact_radius).sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos))[0];
    const prompt = $('hud-prompt');
    if (near && p.carried > 0) {
      prompt.textContent = `E — Nạp ánh sáng (${near.deposited}/${t.lantern_cost})`;
      prompt.classList.add('show');
    } else prompt.classList.remove('show');

    // Arrow towards the nearest unlit lantern when it is off-screen.
    const arrow = $('hud-arrow');
    const target = unlit.sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos))[0];
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
