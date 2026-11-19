// Kampfsimulation: reine Funktion simulateBattle(input) -> BattleResult.
// Phasen: Aufmarsch (Flanke) → Fernkampf → Ansturm → Nahkampf-Runden
//         → Moralprüfung → Flucht/Verfolgung → Ergebnis.
// Deterministisch: Alle Zufälle kommen aus dem geseedeten RNG, die
// Iterationsreihenfolge ist fest.

import { BUILDINGS, CHARGE_VS_ROLE, COMBAT, COUNTERS, SEASONS, TACTICS, TERRAIN, UNIT_TYPES } from '../data';
import type { TacticDef } from '../data/config';
import type { UnitType } from '../data/types';
import { createRng } from './rng';
import { Narrator, pct } from './report';
import type { BattleInput, BattleResult, BattleSideInput, ReportPhase, Side, SideOutcome, UnitOutcome } from './types';

/** Einheit während der Schlacht (veränderlich, nur intern). */
interface CU {
  side: Side;
  index: number;
  def: UnitType;
  men: number;
  startMen: number;
  exp: number;
  morale: number;
  routed: boolean;
  killed: number;
  captured: number;
  /** Mannstärke zu Beginn der aktuellen Phase (für Moralverlust). */
  phaseStartMen: number;
  target: CU | null;
}

interface SideMods {
  tactic: TacticDef;
  general: number;
  /** Multiplikator auf Nahkampf und Ansturm durch (gelungenes) Flankieren. */
  flank: number;
  /** Multiplikator auf die eigene Verteidigung (misslungene Flanke etc.). */
  defense: number;
}

const other = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');
const alive = (u: CU) => u.men > 0 && !u.routed;
const L = COMBAT.baseLethality;

