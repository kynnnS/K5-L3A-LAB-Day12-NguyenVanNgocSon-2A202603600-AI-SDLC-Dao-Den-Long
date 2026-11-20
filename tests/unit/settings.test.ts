/** Settings persistence (client logic, no DOM): Ticket-02 volume/sensitivity, Ticket-03 colour-blind, Ticket-04 accessibility. */
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, saveSettings } from '../../src/client/settings.js';
import { DEFAULT_KEYMAP } from '../../src/shared/keymap.js';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});
const DEF = { volume: 0.6, sensitivity: 1, colorblind: false, reducedMotion: false, largeText: false, keymap: DEFAULT_KEYMAP };

describe('settings persistence', () => {
  it('defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEF);
    expect(defaultSettings()).toEqual(DEF);
  });
  it('round-trips every setting through localStorage (survives reopening the game)', () => {
    const s = { volume: 0.25, sensitivity: 2.4, colorblind: true, reducedMotion: true, largeText: true, keymap: { ...DEFAULT_KEYMAP, jump: 'KeyJ', pause: 'KeyO' } };
    saveSettings(s);
    expect(JSON.parse(store.get('dao-den-long.settings')!)).toEqual(s);
    expect(loadSettings()).toEqual(s);
  });
  it('older saves (Ticket-02/03 keys only) load with the new options at their defaults', () => {
    store.set('dao-den-long.settings', '{"volume":0.3,"sensitivity":1.5,"colorblind":true}');
    expect(loadSettings()).toEqual({ ...DEF, volume: 0.3, sensitivity: 1.5, colorblind: true });
  });
  it('clamps out-of-range values and ignores corrupt data', () => {
    store.set('dao-den-long.settings', '{"volume":7,"sensitivity":0,"keymap":{"jump":5}}');
    expect(loadSettings()).toEqual({ ...DEF, volume: 1, sensitivity: 0.2 });
    store.set('dao-den-long.settings', '{oops');
    expect(loadSettings()).toEqual(DEF);
  });
  it('works without storage (private mode): no throw', () => {
    (globalThis as any).localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => saveSettings(defaultSettings())).not.toThrow();
    expect(loadSettings()).toEqual(DEF);
  });
});
