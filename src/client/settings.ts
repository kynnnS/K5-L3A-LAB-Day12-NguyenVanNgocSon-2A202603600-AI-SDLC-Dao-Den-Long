/** Player settings persisted in localStorage (Ticket-02: volume + mouse sensitivity). */
export interface Settings { volume: number; sensitivity: number }

const KEY = 'dao-den-long.settings';
const DEFAULTS: Settings = { volume: 0.6, sensitivity: 1 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULTS.volume,
      sensitivity: typeof s.sensitivity === 'number' ? Math.min(3, Math.max(0.2, s.sensitivity)) : DEFAULTS.sensitivity,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory */ }
}
