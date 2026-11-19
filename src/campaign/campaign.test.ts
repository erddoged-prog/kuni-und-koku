import { describe, expect, it } from 'vitest';
import { BUILDINGS, CAMPAIGN, CAPITAL_ID, CLANS, NEUTRAL_CLAN, PROVINCES, PROVINCE_IDS, UNIT_TYPES, relationKey } from '../data';
import type { Army, GameState, Unit } from '../data/types';
import {
  assault, armiesIn, canMove, cancelQueueItem, clanIncome, clanUpkeep, createInitialState, declareWar, deserialize,
  endTurn, legalMoves, mergeArmies, moveArmy, newUnit, proposeAlliance, proposePeace, provinceIncome, provincesOf,
  queueBuilding, queueUnit, relation, sendGift, serialize, transferUnits, checkVictory, recruitAgent,
} from './index';

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const fresh = (clan = 'akagane', seed = 42) => createInitialState(clan, seed);

const units = (spec: Record<string, number>): Unit[] =>
  Object.entries(spec).flatMap(([t, n]) => Array.from({ length: n }, () => newUnit(t)));

/** Stellt eine Armee direkt in den Zustand (mutiert s – nur für Testaufbau). */
function placeArmy(s: GameState, owner: string, location: string, spec: Record<string, number>, stars = 3): Army {
  const id = `t${s.nextId++}`;
  const a: Army = { id, owner, location, general: { id: `g${id}`, name: `General ${id}`, stars, xp: 0 }, units: units(spec), moved: false, stance: 'hold' };
  s.armies[id] = a;
  return a;
}

const daimyoArmy = (s: GameState, clan: string) => Object.values(s.armies).find((a) => a.owner === clan && a.general.isDaimyo)!;

/** Runden beenden (ohne KI). */
const skip = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) s = endTurn(s).state;
  return s;
};

const STRONG = { katana: 4, samurai_yari: 4, yumi: 4 };

// ---------------------------------------------------------------------------
describe('Startzustand', () => {
  it('jede Provinz hat einen Besitzer, Clans ihre Startprovinzen', () => {
    const s = fresh();
    expect(Object.keys(s.provinces).sort()).toEqual([...PROVINCE_IDS].sort());
    for (const c of Object.values(CLANS)) for (const p of c.startProvinces) expect(s.provinces[p].owner).toBe(c.id);
    expect(s.provinces[CAPITAL_ID].owner).toBe(NEUTRAL_CLAN);
    expect(s.clans.akagane.isPlayer).toBe(true);
    expect(s.clans.akagane.treasury).toBe(CAMPAIGN.startTreasury);
  });

  it('jeder Clan hat einen Daimyo mit Armee in der Heimat', () => {
    const s = fresh();
    for (const c of Object.values(CLANS).filter((c) => c.playable)) {
      const a = daimyoArmy(s, c.id);
      expect(a.location).toBe(c.homeProvince);
      expect(a.units.length).toBeGreaterThan(0);
    }
  });

  it('nicht spielbare Clans werden abgelehnt', () => {
    expect(() => createInitialState(NEUTRAL_CLAN, 1)).toThrow();
  });

  it('Unabhängige sind mit allen im Krieg', () => {
    const s = fresh();
    expect(relation(s, 'akagane', NEUTRAL_CLAN).state).toBe('war');
  });
});

