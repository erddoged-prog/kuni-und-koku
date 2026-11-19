// Deterministischer Zufallsgenerator (mulberry32). Gleicher Seed => gleiche Folge.

export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganzzahl in [min, max]. */
  int(min: number, max: number): number;
  /** true mit Wahrscheinlichkeit p. */
  chance(p: number): boolean;
  /** Streufaktor 1 ± spread. */
  spread(spread: number): number;
  /** Gewichtete Auswahl eines Index; -1 wenn alle Gewichte 0. */
  weighted(weights: number[]): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    spread: (sp) => 1 + (next() * 2 - 1) * sp,
    weighted: (weights) => {
      const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
      if (total <= 0) return -1;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
  };
}

/** Leitet aus einem Basis-Seed und Zusatzwerten einen neuen Seed ab (z. B. Spiel-Seed + Runde + Provinz). */
export function deriveSeed(base: number, ...parts: (number | string)[]): number {
  let h = base >>> 0 || 0x9e3779b9;
  for (const p of parts) {
    const str = String(p);
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
    }
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return h >>> 0;
}
