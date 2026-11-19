import { describe, expect, it } from 'vitest';
import { UNIT_TYPES, UNIT_TYPE_IDS, TACTIC_IDS } from '../data';
import type { Season, Tactic, Terrain, Unit } from '../data/types';
import { createRng, simulateBattle, type BattleInput, type BattleResult, type BattleSideInput } from './index';

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const units = (spec: Record<string, number>, experience = 0): Unit[] =>
  Object.entries(spec).flatMap(([type, n]) => Array.from({ length: n }, () => ({ type, men: UNIT_TYPES[type].men, experience })));

/** Armee eines Typs für ein festes Koku-Budget (letzte Einheit anteilig). */
const byBudget = (type: string, budget = 1800): Unit[] => {
  const n = budget / UNIT_TYPES[type].cost;
  const out = units({ [type]: Math.floor(n) });
  const f = n - Math.floor(n);
  if (f > 0.05) out.push({ type, men: Math.round(UNIT_TYPES[type].men * f), experience: 0 });
  return out;
};

const side = (u: Unit[], opts: Partial<BattleSideInput> = {}): BattleSideInput => ({
  clan: 'x', clanName: 'X', generalName: 'G', stars: 2, units: u, tactic: 'attack', ...opts,
});

interface Setup {
  attacker: BattleSideInput;
  defender: BattleSideInput;
  terrain?: Terrain;
  season?: Season;
  castleLevel?: number;
}

const battle = (s: Setup, seed: number): BattleResult =>
  simulateBattle({ terrain: 'plains', season: 'spring', ...s, seed } as BattleInput);

/** Siegquote der Angreifer über n Seeds. */
const attackerWinRate = (s: Setup, n = 100) => {
  let w = 0;
  for (let i = 0; i < n; i++) if (battle(s, i).winner === 'attacker') w++;
  return w / n;
};

/** Siegquote von A gegen B, gemittelt über beide Rollen (Angreifer/Verteidiger). */
const winRate = (a: Unit[], b: Unit[], n = 100) => {
  const asAtt = attackerWinRate({ attacker: side(a), defender: side(b) }, n);
  const asDef = 1 - attackerWinRate({ attacker: side(b), defender: side(a) }, n);
  return (asAtt + asDef) / 2;
};


// ---------------------------------------------------------------------------
describe('Determinismus', () => {
  const setup: Setup = {
    attacker: side(units({ kiba: 2, samurai_yari: 2, yumi: 2 }), { tactic: 'flank' }),
    defender: side(units({ ashigaru_yari: 4, yumi: 2 }), { tactic: 'hold' }),
  };

  it('gleicher Seed => identisches Ergebnis inkl. Bericht', () => {
    expect(battle(setup, 1234)).toEqual(battle(setup, 1234));
  });

  it('verschiedene Seeds => unterschiedliche Verläufe', () => {
    const outcomes = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(battle(setup, i).attacker.units)));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('die Eingabe wird nicht verändert', () => {
    const copy = structuredClone(setup);
    battle(setup, 7);
    expect(setup).toEqual(copy);
  });
});