describe('Wirtschaft', () => {
  it('Einkommen = Koku × (1 + Gebäudebonus) × Jahreszeit', () => {
    const s = fresh();
    // Owari: Reisfelder Stufe 2 durch Clan-Bonus (+40 %)
    expect(s.provinces.owari.buildings.farm).toBe(2);
    expect(provinceIncome(s, 'owari')).toBe(Math.round(PROVINCES.owari.koku * 1.4));
    expect(provinceIncome(s, 'owari', 2)).toBe(Math.round(PROVINCES.owari.koku * 1.4 * 1.25)); // Herbst
    expect(provinceIncome(s, 'owari', 3)).toBe(Math.round(PROVINCES.owari.koku * 1.4 * 0.5)); // Winter
  });

  it('belagerte Provinzen bringen nichts ein', () => {
    const s = fresh();
    s.provinces.mino.siege = { besieger: 'matsukaze', turns: 0 };
    expect(provinceIncome(s, 'mino')).toBe(0);
  });

  it('Unterhalt: Armeen voll, Garnisonen zur Hälfte', () => {
    const s = fresh();
    const army = daimyoArmy(s, 'akagane').units.reduce((a, u) => a + UNIT_TYPES[u.type].upkeep, 0);
    const garrison = [...s.provinces.owari.garrison, ...s.provinces.mino.garrison].reduce((a, u) => a + UNIT_TYPES[u.type].upkeep, 0);
    expect(clanUpkeep(s, 'akagane')).toBe(Math.round(army + garrison * CAMPAIGN.garrisonUpkeepShare));
  });

  it('am Rundenende wird Einkommen minus Unterhalt verbucht', () => {
    const s = fresh();
    const expected = s.clans.akagane.treasury + clanIncome(s, 'akagane') - clanUpkeep(s, 'akagane');
    expect(endTurn(s).state.clans.akagane.treasury).toBe(expected);
  });

  it('bei Schulden desertieren Truppen', () => {
    const s = fresh();
    s.clans.akagane.treasury = -5000;
    const before = daimyoArmy(s, 'akagane').units.reduce((a, u) => a + u.men, 0);
    const after = daimyoArmy(endTurn(s).state, 'akagane').units.reduce((a, u) => a + u.men, 0);
    expect(after).toBeLessThan(before);
  });
});

describe('Bauen', () => {
  it('kostet sofort, ist nach der Bauzeit fertig', () => {
    let s = fresh();
    const res = queueBuilding(s, 'akagane', 'mino', 'farm');
    expect(res.ok).toBe(true);
    expect(res.state.clans.akagane.treasury).toBe(s.clans.akagane.treasury - BUILDINGS.farm.levels[0].cost);
    s = res.state;
    expect(s.provinces.mino.buildings.farm ?? 0).toBe(0);
    s = skip(s, BUILDINGS.farm.levels[0].buildTime);
    expect(s.provinces.mino.buildings.farm).toBe(1);
  });

  it('die Eingabe bleibt unverändert (reine Funktion)', () => {
    const s = fresh();
    const copy = structuredClone(s);
    queueBuilding(s, 'akagane', 'mino', 'farm');
    endTurn(s);
    expect(s).toEqual(copy);
  });

  it('Voraussetzungen werden geprüft', () => {
    const s = fresh();
    // Mino hat nur Burg 1 -> kein Dojo (braucht Burg 2)
    const r = queueBuilding(s, 'akagane', 'mino', 'sword_dojo');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Bergburg/);
    expect(queueBuilding(s, 'akagane', 'owari', 'sword_dojo').ok).toBe(true);
    expect(queueBuilding(s, 'akagane', 'ise', 'farm').ok).toBe(false); // fremde Provinz
  });

  it('Stufen inkl. eingereihter Aufträge werden nicht überschritten', () => {
    let s = fresh();
    s.clans.akagane.treasury = 99999;
    s = queueBuilding(s, 'akagane', 'owari', 'farm').state; // Stufe 3
    const r = queueBuilding(s, 'akagane', 'owari', 'farm');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Höchste Stufe/);
  });

  it('Bauschlange: Gebäude nacheinander, Einheiten parallel dazu', () => {
    let s = fresh();
    s.clans.akagane.treasury = 99999;
    s = queueBuilding(s, 'akagane', 'mino', 'farm').state; // 1 Runde
    s = queueBuilding(s, 'akagane', 'mino', 'bow_dojo').state; // 2 Runden, startet danach
    s = queueUnit(s, 'akagane', 'mino', 'ashigaru_yari').state; // 1 Runde, parallel
    s = skip(s, 1);
    expect(s.provinces.mino.buildings.farm).toBe(1);
    expect(s.provinces.mino.buildings.bow_dojo ?? 0).toBe(0);
    expect(s.provinces.mino.garrison.length).toBe(2); // neue Ashigaru in der Garnison
    s = skip(s, 2);
    expect(s.provinces.mino.buildings.bow_dojo).toBe(1);
  });

  it('Abbrechen erstattet voll – auch abhängige spätere Stufen', () => {
    let s = fresh();
    s.clans.akagane.treasury = 5000;
    s = queueBuilding(s, 'akagane', 'mino', 'castle').state; // Stufe 2
    s = queueBuilding(s, 'akagane', 'mino', 'castle').state; // Stufe 3
    expect(s.clans.akagane.treasury).toBe(5000 - BUILDINGS.castle.levels[1].cost - BUILDINGS.castle.levels[2].cost);
    s = cancelQueueItem(s, 'akagane', 'mino', 0).state;
    expect(s.provinces.mino.queue).toEqual([]);
    expect(s.clans.akagane.treasury).toBe(5000);
  });
});

