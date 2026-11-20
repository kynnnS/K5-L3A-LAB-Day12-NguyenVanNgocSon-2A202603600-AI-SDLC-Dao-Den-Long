/** DOM HUD + overlays. Reads GameState only; never changes it. */
import { distXZ, timeLeft } from '../core/sim.js';
import type { GameState, Tuning } from '../core/types.js';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private toastTimer = 0;

  constructor(private tuning: Tuning, onStart: () => void) {
    $('ov-btn').addEventListener('click', onStart);
  }

  showPlaying(): void {
    $('overlay').classList.add('hidden');
    $('hud').classList.remove('hidden');
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

  showGameOver(state: GameState, result: 'won' | 'lost', reason: string): void {
    const lit = state.lanterns.filter((l) => l.lit).length;
    $('ov-title').textContent = result === 'won' ? 'Đảo đã sáng trở lại!' : 'Mây đã kiệt sức…';
    $('ov-sub').textContent = result === 'won' ? 'Bạn đã thắp hết Đèn Lồng Lớn'
      : reason === 'dawn' ? 'Bình minh đến trước khi kịp thắp hết đèn' : 'Ngọn lửa của Mây đã tắt';
    $('ov-body').innerHTML = `<p>Điểm: <b>${state.score}</b> · Đèn: ${lit}/${state.lanterns.length} · Lửa còn: ${state.player.flames}</p>`;
    $('ov-btn').textContent = 'Chơi lại (Enter / R)';
    $('overlay').classList.remove('hidden');
  }

  update(state: GameState): void {
    const t = this.tuning;
    const p = state.player;
    $('hud-flames').innerHTML = Array.from({ length: Math.max(t.flames, p.flames) }, (_, i) => `<span class="${i < p.flames ? '' : 'off'}"></span>`).join('');
    $('hud-carried').textContent = `${p.carried} / ${t.carry_capacity}`;
    $('hud-lanterns').textContent = `${state.lanterns.filter((l) => l.lit).length} / ${state.lanterns.length}`;
    const secs = Math.ceil(timeLeft(state));
    $('hud-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('hud-score').textContent = String(state.score);
    const cd = p.pulseReadyAt - state.tick;
    $('hud-pulse').textContent = cd > 0 ? `${(cd / 60).toFixed(1)}s` : p.carried >= t.pulse_cost ? `sẵn sàng (-${t.pulse_cost})` : `cần ${t.pulse_cost} đom đóm`;

    const near = state.lanterns
      .filter((l) => !l.lit && distXZ(p.pos, l.pos) <= t.interact_radius)
      .sort((a, b) => distXZ(p.pos, a.pos) - distXZ(p.pos, b.pos))[0];
    const prompt = $('hud-prompt');
    if (near) {
      prompt.textContent = p.carried > 0 ? `E: nạp đèn ${near.id} (${near.deposited}/${t.lantern_cost})` : `Đèn ${near.id} cần ${t.lantern_cost - near.deposited} đom đóm`;
      prompt.classList.add('show');
    } else prompt.classList.remove('show');
  }
}
