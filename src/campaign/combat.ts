// Brücke zwischen Kampagne und Kampfsimulation: Armeen -> BattleInput -> Ergebnisse zurückschreiben.
import { PROVINCES, seasonOf } from '../data';
import type { Army, ClanId, GameState, ProvinceId, Tactic, Unit } from '../data/types';
import { deriveSeed, simulateBattle, starsForXp, type Side } from '../sim';
import { clanName, log, provinceName, type BattleRecord } from './state';
import { adjustRelation } from './diplomacy';

export interface Combatants {
  clan: ClanId;
  armies: Army[];
  /** Garnison der Provinz kämpft mit (nur Verteidiger). */
  withGarrison?: boolean;
  tactic: Tactic;
}

/** Führt eine Schlacht aus und schreibt Verluste/Erfahrung in den (veränderlichen) Zustand s. */
export function fight(
  s: GameState, pid: ProvinceId, attacker: Combatants, defender: Combatants, kind: 'field' | 'assault',
): BattleRecord {
  const prov = s.provinces[pid];
  // Einheiten sammeln und Herkunft merken, um Ergebnisse zurückzuschreiben.
  const collect = (c: Combatants) => {
    const refs: { list: Unit[]; index: number }[] = [];
    const units: Unit[] = [];
    for (const a of c.armies) a.units.forEach((u, i) => { refs.push({ list: a.units, index: i }); units.push({ ...u }); });
    if (c.withGarrison) prov.garrison.forEach((u, i) => { refs.push({ list: prov.garrison, index: i }); units.push({ ...u }); });
    const best = [...c.armies].sort((a, b) => b.general.stars - a.general.stars)[0];
    const general = best ? { name: best.general.name, stars: best.general.stars } : { name: 'der Burgvogt', stars: 1 + Math.min(2, prov.buildings.castle ?? 0) };
    return { refs, units, general };
  };
  const att = collect(attacker);
  const def = collect(defender);
  const perspective: Side | undefined =
    s.clans[attacker.clan]?.isPlayer ? 'attacker' : s.clans[defender.clan]?.isPlayer ? 'defender' : undefined;

  const result = simulateBattle({
    attacker: { clan: attacker.clan, clanName: clanName(attacker.clan), generalName: att.general.name, stars: att.general.stars, units: att.units, tactic: attacker.tactic },
    defender: { clan: defender.clan, clanName: clanName(defender.clan), generalName: def.general.name, stars: def.general.stars, units: def.units, tactic: defender.tactic },
    terrain: PROVINCES[pid].terrain,
    season: seasonOf(s.turn).id,
    castleLevel: kind === 'assault' ? prov.buildings.castle ?? 0 : 0,
    seed: deriveSeed(s.seed, s.turn, pid, s.nextId++),
    perspective,
  });

  // Ergebnisse zurückschreiben (rückwärts, damit Indizes beim Entfernen stimmen).
  const writeBack = (side: { refs: { list: Unit[]; index: number }[] }, outcome: typeof result.attacker) => {
    outcome.units.forEach((o, i) => {
      const r = side.refs[i];
      r.list[r.index].men = o.menAfter;
      r.list[r.index].experience = o.experience;
    });
  };
  writeBack(att, result.attacker);
  writeBack(def, result.defender);
  const prune = (list: Unit[]) => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].men <= 0) list.splice(i, 1);
  };
  for (const a of [...attacker.armies, ...defender.armies]) prune(a.units);
  prune(prov.garrison);

  const award = (armies: Army[], xp: number) => {
    for (const a of armies) {
      a.general.xp += xp;
      a.general.stars = starsForXp(a.general.xp, a.general.stars);
    }
  };
  award(attacker.armies, result.attacker.generalXp);
  award(defender.armies, result.defender.generalXp);
  for (const a of [...attacker.armies, ...defender.armies]) if (a.units.length === 0) delete s.armies[a.id];

  adjustRelation(s, attacker.clan, defender.clan, -5);
  const winnerName = clanName(result.winner === 'attacker' ? attacker.clan : defender.clan);
  log(s, `${kind === 'assault' ? 'Sturm auf' : 'Schlacht um'} ${provinceName(pid)}: ${clanName(attacker.clan)} gegen ${clanName(defender.clan)} – Sieg der ${winnerName}.`);
  return { turn: s.turn, province: pid, attacker: attacker.clan, defender: defender.clan, kind, result };
}