export function simulateBattle(input: BattleInput): BattleResult {
  const rng = createRng(input.seed);
  const terrain = TERRAIN[input.terrain];
  const season = SEASONS.find((s) => s.id === input.season)!;
  const castleLevel = input.castleLevel ?? 0;
  const castle = castleLevel > 0 ? BUILDINGS.castle.levels[castleLevel - 1] : undefined;
  const siegeDefense = castle?.siegeDefense ?? 0;
  const sides: Record<Side, BattleSideInput> = { attacker: input.attacker, defender: input.defender };
  const nar = new Narrator(input.perspective, { attacker: input.attacker.clanName, defender: input.defender.clanName });

  // Taktik-Korrekturen: Hinter Mauern kann man weder flankieren noch fliehen.
  let attTactic = TACTICS[input.attacker.tactic];
  let defTactic = TACTICS[input.defender.tactic];
  const deployLines: string[] = [];
  if (castle && attTactic.id === 'flank') {
    attTactic = TACTICS.attack;
    deployLines.push('Gegen Burgmauern lässt sich nicht flankieren – der Angriff erfolgt frontal.');
  }
  if (castle && (defTactic.id === 'retreat' || defTactic.id === 'flank')) {
    defTactic = TACTICS.hold;
    deployLines.push('Die Garnison ist eingeschlossen und muss die Mauern halten.');
  }

  // "general" bündelt General-Sterne und das Kriegsglück der Seite.
  const mods: Record<Side, SideMods> = {
    attacker: { tactic: attTactic, general: (1 + (input.attacker.stars - 1) * COMBAT.combatPerStar) * rng.spread(COMBAT.sideLuck), flank: 1, defense: 1 },
    defender: { tactic: defTactic, general: (1 + (input.defender.stars - 1) * COMBAT.combatPerStar) * rng.spread(COMBAT.sideLuck), flank: 1, defense: 1 },
  };

  // --- Einheiten aufstellen ------------------------------------------------
  const units: Record<Side, CU[]> = { attacker: [], defender: [] };
  for (const side of ['attacker', 'defender'] as Side[]) {
    const s = sides[side];
    s.units.forEach((u, index) => {
      const def = UNIT_TYPES[u.type];
      let morale =
        def.morale +
        u.experience * COMBAT.moralePerExperience +
        (s.stars - 1) * COMBAT.moralePerStar +
        mods[side].tactic.moraleMod;
      if (side === 'attacker') morale += season.attackerMoraleMod;
      if (side === 'defender' && castle) morale += COMBAT.castleMoraleBonus;
      units[side].push({
        side, index, def, men: u.men, startMen: u.men, exp: u.experience, morale,
        routed: u.men <= 0, killed: 0, captured: 0, phaseStartMen: u.men, target: null,
      });
    });
  }
  const all = () => [...units.attacker, ...units.defender];
  const men = (side: Side) => units[side].reduce((a, u) => a + u.men, 0);
  const activeMen = (side: Side) => units[side].filter(alive).reduce((a, u) => a + u.men, 0);
  const cavShare = (side: Side) => {
    const tot = activeMen(side);
    if (!tot) return 0;
    return units[side].filter((u) => alive(u) && u.def.role === 'cavalry').reduce((a, u) => a + u.men, 0) / tot;
  };
  const startPower = { attacker: sidePower(units.attacker, mods.attacker), defender: sidePower(units.defender, mods.defender) };

  // --- Phase 0: Aufmarsch --------------------------------------------------
  const report: ReportPhase[] = [];
  deployLines.unshift(
    `${input.attacker.clanName} (${input.attacker.generalName}, ${'★'.repeat(input.attacker.stars)}) greifen ${input.defender.clanName} (${input.defender.generalName}, ${'★'.repeat(input.defender.stars)}) an – ${men('attacker')} gegen ${men('defender')} Mann.`,
    `Gelände: ${terrain.name}. ${terrain.description}`,
  );
  if (castle) deployLines.push(`Die Verteidiger stehen hinter den Mauern: ${castle.name}.`);
  if (season.id === 'winter') deployLines.push('Bittere Winterkälte zehrt an der Moral der Angreifer.');
  if (season.id === 'summer' && hasGuns(units)) deployLines.push('Sommerregen macht die Lunten der Arkebusen feucht.');
  for (const side of ['attacker', 'defender'] as Side[]) {
    deployLines.push(nar.tacticLine(side, mods[side].tactic));
  }

  const flankResults: { side: Side; success: boolean }[] = [];
  for (const side of ['attacker', 'defender'] as Side[]) {
    const t = mods[side].tactic;
    if (t.id !== 'flank') continue;
    const enemy = other(side);
    let p = 0.45 + 0.08 * (sides[side].stars - sides[enemy].stars) + cavShare(side) * 0.4 + (terrain.flankMod - 1) * 0.6;
    if (mods[enemy].tactic.id === 'hold') p -= 0.1;
    p = Math.min(0.9, Math.max(0.1, p));
    const success = rng.chance(p);
    flankResults.push({ side, success });
    if (success) {
      mods[side].flank = 1 + t.flankBonus * terrain.flankMod;
      for (const u of units[enemy]) u.morale -= 1.5;
      deployLines.push(nar.flankLine(side, true, terrain.name));
    } else {
      mods[side].defense *= 1 - t.flankRisk * 0.6;
      for (const u of units[side]) u.morale -= 1;
      deployLines.push(nar.flankLine(side, false, terrain.name));
    }
  }
  report.push({ id: 'deploy', title: 'Aufmarsch', lines: deployLines });

  // Verteidigungsfaktor eines Ziels.
  const defenseFactor = (t: CU, armorPiercing = false) => {
    let f = (1 + t.def.defense * (armorPiercing ? 0.08 : 0.12) * (1 + t.exp * 0.03)) * mods[t.side].tactic.defenseMod * mods[t.side].defense;
    if (t.side === 'defender') f *= terrain.defenderDefense * (1 + siegeDefense);
    return f;
  };
  const expMod = (u: CU) => 1 + u.exp * COMBAT.combatPerExperience;

  // Zielauswahl: Einheiten suchen bevorzugt Gegner, gegen die sie im Vorteil sind.
  const pickTarget = (u: CU, kind: 'ranged' | 'melee'): CU | null => {
    const enemies = units[other(u.side)].filter(alive);
    if (!enemies.length) return null;
    const role = kind === 'ranged' ? 'ranged' : u.def.role;
    const k = u.def.role === 'cavalry' ? 2.5 : kind === 'ranged' ? 1.5 : 1;
    const w = enemies.map((e) => e.men * Math.pow(COUNTERS[role][e.def.role], k));
    return enemies[rng.weighted(w)] ?? enemies[0];
  };

  const beginPhase = () => all().forEach((u) => (u.phaseStartMen = u.men));
  const routEvents: { u: CU; reason: string }[] = [];

  /** Moralverlust durch Verluste in dieser Phase + Fluchtprüfung. */
  const moraleCheck = (phaseName: string) => {
    for (const side of ['attacker', 'defender'] as Side[]) {
      const lossRatioSide = 1 - men(side) / Math.max(1, sides[side].units.reduce((a, u) => a + u.men, 0));
      for (const u of units[side]) {
        if (!alive(u)) continue;
        const lost = u.phaseStartMen - u.men;
        u.morale -= COMBAT.moraleLossPer10Pct * (lost / Math.max(1, u.phaseStartMen)) * 10;
        if (lossRatioSide > 0.4) u.morale -= 0.5;
      }
      // Fluchtprüfung, Ansteckung durch fliehende Nachbarn
      let newRouts = 0;
      for (const u of units[side]) {
        if (!alive(u)) continue;
        if (u.morale <= COMBAT.routThreshold) {
          u.routed = true;
          newRouts++;
          const lostPct = 1 - u.men / Math.max(1, u.startMen);
          routEvents.push({ u, reason: `${phaseName}, ${pct(lostPct)} Verluste` });
        }
      }
      if (newRouts) for (const u of units[side]) if (alive(u)) u.morale -= 0.6 * newRouts;
      // Kläglicher Rest flieht
      const startMen = sides[side].units.reduce((a, u) => a + u.men, 0);
      if (activeMen(side) > 0 && activeMen(side) < startMen * 0.12) {
        for (const u of units[side]) {
          if (alive(u)) {
            u.routed = true;
            routEvents.push({ u, reason: 'die Armee war zerschlagen' });
          }
        }
      }
    }
  };

  /** Schaden gleichzeitig anwenden. */
  const applyHits = (hits: { from: CU; to: CU; dmg: number }[], tally: Tally) => {
    for (const h of hits) {
      const k = Math.min(h.to.men, Math.round(h.dmg));
      if (k <= 0) continue;
      h.to.men -= k;
      h.to.killed += k;
      tally.add(h.from, h.to, k);
    }
  };

  const broken = (side: Side) => activeMen(side) <= 0;
  const retreating = (['attacker', 'defender'] as Side[]).filter((s) => mods[s].tactic.id === 'retreat');

  // --- Phase 1: Fernkampf --------------------------------------------------
  {
    beginPhase();
    const tally = new Tally();
    // Gegen langsames Fußvolk bleibt Zeit für mehr Salven als gegen Reiterei.
    const volleysFor = (side: Side) =>
      retreating.length ? 1 : COMBAT.rangedVolleys + (cavShare(other(side)) < 0.1 ? COMBAT.extraVolleysVsInfantry : 0);
    const volleys = { attacker: volleysFor('attacker'), defender: volleysFor('defender') };
    for (let v = 0; v < Math.max(volleys.attacker, volleys.defender); v++) {
      const hits: { from: CU; to: CU; dmg: number }[] = [];
      for (const u of all()) {
        if (!alive(u) || u.def.ranged <= 0 || v >= volleys[u.side]) continue;
        if (mods[u.side].tactic.id === 'retreat') continue;
        const t = pickTarget(u, 'ranged');
        if (!t) continue;
        let dmg =
          u.men * u.def.ranged * L * COMBAT.rangedLethality * COUNTERS.ranged[t.def.role] * terrain.rangedMod * season.rangedMod *
          mods[u.side].tactic.rangedMod * mods[u.side].general * expMod(u) * rng.spread(COMBAT.randomSpread);
        if (u.def.gunpowder) dmg *= season.gunpowderMod;
        if (u.side === 'defender' && castle) dmg *= 1 + siegeDefense * 0.5;
        hits.push({ from: u, to: t, dmg: dmg / defenseFactor(t, !!u.def.gunpowder) });
      }
      applyHits(hits, tally);
    }
    moraleCheck('unter Beschuss');
    const lines = tally.lines(nar, 'ranged');
    if (!lines.length) lines.push('Keine Seite hatte nennenswerte Schützen – man ging direkt aufeinander los.');
    report.push({ id: 'ranged', title: 'Fernkampf', lines });
  }

  // --- Rückzug (Taktik) ----------------------------------------------------
  if (retreating.length) {
    const side: Side = retreating.includes('attacker') ? 'attacker' : 'defender';
    return finishWithRetreat(side);
  }

  // --- Phase 2: Ansturm ----------------------------------------------------
  {
    beginPhase();
    const tally = new Tally();
    const hits: { from: CU; to: CU; dmg: number }[] = [];
    for (const u of all()) {
      if (!alive(u) || u.def.charge <= 0 || u.def.role === 'ranged') continue;
      const t = pickTarget(u, 'melee');
      if (!t) continue;
      u.target = t;
      let charge = u.def.charge * mods[u.side].tactic.chargeMod * mods[u.side].flank;
      if (u.def.role === 'cavalry') charge *= terrain.cavalryChargeMod;
      if (u.side === 'attacker' && castle) charge *= COMBAT.assaultChargeMod;
      if (charge <= 0) continue;
      const dmg = (u.men * charge * L * CHARGE_VS_ROLE[t.def.role] * mods[u.side].general * expMod(u) * rng.spread(COMBAT.randomSpread)) / defenseFactor(t);
      hits.push({ from: u, to: t, dmg });
      // Gesenkte Speere: Reiter, die in Speere reiten, bezahlen dafür.
      if (u.def.role === 'cavalry' && t.def.role === 'spear') {
        const brace = (t.men * t.def.defense * L * 0.9 * mods[t.side].general * expMod(t)) / defenseFactor(u);
        hits.push({ from: t, to: u, dmg: brace });
      }
    }
    applyHits(hits, tally);
    moraleCheck('beim Ansturm');
    const lines = tally.lines(nar, 'charge');
    if (!lines.length) lines.push('Kein nennenswerter Ansturm – die Linien schoben sich vorsichtig aneinander heran.');
    report.push({ id: 'charge', title: 'Ansturm', lines });
  }

  // --- Phase 3: Nahkampf ---------------------------------------------------
  let rounds = 0;
  {
    const tally = new Tally();
    while (rounds < COMBAT.maxMeleeRounds && !broken('attacker') && !broken('defender')) {
      rounds++;
      beginPhase();
      const hits: { from: CU; to: CU; dmg: number }[] = [];
      for (const u of all()) {
        if (!alive(u)) continue;
        if (!u.target || !alive(u.target)) u.target = pickTarget(u, 'melee');
        const t = u.target;
        if (!t) continue;
        const atk = u.def.role === 'ranged' ? Math.max(u.def.attack, u.def.ranged * 0.3) : u.def.attack;
        let dmg =
          u.men * atk * L * COUNTERS[u.def.role][t.def.role] * mods[u.side].tactic.meleeMod * mods[u.side].flank *
          mods[u.side].general * expMod(u) * rng.spread(COMBAT.randomSpread);
        if (u.side === 'attacker') dmg *= terrain.attackerMeleeMod;
        hits.push({ from: u, to: t, dmg: dmg / defenseFactor(t) });
      }
      applyFrontage(hits);
      applyHits(hits, tally);
      moraleCheck(`im Nahkampf, Runde ${rounds}`);
    }
    const lines = tally.lines(nar, 'melee');
    lines.unshift(`${rounds} ${rounds === 1 ? 'Runde' : 'Runden'} Handgemenge.`);
    report.push({ id: 'melee', title: 'Nahkampf', lines });
  }

  // --- Phase 4: Moralprüfung / Entscheidung --------------------------------
  let winner: Side;
  let loserWithdrew = false;
  const moraleLines: string[] = routEvents.map((e) => nar.routLine(e.u, e.reason));
  if (broken('defender') && !broken('attacker')) winner = 'attacker';
  else if (broken('attacker') && !broken('defender')) winner = 'defender';
  else if (broken('attacker') && broken('defender')) {
    // Beide gebrochen: Wer relativ mehr Männer behalten hat, behauptet das Feld.
    const kept = (s: Side) => men(s) / Math.max(1, units[s].reduce((a, u) => a + u.startMen, 0));
    winner = kept('attacker') > kept('defender') ? 'attacker' : 'defender';
  }
  else {
    // Patt nach allen Runden: Wer mehr Kampfkraft & Moral übrig hat, behauptet das Feld.
    if (castle) {
      winner = 'defender';
      moraleLines.push('Der Sturm lief sich an den Mauern fest – die Angreifer brachen ab.');
    } else {
      const staying = (s: Side) =>
        units[s].filter(alive).reduce((a, u) => a + u.men * (u.def.attack + u.def.defense) * Math.max(0.5, u.morale), 0) * mods[s].general;
      winner = staying('attacker') > staying('defender') * 1.05 ? 'attacker' : 'defender';
      moraleLines.push(`Keine Seite brach. ${nar.sideSubject(other(winner))} ${other(winner) === input.perspective ? 'gebt' : 'geben'} das Feld geordnet auf.`);
    }
    loserWithdrew = true;
  }
  for (const side of ['attacker', 'defender'] as Side[]) {
    if (!broken(side) && sides[side].stars >= 4 && routEvents.some((e) => e.u.side === side)) {
      moraleLines.push(`Die Gegenwart von ${sides[side].generalName} (${'★'.repeat(sides[side].stars)}) hielt die übrigen Reihen zusammen.`);
    }
  }
  if (!moraleLines.length) moraleLines.push('Alle Einheiten hielten ihre Stellung.');
  report.push({ id: 'morale', title: 'Moralprüfung', lines: moraleLines });

  // --- Phase 5: Flucht & Verfolgung ----------------------------------------
  const loser = other(winner);
  {
    const lines: string[] = [];
    const cs = cavShare(winner);
    const garrisonTrapped = castle && loser === 'defender';
    let share = (COMBAT.pursuitKillBase + cs * COMBAT.pursuitCavalryFactor) * rng.spread(0.25);
    share = Math.min(0.65, share);
    let pk = 0, pc = 0;
    for (const u of units[loser]) {
      if (u.men <= 0) continue;
      const s = u.routed ? share : share / 4;
      let k = Math.round(u.men * s * (garrisonTrapped ? 2 : 1));
      k = Math.min(u.men, k);
      let c = Math.round(k * COMBAT.captureShare);
      k -= c;
      if (garrisonTrapped && u.routed) {
        // Eingeschlossene Garnison: wer nicht fällt, ergibt sich.
        c += u.men - k - c;
      }
      u.men -= k + c;
      u.killed += k;
      u.captured += c;
      pk += k;
      pc += c;
    }
    if (garrisonTrapped) lines.push(`Die Burg fiel. ${pk} Verteidiger wurden niedergemacht, ${pc} gerieten in Gefangenschaft.`);
    else if (pk + pc > 0) lines.push(nar.pursuitLine(winner, cs, pk, pc, loserWithdrew));
    else lines.push('Es gab keine nennenswerte Verfolgung.');
    report.push({ id: 'pursuit', title: 'Flucht & Verfolgung', lines });
  }

  return finish(winner, loserWithdrew, rounds);

  // =========================================================================
  function finishWithRetreat(side: Side): BattleResult {
    const enemy = other(side);
    const lines: string[] = [];
    const cs = cavShare(enemy);
    const share = Math.min(0.4, (0.04 + cs * 0.35) * (1 - mods[side].tactic.retreatShare * 0.4) * rng.spread(0.25));
    let k = 0, c = 0;
    for (const u of units[side]) {
      if (u.men <= 0) continue;
      let kk = Math.round(u.men * share);
      const cc = Math.round(kk * 0.25);
      kk -= cc;
      u.men -= kk + cc;
      u.killed += kk;
      u.captured += cc;
      k += kk;
      c += cc;
    }
    lines.push(nar.retreatLine(side, k, c, cs));
    report.push({ id: 'pursuit', title: 'Rückzug', lines });
    return finish(enemy, true, 0);
  }

  function finish(win: Side, loserWithdrew: boolean, meleeRounds: number): BattleResult {
    const lose = other(win);
    const ratio = Math.min(2, Math.max(0.5, startPower[lose] / Math.max(1, startPower[win])));
    const xp: Record<Side, number> = {
      attacker: 0,
      defender: 0,
    };
    xp[win] = Math.round(COMBAT.generalXpPerWin * ratio);
    xp[lose] = meleeRounds > 0 ? 3 : 1;
    const outcome = (side: Side): SideOutcome => {
      const list: UnitOutcome[] = units[side].map((u) => ({
        type: u.def.id,
        menBefore: u.startMen,
        menAfter: u.men,
        killed: u.killed,
        captured: u.captured,
        routed: u.routed,
        experience:
          side === win && u.men > 0 && !u.routed && meleeRounds > 0
            ? Math.min(COMBAT.maxExperience, u.exp + COMBAT.unitXpOnWin)
            : u.exp,
      }));
      return {
        units: list,
        totalBefore: list.reduce((a, u) => a + u.menBefore, 0),
        totalAfter: list.reduce((a, u) => a + u.menAfter, 0),
        killed: list.reduce((a, u) => a + u.killed, 0),
        captured: list.reduce((a, u) => a + u.captured, 0),
        fled: side === lose ? units[side].filter((u) => u.routed).reduce((a, u) => a + u.men, 0) : 0,
        generalXp: xp[side],
        withdrew: side === lose && loserWithdrew,
      };
    };
    const result: BattleResult = {
      winner: win,
      attacker: outcome('attacker'),
      defender: outcome('defender'),
      flank: flankResults.length ? flankResults : undefined,
      meleeRounds,
      report,
    };
    report.push({ id: 'result', title: 'Ergebnis', lines: nar.resultLines(result) });
    return result;
  }
}