describe('Rekrutieren', () => {
  it('braucht das passende Gebäude', () => {
    const s = fresh();
    expect(queueUnit(s, 'akagane', 'owari', 'kiba').ok).toBe(false); // kein Stall
    expect(queueUnit(s, 'akagane', 'owari', 'samurai_yari').ok).toBe(true); // Speerschule vorhanden
  });

  it('Arkebusiere erst ab 1548', () => {
    const s = fresh();
    s.provinces.owari.buildings.barracks = 2;
    expect(queueUnit(s, 'akagane', 'owari', 'teppo').message).toMatch(/1548/);
    s.turn = 3 * 4;
    expect(queueUnit(s, 'akagane', 'owari', 'teppo').ok).toBe(true);
  });

  it('neue Einheiten stoßen zur Armee vor Ort; Dojo gibt Erfahrung', () => {
    let s = fresh('kurogane');
    s.clans.kurogane.treasury = 5000;
    const army = daimyoArmy(s, 'kurogane');
    const n = army.units.length;
    s = queueUnit(s, 'kurogane', 'satsuma', 'katana').state;
    s = skip(s, UNIT_TYPES.katana.recruitTime);
    const units = daimyoArmy(s, 'kurogane').units;
    expect(units.length).toBe(n + 1);
    expect(units[n].type).toBe('katana');
    expect(units[n].experience).toBe(1); // Dojo Stufe 1
  });
});

describe('Armeen umgliedern', () => {
  it('Einheiten aus der Garnison in eine neue Armee', () => {
    const s = fresh();
    const r = transferUnits(s, 'akagane', 'owari', 'garrison', 'new', [0, 1]);
    expect(r.ok).toBe(true);
    expect(r.state.provinces.owari.garrison.length).toBe(0);
    const created = armiesIn(r.state, 'owari', 'akagane').find((a) => !a.general.isDaimyo)!;
    expect(created.units.length).toBe(2);
    expect(created.general.stars).toBe(1);
  });

  it('Armeen vereinigen; leere Armeen verschwinden', () => {
    let s = fresh();
    s = transferUnits(s, 'akagane', 'owari', 'garrison', 'new', [0]).state;
    const small = armiesIn(s, 'owari', 'akagane').find((a) => !a.general.isDaimyo)!;
    const big = daimyoArmy(s, 'akagane');
    s = mergeArmies(s, 'akagane', small.id, big.id).state;
    expect(s.armies[small.id]).toBeUndefined();
    expect(s.armies[big.id].general.isDaimyo).toBe(true);
    expect(s.armies[big.id].units.length).toBe(6);
  });

  it('Höchstgrenzen werden eingehalten', () => {
    const s = fresh();
    const a = daimyoArmy(s, 'akagane');
    a.units = units({ ashigaru_yari: CAMPAIGN.maxUnitsPerArmy });
    expect(transferUnits(s, 'akagane', 'owari', 'garrison', { army: a.id }, [0]).ok).toBe(false);
  });
});

describe('Bewegung', () => {
  it('nur in Nachbarprovinzen, einmal pro Runde', () => {
    let s = fresh();
    const a = daimyoArmy(s, 'akagane');
    expect(canMove(s, a.id, 'yamashiro').ok).toBe(false);
    const r = moveArmy(s, a.id, 'mino');
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.armies[a.id].location).toBe('mino');
    expect(canMove(s, a.id, 'owari').reason).toMatch(/schon bewegt/);
    s = endTurn(s).state;
    expect(canMove(s, a.id, 'owari').ok).toBe(true);
  });

  it('im Winter sind Seewege gesperrt', () => {
    const s = fresh('murasaki');
    const a = daimyoArmy(s, 'murasaki'); // in Aki, Seeweg nach Iyo
    expect(canMove(s, a.id, 'iyo').ok).toBe(true);
    s.turn = 3;
    expect(canMove(s, a.id, 'iyo').reason).toMatch(/Winter/);
  });

  it('Frieden verhindert den Einmarsch, nach Kriegserklärung geht es', () => {
    let s = fresh();
    s.armies[daimyoArmy(s, 'akagane').id].location = 'mino';
    const a = daimyoArmy(s, 'akagane');
    expect(canMove(s, a.id, 'shinano').ok).toBe(false);
    s = declareWar(s, 'akagane', 'matsukaze').state;
    expect(canMove(s, a.id, 'shinano')).toMatchObject({ ok: true, hostile: true });
  });

  it('legalMoves listet Ziele und markiert feindliche', () => {
    const s = fresh();
    const moves = legalMoves(s, daimyoArmy(s, 'akagane').id);
    expect(moves.find((m) => m.to === 'mino')?.hostile).toBe(false);
    expect(moves.find((m) => m.to === 'ise')?.hostile).toBe(true);
  });
});

