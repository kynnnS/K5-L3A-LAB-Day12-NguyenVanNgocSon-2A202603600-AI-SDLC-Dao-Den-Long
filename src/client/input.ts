/** Keyboard + mouse → contract InputState (same shape the headless inputs file produces). */
import { DT } from '../core/constants.js';
import type { InputState } from '../core/types.js';

export class InputController {
  private keys = new Set<string>();
  private dragging = false;
  camYawDeg = 0;
  /** World-space facing (radians) of the last non-zero move, for the character model. */
  facing = 0;

  constructor(canvas: HTMLCanvasElement, onKey: (code: string) => void) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      onKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.camYawDeg -= e.movementX * 0.3; });
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Called once per fixed simulation step. */
  read(): InputState {
    if (this.has('ArrowLeft')) this.camYawDeg += 120 * DT;
    if (this.has('ArrowRight')) this.camYawDeg -= 120 * DT;
    const fwd = (this.has('KeyW', 'ArrowUp') ? 1 : 0) - (this.has('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (this.has('KeyD') ? 1 : 0) - (this.has('KeyA') ? 1 : 0);
    // Camera looks along (sin yaw, cos yaw); contract input +x maps to screen-left, so negate strafe.
    const move: [number, number] = [-strafe, fwd];
    if (fwd !== 0 || strafe !== 0) {
      const th = (this.camYawDeg * Math.PI) / 180;
      this.facing = Math.atan2(move[0] * Math.cos(th) + move[1] * Math.sin(th), -move[0] * Math.sin(th) + move[1] * Math.cos(th));
    }
    return { move, camYawDeg: this.camYawDeg, jump: this.has('Space'), interact: this.has('KeyE'), pulse: this.has('KeyF') };
  }

  reset(): void {
    this.camYawDeg = 0;
    this.facing = 0;
  }
}