describe('Buchführung & Plausibilität', () => {
  it('Männer bleiben erhalten: vorher = nachher + gefallen + gefangen (200 Zufallsschlachten)', () => {
    const rng = createRng(99);
    const terrains: Terrain[] = ['plains', 'hills', 'forest', 'river'];
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const randomArmy = () =>
      Array.from({ length: rng.int(1, 10) }, () => {
        const type = UNIT_TYPE_IDS[rng.int(0, UNIT_TYPE_IDS.length - 1)];
        return { type, men: rng.int(1, UNIT_TYPES[type].men), experience: rng.int(0, 5) };
      });
    for (let i = 0; i < 200; i++) {
      const r = battle(
        {
          attacker: side(randomArmy(), { stars: rng.int(1, 5), tactic: TACTIC_IDS[rng.int(0, 3)] as Tactic }),
          defender: side(randomArmy(), { stars: rng.int(1, 5), tactic: TACTIC_IDS[rng.int(0, 3)] as Tactic }),
          terrain: terrains[rng.int(0, 3)],
          season: seasons[rng.int(0, 3)],
          castleLevel: rng.chance(0.2) ? rng.int(1, 3) : 0,
        },
        i,
      );
      for (const s of ['attacker', 'defender'] as const) {
        for (const u of r[s].units) {
          expect(u.menAfter).toBeGreaterThanOrEqual(0);
          expect(u.killed).toBeGreaterThanOrEqual(0);
          expect(u.captured).toBeGreaterThanOrEqual(0);
          expect(u.menBefore).toBe(u.menAfter + u.killed + u.captured);
          expect(u.experience).toBeLessThanOrEqual(9);
        }
        expect(r[s].fled).toBeLessThanOrEqual(r[s].totalAfter);
      }
      expect(['attacker', 'defender']).toContain(r.winner);
    }
  });

  it('eine doppelt so große Armee gewinnt fast immer', () => {
    const small = units({ samurai_yari: 2, ashigaru_yari: 2, yumi: 1 });
    const big = units({ samurai_yari: 4, ashigaru_yari: 4, yumi: 2 });
    expect(winRate(big, small)).toBeGreaterThanOrEqual(0.95);
  });

  it('gleiche Armeen: ungefähr ausgeglichen', () => {
    const a = units({ samurai_yari: 2, ashigaru_yari: 2, yumi: 2, kiba: 1 });
    const r = winRate(a, structuredClone(a), 200);
    expect(r).toBeGreaterThan(0.4);
    expect(r).toBeLessThan(0.6);
  });

  it('der Sieger verliert im Schnitt deutlich weniger Männer als der Verlierer', () => {
    let winnerLoss = 0;
    let loserLoss = 0;
    for (let i = 0; i < 50; i++) {
      const r = battle({ attacker: side(units({ katana: 3, yumi: 2 })), defender: side(units({ ashigaru_yari: 5 })) }, i);
      const w = r[r.winner];
      const l = r[r.winner === 'attacker' ? 'defender' : 'attacker'];
      winnerLoss += (w.killed + w.captured) / w.totalBefore;
      loserLoss += (l.killed + l.captured) / l.totalBefore;
    }
    expect(winnerLoss).toBeLessThan(loserLoss * 0.7);
  });

  it('Sieger-General erhält mehr Erfahrung als der Verlierer; Überlebende werden Veteranen', () => {
    const r = battle({ attacker: side(units({ katana: 4 })), defender: side(units({ ashigaru_yari: 2 })) }, 3);
    expect(r.winner).toBe('attacker');
    expect(r.attacker.generalXp).toBeGreaterThan(r.defender.generalXp);
    expect(r.attacker.units.some((u) => u.experience === 1)).toBe(true);
  });
});

describe('Konter (Stein-Schere-Papier), gleiche Kosten', () => {
  it('Speere schlagen Reiter', () => {
    expect(winRate(byBudget('samurai_yari'), byBudget('kiba'))).toBeGreaterThanOrEqual(0.8);
    expect(winRate(byBudget('ashigaru_yari'), byBudget('kiba'))).toBeGreaterThanOrEqual(0.8);
  });

  it('Reiter schlagen Bogenschützen und Arkebusiere', () => {
    expect(winRate(byBudget('kiba'), byBudget('yumi'))).toBeGreaterThanOrEqual(0.8);
    expect(winRate(byBudget('kiba'), byBudget('teppo'))).toBeGreaterThanOrEqual(0.8);
  });

  it('Bogenschützen schlagen Samurai-Speere', () => {
    expect(winRate(byBudget('yumi'), byBudget('samurai_yari'))).toBeGreaterThanOrEqual(0.6);
  });

  it('Schwertkämpfer setzen sich gegen Speere durch', () => {
    expect(winRate(byBudget('katana'), byBudget('samurai_yari'))).toBeGreaterThanOrEqual(0.55);
  });

  it('gleiche Einheitenzahl: Bögen zerlegen Ashigaru, Ashigaru halten Reiter', () => {
    expect(winRate(units({ yumi: 4 }), units({ ashigaru_yari: 4 }))).toBeGreaterThanOrEqual(0.8);
    expect(winRate(units({ ashigaru_yari: 4 }), units({ kiba: 4 }))).toBeGreaterThanOrEqual(0.7);
  });

  it('der Bericht begründet den Konter', () => {
    const r = battle({ attacker: side(units({ kiba: 4 })), defender: side(units({ samurai_yari: 4 })) }, 1);
    const text = r.report.flatMap((p) => p.lines).join('\n');
    expect(text).toMatch(/gesenkten Speeren|hielten .* stand/);
  });
});

