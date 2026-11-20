/**
 * Player settings persisted in localStorage. Ticket-02: volume + mouse sensitivity; Ticket-03: colour-blind
 * palette; Ticket-04: key map, reduced motion, large text (x1.25).
 */
import { sanitizeKeymap, type KeyMap } from '../shared/keymap.js';

export interface Settings { volume: number; sensitivity: number; colorblind: boolean; reducedMotion: boolean; largeText: boolean; keymap: KeyMap }

const KEY = 'dao-den-long.settings';
const DEFAULTS: Omit<Settings, 'keymap'> = { volume: 0.6, sensitivity: 1, colorblind: false, reducedMotion: false, largeText: false };

export function defaultSettings(): Settings {
  return { ...DEFAULTS, keymap: sanitizeKeymap({}) };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const s = JSON.parse(raw) as Partial<Settings>;
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return {
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULTS.volume,
      sensitivity: typeof s.sensitivity === 'number' ? Math.min(3, Math.max(0.2, s.sensitivity)) : DEFAULTS.sensitivity,
      colorblind: bool(s.colorblind, DEFAULTS.colorblind),
      reducedMotion: bool(s.reducedMotion, DEFAULTS.reducedMotion),
      largeText: bool(s.largeText, DEFAULTS.largeText),
      keymap: sanitizeKeymap(s.keymap),
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory */ }
}
