import { describe, expect, it } from 'vitest';
import { UNIT_TYPES } from '../data';
import type { Army, GameState } from '../data/types';
import { createInitialState, endTurn, newUnit, provincesOf } from '../campaign';
import { counterRoleFor, standardAi } from './index';

const fresh = (clan = 'akagane', seed = 7) => createInitialState(clan, seed);

function placeArmy(s: GameState, owner: string, location: string, spec: Record<string, number>, stars = 3): Army {
  const id = `t${s.nextId++}`;
  const units = Object.entries(spec).flatMap(([t, n]) => Array.from({ length: n }, () => newUnit(t)));
  s.armies[id] = { id, owner, location, general: { id: `g${id}`, name: `General ${id}`, stars, xp: 0 }, units, moved: false, stance: 'hold' };
  return s.armies[id];
}

const daimyo = (s: GameState, clan: string) => Object.values(s.armies).find((a) => a.owner === clan && a.general.isDaimyo)!;

describe('Konter-Wahl', () => {
  it('Speere gegen Reiterei, Reiter gegen Bogen, Fernkampf gegen Speere', () => {
    expect(counterRoleFor({ cavalry: 100 })).toBe('spear');
    expect(counterRoleFor({ ranged: 100 })).toBe('cavalry');
    expect(counterRoleFor({ spear: 100 })).toBe('ranged');
  });
});

describe('Standard-KI', () => {
  it('spielt 40 Runden ohne Fehler, erobert Land und bleibt zahlungsfähig', () => {
    let s = fresh();
    const start = Object.fromEntries(Object.keys(s.clans).map((c) => [c, provincesOf(s, c).length]));
    let deepDebt = 0;
    for (let i = 0; i < 40 && !s.winner; i++) {
      s = endTurn(s, standardAi).state;
      for (const c of Object.keys(s.clans)) if (c !== 'ronin' && !s.clans[c].isPlayer && s.clans[c].treasury < -300) deepDebt++;
    }
    const aiClans = ['kurogane', 'murasaki', 'matsukaze', 'kitakaze', 'aoyama'];
    const grown = aiClans.filter((c) => provincesOf(s, c).length > start[c]);
    expect(grown.length).toBeGreaterThanOrEqual(2);
    expect(deepDebt).toBe(0);
  });

  it('ist deterministisch', () => {
    let a = fresh();
    let b = fresh();
    for (let i = 0; i < 8; i++) {
      a = endTurn(a, standardAi).state;
      b = endTurn(b, standardAi).state;
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('greift nicht an, wenn der Gegner überlegen ist', () => {
    const s = fresh();
    placeArmy(s, 'ronin', 'bungo', { samurai_yari: 6, katana: 4, yumi: 2 }, 5);
    const before = daimyo(s, 'kurogane').location;
    const res = standardAi(s, 'kurogane');
    expect(res.battles.filter((b) => b.province === 'bungo')).toHaveLength(0);
    expect(daimyo(res.state, 'kurogane').location).toBe(before);
  });

  it('greift eine schwache Nachbarprovinz an', () => {
    const s = fresh();
    s.provinces.bungo.buildings = {};
    s.provinces.bungo.garrison = [newUnit('ashigaru_yari')];
    placeArmy(s, 'kurogane', 'satsuma', { samurai_yari: 4, ashigaru_yari: 4, yumi: 2 }, 3);
    const res = standardAi(s, 'kurogane');
    expect(res.state.provinces.bungo.owner).toBe('kurogane');
  });

  it('lässt beim Abmarsch eine Garnison in der Grenzprovinz', () => {
    const s = fresh();
    s.provinces.bungo.buildings = {};
    s.provinces.bungo.garrison = [newUnit('ashigaru_yari')];
    s.provinces.higo.garrison = [];
    // Higo grenzt an Chikuzen (Unabhängige) und Bungo.
    placeArmy(s, 'kurogane', 'higo', { samurai_yari: 4, ashigaru_yari: 4, yumi: 2 }, 3);
    const res = standardAi(s, 'kurogane');
    expect(res.state.provinces.higo.garrison.length).toBeGreaterThanOrEqual(1);
  });

  it('baut ohne Bedrohung zuerst Reisfelder', () => {
    const s = fresh();
    s.clans.kurogane.treasury = 2000;
    const res = standardAi(s, 'kurogane');
    const farms = provincesOf(res.state, 'kurogane').flatMap((p) => res.state.provinces[p].queue).filter((q) => q.id === 'farm');
    expect(farms.length).toBeGreaterThanOrEqual(1);
  });

  it('rekrutiert Speere gegen benachbarte Reiterei', () => {
    const s = fresh();
    s.clans.kurogane.treasury = 3000;
    placeArmy(s, 'ronin', 'bungo', { kiba: 8 }, 4);
    const res = standardAi(s, 'kurogane');
    const units = provincesOf(res.state, 'kurogane').flatMap((p) => res.state.provinces[p].queue).filter((q) => q.kind === 'unit');
    expect(units.length).toBeGreaterThanOrEqual(1);
    expect(units.every((q) => UNIT_TYPES[q.id].role === 'spear')).toBe(true);
  });

  it('hält den Unterhalt im Rahmen des Einkommens', () => {
    const s = fresh();
    s.clans.kurogane.treasury = 50000;
    let st = s;
    for (let i = 0; i < 6; i++) st = standardAi(st, 'kurogane').state;
    const queued = provincesOf(st, 'kurogane').flatMap((p) => st.provinces[p].queue).filter((q) => q.kind === 'unit');
    // Höchstens maxRecruitsPerTurn (2) je Zug, und nicht unbegrenzt trotz voller Kasse.
    expect(queued.length).toBeLessThanOrEqual(12);
  });
});
