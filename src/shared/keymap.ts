/** Ticket-04 §4 key remapping (pure): every action rebindable, duplicates detected, defaults restorable. */
export const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'dash', 'interact', 'pulse', 'pause'] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyMap = Record<Action, string>;

export const DEFAULT_KEYMAP: KeyMap = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'KeyP',
};

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Đi tới', down: 'Đi lùi', left: 'Sang trái', right: 'Sang phải',
  jump: 'Nhảy', dash: 'Lướt', interact: 'Tương tác', pulse: 'Tỏa Sáng', pause: 'Tạm dừng',
};

/** Keys kept for the system: Esc always opens the pause menu, ← → rotate the camera. */
export const RESERVED_KEYS = ['Escape', 'ArrowLeft', 'ArrowRight'] as const;

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = { Space: 'Space', ShiftLeft: 'Shift trái', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl trái', ControlRight: 'Ctrl phải', AltLeft: 'Alt trái', AltRight: 'Alt phải', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', Tab: 'Tab' };
  return names[code] ?? code;
}

/** Codes bound to more than one action (or to a reserved key), with the actions involved. */
export function keyConflicts(map: KeyMap): Array<{ code: string; actions: Action[]; reserved: boolean }> {
  const byCode = new Map<string, Action[]>();
  for (const a of ACTIONS) byCode.set(map[a], [...(byCode.get(map[a]) ?? []), a]);
  const out: Array<{ code: string; actions: Action[]; reserved: boolean }> = [];
  for (const [code, actions] of byCode) {
    const reserved = (RESERVED_KEYS as readonly string[]).includes(code);
    if (actions.length > 1 || reserved) out.push({ code, actions, reserved });
  }
  return out;
}

/** Valid stored map -> that map; anything missing or not a string falls back to the default. */
export function sanitizeKeymap(raw: unknown): KeyMap {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const map = { ...DEFAULT_KEYMAP };
  for (const a of ACTIONS) if (typeof o[a] === 'string' && (o[a] as string).length > 0) map[a] = o[a] as string;
  return map;
}
