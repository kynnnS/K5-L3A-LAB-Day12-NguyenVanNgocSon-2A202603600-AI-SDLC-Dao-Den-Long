/** Keyboard + mouse -> contract InputState (same shape the headless inputs file produces). Keys come from the key map. */
import { DT } from '../core/constants.js';
import type { InputState } from '../core/types.js';
import { DEFAULT_KEYMAP, type KeyMap } from '../shared/keymap.js';

export class InputController {
  private keys = new Set<string>();
  private dragging = false;
  camYawDeg = 0;
  sensitivity = 1;
  keymap: KeyMap = { ...DEFAULT_KEYMAP };
  /** Set while the settings screen waits for a key to bind: game input is ignored. */
  capturing = false;

  constructor(canvas: HTMLCanvasElement, onKey: (code: string) => void) {
    window.addEventListener('keydown', (e) => {
      if (this.capturing) return;
      if (!e.repeat) onKey(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) {
        const t = e.target as HTMLElement | null;
        if (!t || t.tagName !== 'INPUT') e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.camYawDeg -= e.movementX * 0.3 * this.sensitivity; });
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Called once per fixed simulation step. Esc always toggles pause; ← → rotate the camera. */
  read(): InputState {
    const k = this.keymap;
    if (this.has('ArrowLeft')) this.camYawDeg += 120 * DT * this.sensitivity;
    if (this.has('ArrowRight')) this.camYawDeg -= 120 * DT * this.sensitivity;
    const fwd = (this.has(k.up) ? 1 : 0) - (this.has(k.down) ? 1 : 0);
    const strafe = (this.has(k.right) ? 1 : 0) - (this.has(k.left) ? 1 : 0);
    // Camera looks along (sin yaw, cos yaw); contract input +x maps to screen-left, so negate strafe.
    return {
      move: [-strafe, fwd],
      camYawDeg: this.camYawDeg,
      jump: this.has(k.jump),
      interact: this.has(k.interact),
      pulse: this.has(k.pulse),
      dash: this.has(k.dash),
      pause: this.has('Escape', k.pause),
    };
  }

  /** Input while a menu is open: nothing held except pause (lets the core see the release edge). */
  idle(): InputState {
    return { move: [0, 0], camYawDeg: this.camYawDeg, jump: false, interact: false, pulse: false, dash: false, pause: this.has('Escape', this.keymap.pause) };
  }

  reset(): void {
    this.camYawDeg = 0;
  }
}