describe('Einflussfaktoren', () => {
  const mixed = () => units({ samurai_yari: 2, ashigaru_yari: 2, yumi: 2, kiba: 1, katana: 1 });

  it('General-Sterne: 5★ schlägt 1★ mit gleicher Armee deutlich öfter', () => {
    const r = attackerWinRate({ attacker: side(mixed(), { stars: 5 }), defender: side(mixed(), { stars: 1 }) }, 200);
    expect(r).toBeGreaterThanOrEqual(0.7);
  });

  it('Erfahrung: Veteranen schlagen Rekruten', () => {
    expect(winRate(units({ samurai_yari: 3, yumi: 2 }, 4), units({ samurai_yari: 3, yumi: 2 }, 0))).toBeGreaterThanOrEqual(0.7);
  });

  it('Gelände: Hügel und Fluss begünstigen den Verteidiger', () => {
    const s = (terrain: Terrain): Setup => ({ attacker: side(mixed()), defender: side(mixed()), terrain });
    const plains = attackerWinRate(s('plains'), 200);
    expect(attackerWinRate(s('hills'), 200)).toBeLessThan(plains - 0.1);
    expect(attackerWinRate(s('river'), 200)).toBeLessThan(plains - 0.1);
  });

  it('Gelände: Im Wald verliert die Reiterei ihre Wucht', () => {
    const s = (terrain: Terrain): Setup => ({ attacker: side(units({ kiba: 5 })), defender: side(units({ yumi: 3, katana: 2 })), terrain });
    expect(attackerWinRate(s('forest'), 200)).toBeLessThan(attackerWinRate(s('plains'), 200));
  });

  it('Jahreszeit: Angriffe im Winter sind schwerer', () => {
    const s = (season: Season): Setup => ({ attacker: side(mixed()), defender: side(mixed()), season });
    expect(attackerWinRate(s('winter'), 200)).toBeLessThan(attackerWinRate(s('spring'), 200) - 0.05);
  });

  it('Jahreszeit: Arkebusen leiden unter Sommerregen und Winter', () => {
    const s = (season: Season): Setup => ({ attacker: side(units({ teppo: 5 })), defender: side(units({ samurai_yari: 5 })), season });
    const kills = (season: Season) => {
      let k = 0;
      for (let i = 0; i < 50; i++) {
        const r = battle(s(season), i);
        k += r.report.find((p) => p.id === 'ranged') ? r.defender.killed : 0;
      }
      return k;
    };
    expect(kills('summer')).toBeLessThan(kills('spring'));
  });

  it('Burg: Verteidiger hinter Mauern halten viel öfter stand', () => {
    const att = () => units({ samurai_yari: 4, ashigaru_yari: 4, yumi: 2 });
    const def = () => units({ ashigaru_yari: 3, yumi: 2 });
    const field = attackerWinRate({ attacker: side(att()), defender: side(def()) }, 200);
    const castle = attackerWinRate({ attacker: side(att()), defender: side(def(), { tactic: 'hold' }), castleLevel: 3 }, 200);
    expect(field).toBeGreaterThan(0.8);
    expect(castle).toBeLessThan(field - 0.3);
  });

  it('Burg: eine gestürmte Garnison kann nicht fliehen', () => {
    for (let i = 0; i < 30; i++) {
      const r = battle({ attacker: side(units({ katana: 6, samurai_yari: 4 })), defender: side(units({ ashigaru_yari: 1 })), castleLevel: 1 }, i);
      if (r.winner === 'attacker') {
        expect(r.defender.fled).toBe(0);
        expect(r.defender.totalAfter).toBeLessThanOrEqual(r.defender.units.filter((u) => !u.routed).reduce((a, u) => a + u.menAfter, 0));
      }
    }
  });
});