describe('Kampf, Belagerung, Eroberung', () => {
  it('Provinz ohne Burg: Schlacht gegen die Garnison, dann Einnahme', () => {
    const s = fresh();
    s.provinces.ise.buildings = {};
    const a = placeArmy(s, 'akagane', 'owari', STRONG);
    const r = moveArmy(s, a.id, 'ise');
    expect(r.battles.length).toBe(1);
    expect(r.battles[0].result.winner).toBe('attacker');
    expect(r.state.provinces.ise.owner).toBe('akagane');
    expect(r.state.armies[a.id].location).toBe('ise');
    expect(r.battles[0].result.report.length).toBeGreaterThan(3);
  });

  it('Provinz mit Burg: Belagerung, nach Ablauf der Vorräte ergibt sich die Garnison', () => {
    let s = fresh();
    const a = placeArmy(s, 'akagane', 'owari', STRONG);
    s = moveArmy(s, a.id, 'ise').state;
    expect(s.provinces.ise.owner).toBe(NEUTRAL_CLAN);
    expect(s.provinces.ise.siege).toEqual({ besieger: 'akagane', turns: 0 });
    const supply = BUILDINGS.castle.levels[0].supplyTurns!;
    s = skip(s, supply - 1);
    expect(s.provinces.ise.owner).toBe(NEUTRAL_CLAN);
    s = skip(s, 1);
    expect(s.provinces.ise.owner).toBe('akagane');
    expect(s.provinces.ise.siege).toBeUndefined();
  });

  it('Belagerung endet, wenn der Belagerer abzieht', () => {
    let s = fresh();
    const a = placeArmy(s, 'akagane', 'owari', STRONG);
    s = moveArmy(s, a.id, 'ise').state;
    s = endTurn(s).state;
    s = moveArmy(s, a.id, 'owari').state;
    s = endTurn(s).state;
    expect(s.provinces.ise.siege).toBeUndefined();
    expect(s.provinces.ise.owner).toBe(NEUTRAL_CLAN);
  });

  it('Sturm: starke Armee nimmt die Burg, schwache scheitert und weicht', () => {
    let s = fresh();
    const a = placeArmy(s, 'akagane', 'owari', STRONG);
    s = moveArmy(s, a.id, 'ise').state;
    expect(assault(s, a.id).ok).toBe(false); // schon bewegt
    s = endTurn(s).state;
    const won = assault(s, a.id);
    expect(won.battles[0].kind).toBe('assault');
    expect(won.state.provinces.ise.owner).toBe('akagane');

    let w = fresh();
    w.provinces.ise.buildings.castle = 3;
    w.provinces.ise.garrison = units({ samurai_yari: 4, yumi: 2 });
    const weak = placeArmy(w, 'akagane', 'owari', { ashigaru_yari: 3 }, 1);
    w = moveArmy(w, weak.id, 'ise').state;
    w = endTurn(w).state;
    const lost = assault(w, weak.id);
    expect(lost.state.provinces.ise.owner).toBe(NEUTRAL_CLAN);
    expect(lost.state.provinces.ise.siege).toBeUndefined();
    if (lost.state.armies[weak.id]) expect(lost.state.armies[weak.id].location).toBe('owari');
  });

  it('verlorener Angriff: die Armee kehrt in die Ausgangsprovinz zurück', () => {
    let s = fresh();
    s = declareWar(s, 'akagane', 'matsukaze').state;
    const weak = placeArmy(s, 'akagane', 'mino', { ashigaru_yari: 1 }, 1);
    placeArmy(s, 'matsukaze', 'shinano', STRONG, 4);
    const r = moveArmy(s, weak.id, 'shinano');
    expect(r.battles[0].result.winner).toBe('defender');
    if (r.state.armies[weak.id]) expect(r.state.armies[weak.id].location).toBe('mino');
    expect(r.state.provinces.shinano.owner).toBe('matsukaze');
  });

  it('besiegte Verteidiger ziehen sich zurück; ohne Ausweg werden sie aufgerieben', () => {
    let s = fresh();
    s = declareWar(s, 'akagane', 'matsukaze').state;
    const strong = placeArmy(s, 'akagane', 'mino', STRONG, 5);
    const def = placeArmy(s, 'matsukaze', 'shinano', { ashigaru_yari: 1 }, 1);
    const r = moveArmy(s, strong.id, 'shinano');
    expect(r.battles[0].result.winner).toBe('attacker');
    const d = r.state.armies[def.id];
    if (d) {
      expect(d.location).not.toBe('shinano');
      expect(r.state.provinces[d.location].owner).toBe('matsukaze');
    }
    // Shinano hat eine Burg mit Garnison -> Belagerung
    expect(r.state.provinces.shinano.siege?.besieger).toBe('akagane');
  });

  it('Entsatz: ein Sieg über den Belagerer hebt die Belagerung auf', () => {
    let s = fresh();
    s = declareWar(s, 'akagane', 'matsukaze').state;
    const besieger = placeArmy(s, 'matsukaze', 'mino', { ashigaru_yari: 2 }, 1);
    s.provinces.mino.siege = { besieger: 'matsukaze', turns: 0 };
    besieger.moved = false;
    const relief = placeArmy(s, 'akagane', 'owari', STRONG, 4);
    const r = moveArmy(s, relief.id, 'mino');
    expect(r.battles[0].result.winner).toBe('attacker');
    expect(r.state.provinces.mino.siege).toBeUndefined();
    expect(r.state.provinces.mino.owner).toBe('akagane');
  });

  it('Kampagne ist deterministisch: gleicher Seed + gleiche Züge => gleicher Zustand', () => {
    const play = () => {
      let s = fresh('akagane', 7);
      s.provinces.ise.buildings = {};
      const a = daimyoArmy(s, 'akagane');
      s = moveArmy(s, a.id, 'ise').state;
      return skip(s, 3);
    };
    expect(play()).toEqual(play());
  });
});