/** Frontbreite: Übermacht gegen ein einzelnes Ziel wird gedeckelt. */
function applyFrontage(hits: { from: CU; to: CU; dmg: number }[]) {
  const byTarget = new Map<CU, { from: CU; to: CU; dmg: number }[]>();
  for (const h of hits) {
    if (!byTarget.has(h.to)) byTarget.set(h.to, []);
    byTarget.get(h.to)!.push(h);
  }
  for (const [target, list] of byTarget) {
    const attackers = list.reduce((a, h) => a + h.from.men, 0);
    const cap = target.men * COMBAT.maxOutnumber;
    if (attackers > cap) {
      const f = cap / attackers;
      for (const h of list) h.dmg *= f;
    }
  }
}

/** Grobe Kampfkraft einer Seite (für XP-Skalierung). */
function sidePower(units: CU[], mods: SideMods): number {
  return units.reduce((a, u) => a + u.men * (u.def.attack + u.def.defense + u.def.ranged * 0.7 + u.def.charge * 0.3) * (1 + u.exp * 0.04), 0) * mods.general;
}

function hasGuns(units: Record<Side, CU[]>): boolean {
  return [...units.attacker, ...units.defender].some((u) => u.def.gunpowder);
}

/** Zählt Verluste je (Angreifer-Typ, Ziel-Typ) für den Bericht. */
class Tally {
  private map = new Map<string, { from: CU; to: CU; kills: number }>();
  add(from: CU, to: CU, kills: number) {
    const key = `${from.side}:${from.def.id}>${to.def.id}`;
    const e = this.map.get(key);
    if (e) e.kills += kills;
    else this.map.set(key, { from, to, kills });
  }
  lines(nar: Narrator, phase: 'ranged' | 'charge' | 'melee'): string[] {
    const entries = [...this.map.values()].filter((e) => e.kills >= 3).sort((a, b) => b.kills - a.kills);
    // Die wichtigsten Paarungen je Seite (max. 3), damit der Bericht lesbar bleibt.
    const out: string[] = [];
    for (const side of ['attacker', 'defender'] as Side[]) {
      entries.filter((e) => e.from.side === side).slice(0, 3).forEach((e) => out.push(nar.hitLine(e.from, e.to, e.kills, phase)));
    }
    return out;
  }
}