describe('Taktiken', () => {
  it('Rückzug: verliert die Schlacht, rettet aber mehr Männer als ein aussichtsloser Angriff', () => {
    const strong = () => units({ katana: 4, samurai_yari: 4, yumi: 2 });
    const weak = () => units({ ashigaru_yari: 3, yumi: 1 });
    let keptRetreat = 0;
    let keptFight = 0;
    for (let i = 0; i < 50; i++) {
      const r1 = battle({ attacker: side(strong()), defender: side(weak(), { tactic: 'retreat' }) }, i);
      expect(r1.winner).toBe('attacker');
      expect(r1.defender.withdrew).toBe(true);
      keptRetreat += r1.defender.totalAfter;
      keptFight += battle({ attacker: side(strong()), defender: side(weak(), { tactic: 'attack' }) }, i).defender.totalAfter;
    }
    expect(keptRetreat).toBeGreaterThan(keptFight * 1.5);
  });

  it('Rückzug vor Reiterei kostet mehr als vor Fußvolk', () => {
    let vsCav = 0;
    let vsInf = 0;
    for (let i = 0; i < 50; i++) {
      vsCav += battle({ attacker: side(units({ kiba: 6 })), defender: side(units({ ashigaru_yari: 4 }), { tactic: 'retreat' }) }, i).defender.killed;
      vsInf += battle({ attacker: side(units({ samurai_yari: 6 })), defender: side(units({ ashigaru_yari: 4 }), { tactic: 'retreat' }) }, i).defender.killed;
    }
    expect(vsCav).toBeGreaterThan(vsInf);
  });

  it('Halten: Schützen verursachen in fester Stellung mehr Fernkampfverluste', () => {
    const shots = (tactic: Tactic) => {
      let k = 0;
      for (let i = 0; i < 50; i++) {
        const r = battle({ attacker: side(units({ samurai_yari: 5 })), defender: side(units({ yumi: 4 }), { tactic }) }, i);
        const line = r.report.find((p) => p.id === 'ranged')!.lines.join(' ');
        k += [...line.matchAll(/(\d+) Gefallene/g)].reduce((a, m) => a + Number(m[1]), 0);
      }
      return k;
    };
    expect(shots('hold')).toBeGreaterThan(shots('attack'));
  });

  it('Flankieren gelingt in der Ebene mit Reiterei häufiger als am Fluss', () => {
    const successRate = (terrain: Terrain) => {
      let s = 0;
      for (let i = 0; i < 200; i++) {
        const r = battle({ attacker: side(units({ kiba: 3, katana: 2 }), { tactic: 'flank', stars: 3 }), defender: side(units({ samurai_yari: 4 })), terrain }, i);
        if (r.flank?.[0].success) s++;
      }
      return s / 200;
    };
    expect(successRate('plains')).toBeGreaterThan(successRate('river') + 0.15);
  });

  it('gegen Burgmauern wird nicht flankiert', () => {
    const r = battle({ attacker: side(units({ kiba: 3 }), { tactic: 'flank' }), defender: side(units({ ashigaru_yari: 2 })), castleLevel: 2 }, 1);
    expect(r.flank).toBeUndefined();
    expect(r.report[0].lines.join(' ')).toMatch(/nicht flankieren/);
  });
});

describe('Schlachtbericht', () => {
  it('enthält alle Phasen in der richtigen Reihenfolge', () => {
    const r = battle({ attacker: side(units({ kiba: 2, yumi: 2, samurai_yari: 2 })), defender: side(units({ ashigaru_yari: 3, yumi: 2 })) }, 5);
    expect(r.report.map((p) => p.id)).toEqual(['deploy', 'ranged', 'charge', 'melee', 'morale', 'pursuit', 'result']);
    for (const p of r.report) expect(p.lines.length).toBeGreaterThan(0);
  });

  it('spricht den Spieler mit "Eure" an', () => {
    const r = simulateBattle({
      attacker: side(units({ samurai_yari: 3 }), { clanName: 'Akagane' }),
      defender: side(units({ kiba: 3 }), { clanName: 'Matsukaze' }),
      terrain: 'plains', season: 'spring', seed: 2, perspective: 'attacker',
    });
    const text = r.report.flatMap((p) => p.lines).join('\n');
    expect(text).toMatch(/Eure Samurai-Speere/);
    expect(text).toMatch(/Reiter(n)? der Matsukaze/);
  });
});
