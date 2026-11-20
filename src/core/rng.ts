/** Deterministic PRNG (mulberry32). State lives in GameState so runs are reproducible. */

export function seedToState(seed: number): number {
  // Fold an arbitrary safe integer into 32 bits.
  const hi = Math.floor(seed / 0x100000000);
  return ((seed >>> 0) ^ (hi >>> 0) ^ 0x9e3779b9) >>> 0;
}

/** Returns [value in [0,1), nextState]. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}
