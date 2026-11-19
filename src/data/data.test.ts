import { describe, expect, it } from 'vitest';
import {
  ADJACENCIES,
  BUILDINGS,
  CAPITAL_ID,
  CLANS,
  CLAN_IDS,
  CLAN_BONUS_BUILDINGS,
  COUNTERS,
  PROVINCES,
  PROVINCE_IDS,
  START_ARMIES,
  START_RELATIONS,
  UNIT_TYPES,
  neighborsOf,
  seasonOf,
  yearOf,
  CAMPAIGN,
} from './index';

describe('Provinzen & Nachbarschaftsgraph', () => {
  it('hat 20–30 Provinzen', () => {
    expect(PROVINCE_IDS.length).toBeGreaterThanOrEqual(20);
    expect(PROVINCE_IDS.length).toBeLessThanOrEqual(30);
  });

  it('Kyoto existiert und ist Hauptstadt', () => {
    expect(PROVINCES[CAPITAL_ID]?.isCapital).toBe(true);
  });

  it('alle Kanten verweisen auf existierende Provinzen, keine Duplikate/Schleifen', () => {
    const seen = new Set<string>();
    for (const { a, b } of ADJACENCIES) {
      expect(PROVINCES[a], a).toBeDefined();
      expect(PROVINCES[b], b).toBeDefined();
      expect(a).not.toBe(b);
      const key = [a, b].sort().join('|');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('Graph ist zusammenhängend (auch ohne Seewege bis auf die Inseln)', () => {
    const visited = new Set<string>([PROVINCE_IDS[0]]);
    const stack = [PROVINCE_IDS[0]];
    while (stack.length) {
      for (const n of neighborsOf(stack.pop()!)) {
        if (!visited.has(n.id)) {
          visited.add(n.id);
          stack.push(n.id);
        }
      }
    }
    expect(visited.size).toBe(PROVINCE_IDS.length);
  });

  it('jede Provinz hat mindestens 2 Nachbarn', () => {
    for (const id of PROVINCE_IDS) expect(neighborsOf(id).length, id).toBeGreaterThanOrEqual(2);
  });
});

describe('Clans', () => {
  it('5–7 spielbare Clans mit gültigen, disjunkten Startprovinzen', () => {
    const playable = CLAN_IDS.filter((c) => CLANS[c].playable);
    expect(playable.length).toBeGreaterThanOrEqual(5);
    expect(playable.length).toBeLessThanOrEqual(7);
    const used = new Set<string>();
    for (const c of playable) {
      const def = CLANS[c];
      expect(def.startProvinces).toContain(def.homeProvince);
      for (const p of def.startProvinces) {
        expect(PROVINCES[p], p).toBeDefined();
        expect(used.has(p), p).toBe(false);
        used.add(p);
      }
    }
    expect(used.has(CAPITAL_ID)).toBe(false);
  });

  it('Farben sind eindeutig', () => {
    const colors = CLAN_IDS.map((c) => CLANS[c].color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('Startarmeen und Beziehungen verweisen auf gültige Daten', () => {
    for (const a of START_ARMIES) {
      expect(CLANS[a.clan]).toBeDefined();
      expect(CLANS[a.clan].startProvinces).toContain(a.location);
      for (const u of a.units) expect(UNIT_TYPES[u], u).toBeDefined();
    }
    for (const r of START_RELATIONS) {
      expect(CLANS[r.a]).toBeDefined();
      expect(CLANS[r.b]).toBeDefined();
    }
    for (const [c, b] of Object.entries(CLAN_BONUS_BUILDINGS)) {
      expect(CLANS[c]).toBeDefined();
      for (const [id, lvl] of Object.entries(b)) {
        expect(BUILDINGS[id]).toBeDefined();
        expect(lvl).toBeLessThanOrEqual(BUILDINGS[id].levels.length);
      }
    }
  });
});

describe('Einheiten & Gebäude', () => {
  it('Einheiten-Anforderungen verweisen auf existierende Gebäudestufen', () => {
    for (const u of Object.values(UNIT_TYPES)) {
      for (const r of u.requires) {
        expect(BUILDINGS[r.building], `${u.id} -> ${r.building}`).toBeDefined();
        expect(r.level).toBeLessThanOrEqual(BUILDINGS[r.building].levels.length);
      }
      expect(u.men).toBeGreaterThan(0);
      expect(u.upkeep).toBeLessThan(u.cost);
    }
  });

  it('Gebäude-Anforderungen sind gültig', () => {
    for (const b of Object.values(BUILDINGS)) {
      for (const lvl of b.levels) {
        for (const r of lvl.requires ?? []) expect(BUILDINGS[r.building]).toBeDefined();
      }
    }
  });

  it('jede Rolle ist mindestens durch eine Einheit vertreten', () => {
    const roles = new Set(Object.values(UNIT_TYPES).map((u) => u.role));
    expect([...roles].sort()).toEqual(['cavalry', 'ranged', 'spear', 'sword']);
  });

  it('Konter-Dreieck: Speer > Kavallerie > Bogen > Speer', () => {
    expect(COUNTERS.spear.cavalry).toBeGreaterThan(COUNTERS.cavalry.spear);
    expect(COUNTERS.cavalry.ranged).toBeGreaterThan(COUNTERS.ranged.cavalry);
    expect(COUNTERS.ranged.spear).toBeGreaterThan(COUNTERS.spear.ranged);
  });
});

describe('Zeit', () => {
  it('4 Runden = 1 Jahr, Winter ist die 4. Jahreszeit', () => {
    expect(seasonOf(0).id).toBe('spring');
    expect(seasonOf(3).id).toBe('winter');
    expect(seasonOf(4).id).toBe('spring');
    expect(yearOf(0)).toBe(CAMPAIGN.startYear);
    expect(yearOf(4)).toBe(CAMPAIGN.startYear + 1);
  });
});