describe('Rundenablauf', () => {
  it('4 Runden = 1 Jahr', () => {
    const s = skip(fresh(), 4);
    expect(s.turn).toBe(4);
  });

  it('Winter-Zermürbung trifft Armeen in fremden Provinzen', () => {
    let s = fresh();
    s.turn = 3; // Winter
    const out = placeArmy(s, 'akagane', 'yamashiro', { samurai_yari: 2 });
    s.provinces.yamashiro.owner = 'matsukaze'; // fremd (Frieden), damit keine Belagerung o. Ä.
    const home = daimyoArmy(s, 'akagane');
    const homeMen = home.units.reduce((a, u) => a + u.men, 0);
    s = endTurn(s).state;
    expect(s.armies[out.id].units[0].men).toBe(Math.floor(60 * (1 - 0.08)));
    expect(s.armies[home.id].units.reduce((a, u) => a + u.men, 0)).toBe(homeMen);
  });

  it('angeschlagene Einheiten füllen sich in eigenen Provinzen auf', () => {
    let s = fresh();
    const a = daimyoArmy(s, 'akagane');
    a.units[0].men = 10;
    s = endTurn(s).state;
    const max = UNIT_TYPES[a.units[0].type].men;
    expect(s.armies[a.id].units[0].men).toBe(10 + Math.ceil(max * CAMPAIGN.replenishRate));
  });

  it('die KI-Schnittstelle wird für jeden lebenden KI-Clan aufgerufen', () => {
    const called: string[] = [];
    endTurn(fresh(), (state, clan) => {
      called.push(clan);
      return { state, ok: true, battles: [] };
    });
    expect(called.sort()).toEqual(['aoyama', 'kitakaze', 'kurogane', 'matsukaze', 'murasaki']);
  });
});

