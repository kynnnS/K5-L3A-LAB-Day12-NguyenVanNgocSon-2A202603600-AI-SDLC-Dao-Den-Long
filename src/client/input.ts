/** Keyboard + mouse → contract InputState (same shape the headless inputs file produces). */
import { DT } from '../core/constants.js';
import type { InputState } from '../core/types.js';

export class InputController {
  private keys = new Set<string>();
  private dragging = false;
  camYawDeg = 0;
  sensitivity = 1;

  constructor(canvas: HTMLCanvasElement, onKey: (code: string) => void) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) onKey(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.camYawDeg -= e.movementX * 0.3 * this.sensitivity; });
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Called once per fixed simulation step. */
  read(): InputState {
    if (this.has('ArrowLeft')) this.camYawDeg += 120 * DT * this.sensitivity;
    if (this.has('ArrowRight')) this.camYawDeg -= 120 * DT * this.sensitivity;
    const fwd = (this.has('KeyW', 'ArrowUp') ? 1 : 0) - (this.has('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (this.has('KeyD') ? 1 : 0) - (this.has('KeyA') ? 1 : 0);
    // Camera looks along (sin yaw, cos yaw); contract input +x maps to screen-left, so negate strafe.
    return {
      move: [-strafe, fwd],
      camYawDeg: this.camYawDeg,
      jump: this.has('Space'),
      interact: this.has('KeyE'),
      pulse: this.has('KeyF'),
      dash: this.has('ShiftLeft', 'ShiftRight'),
      pause: this.has('Escape', 'KeyP'),
    };
  }

  /** Input while a menu is open: nothing held except pause (lets the core see the release edge). */
  idle(): InputState {
    return { move: [0, 0], camYawDeg: this.camYawDeg, jump: false, interact: false, pulse: false, dash: false, pause: this.has('Escape', 'KeyP') };
  }

  reset(): void {
    this.camYawDeg = 0;
  }
}
