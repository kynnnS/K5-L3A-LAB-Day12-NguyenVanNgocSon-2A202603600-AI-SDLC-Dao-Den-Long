/** Ticket-02 settings: volume + mouse sensitivity persist in localStorage (client logic, no DOM). */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '../../src/client/settings.js';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

describe('settings persistence', () => {
  it('defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual({ volume: 0.6, sensitivity: 1 });
  });
  it('round-trips through localStorage (survives reopening the game)', () => {
    saveSettings({ volume: 0.25, sensitivity: 2.4 });
    expect(store.get('dao-den-long.settings')).toBe('{"volume":0.25,"sensitivity":2.4}');
    expect(loadSettings()).toEqual({ volume: 0.25, sensitivity: 2.4 });
  });
  it('clamps out-of-range values and ignores corrupt data', () => {
    store.set('dao-den-long.settings', '{"volume":7,"sensitivity":0}');
    expect(loadSettings()).toEqual({ volume: 1, sensitivity: 0.2 });
    store.set('dao-den-long.settings', '{oops');
    expect(loadSettings()).toEqual({ volume: 0.6, sensitivity: 1 });
  });
  it('works without storage (private mode): no throw', () => {
    (globalThis as any).localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => saveSettings({ volume: 0.5, sensitivity: 1 })).not.toThrow();
    expect(loadSettings()).toEqual({ volume: 0.6, sensitivity: 1 });
  });
});