describe('Diplomatie', () => {
  it('Kriegserklärung: Verbündete des Opfers treten bei', () => {
    const s = declareWar(fresh(), 'akagane', 'aoyama').state; // Aoyama ist mit Matsukaze verbündet
    expect(relation(s, 'akagane', 'aoyama').state).toBe('war');
    expect(relation(s, 'akagane', 'matsukaze').state).toBe('war');
    expect(relation(s, 'akagane', 'aoyama').value).toBeLessThan(0);
  });

  it('Frieden: Unterlegene nehmen an, Überlegene mit schlechter Beziehung lehnen ab', () => {
    let s = fresh();
    s = declareWar(s, 'akagane', 'kitakaze').state;
    // Akagane übermächtig -> Kitakaze nimmt an
    placeArmy(s, 'akagane', 'owari', { katana: 12 });
    placeArmy(s, 'akagane', 'mino', { katana: 12 });
    expect(proposePeace(s, 'akagane', 'kitakaze').ok).toBe(true);
    // Kitakaze übermächtig + Beziehung schlecht -> lehnt ab
    let t = declareWar(fresh(), 'akagane', 'kitakaze').state;
    placeArmy(t, 'kitakaze', 'echigo', { katana: 12 });
    placeArmy(t, 'kitakaze', 'dewa', { katana: 12 });
    t = proposePeace(t, 'akagane', 'kitakaze').state;
    expect(relation(t, 'akagane', 'kitakaze').state).toBe('war');
  });

  it('Allianz braucht gute Beziehungen; Geschenke helfen', () => {
    let s = fresh();
    expect(proposeAlliance(s, 'akagane', 'kurogane').ok).toBe(false);
    s.clans.akagane.treasury = 5000;
    s = sendGift(s, 'akagane', 'kurogane', 1000).state;
    expect(relation(s, 'akagane', 'kurogane').value).toBe(40);
    expect(proposeAlliance(s, 'akagane', 'kurogane').ok).toBe(true);
  });

  it('mit den Unabhängigen gibt es keine Verhandlungen', () => {
    expect(proposePeace(fresh(), 'akagane', NEUTRAL_CLAN).ok).toBe(false);
  });

  it('Krieg ermüdet: der Beziehungswert steigt langsam Richtung 0', () => {
    let s = declareWar(fresh(), 'akagane', 'kurogane').state;
    const v0 = relation(s, 'akagane', 'kurogane').value;
    s = skip(s, 5);
    expect(relation(s, 'akagane', 'kurogane').value).toBe(v0 + 5);
    expect(s.diplomacy[relationKey('akagane', 'kurogane')].state).toBe('war');
  });

  it('Agenten sind ein Platzhalter', () => {
    const r = recruitAgent(fresh(), 'akagane', 'owari', 'ninja');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Prototyp/);
  });
});

describe('Siegbedingung', () => {
  it('Kyōto + genug Provinzen = Sieg', () => {
    const s = fresh();
    const mine = PROVINCE_IDS.filter((p) => !Object.values(CLANS).some((c) => c.playable && c.id !== 'akagane' && c.startProvinces.includes(p)));
    for (const p of mine.slice(0, CAMPAIGN.victoryProvinces)) s.provinces[p].owner = 'akagane';
    s.provinces[CAPITAL_ID].owner = 'akagane';
    expect(provincesOf(s, 'akagane').length).toBeGreaterThanOrEqual(CAMPAIGN.victoryProvinces);
    checkVictory(s);
    expect(s.winner).toBe('akagane');
  });

  it('ohne Kyōto kein Sieg trotz vieler Provinzen', () => {
    const s = fresh();
    for (const p of PROVINCE_IDS.filter((p) => p !== CAPITAL_ID).slice(0, 20)) s.provinces[p].owner = 'akagane';
    checkVictory(s);
    expect(s.winner).toBeUndefined();
  });

  it('wer alle Rivalen vernichtet, gewinnt; Vernichtete werden markiert', () => {
    let s = fresh();
    for (const p of Object.values(s.provinces)) if (p.owner !== NEUTRAL_CLAN) p.owner = 'akagane';
    for (const a of Object.values(s.armies)) if (a.owner !== 'akagane') delete s.armies[a.id];
    s = endTurn(s).state;
    expect(s.clans.kurogane.defeated).toBe(true);
    expect(s.winner).toBe('akagane');
  });
});

describe('Speichern & Laden', () => {
  it('Roundtrip über JSON ergibt denselben Zustand', () => {
    let s = fresh();
    s = queueBuilding(s, 'akagane', 'mino', 'farm').state;
    s = skip(s, 2);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('ungültige Daten werden abgelehnt', () => {
    expect(() => deserialize('kein json')).toThrow(/JSON/);
    expect(() => deserialize('{"foo":1}')).toThrow(/Kuni/);
    const bad = JSON.parse(serialize(fresh()));
    bad.provinces.owari.owner = 'gibtsnicht';
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/Provinz/);
  });
});
