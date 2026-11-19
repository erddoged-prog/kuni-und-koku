import { describe, expect, it } from 'vitest';
import { ADJACENCIES, PROVINCE_IDS } from '../data';
import { borderLength, buildGeometry, pointInPolygon } from './geometry';

/** Gemeinsame Grenzen kürzer als das gelten als bloße Eckberührung. */
const MIN_BORDER = 8;

describe('Kartengeometrie', () => {
  const g = buildGeometry();

  it('jede Provinz hat eine Fläche, ihr Beschriftungspunkt liegt darin', () => {
    for (const id of PROVINCE_IDS) {
      expect(g.cells[id].length, id).toBeGreaterThanOrEqual(3);
      expect(pointInPolygon(g.centers[id], g.cells[id]), id).toBe(true);
    }
  });

  it('jede Landverbindung im Graphen ist auch eine sichtbare Grenze', () => {
    for (const e of ADJACENCIES.filter((e) => !e.sea)) {
      expect(borderLength(g.cells[e.a], g.cells[e.b]), `${e.a}–${e.b}`).toBeGreaterThanOrEqual(MIN_BORDER);
    }
  });

  it('jede sichtbare Grenze ist auch eine Verbindung im Graphen', () => {
    const declared = new Set(ADJACENCIES.map((e) => [e.a, e.b].sort().join('|')));
    for (let i = 0; i < PROVINCE_IDS.length; i++) {
      for (let j = i + 1; j < PROVINCE_IDS.length; j++) {
        const [a, b] = [PROVINCE_IDS[i], PROVINCE_IDS[j]];
        if (borderLength(g.cells[a], g.cells[b]) >= MIN_BORDER) expect(declared.has([a, b].sort().join('|')), `${a}–${b}`).toBe(true);
      }
    }
  });
});
