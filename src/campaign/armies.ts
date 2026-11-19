// Armeen umgliedern: Einheiten zwischen Armeen und Garnison verschieben, Haltung setzen.
import { CAMPAIGN } from '../data';
import type { ArmyId, ClanId, GameState, ProvinceId, Tactic, Unit } from '../data/types';
import { clone, fail, newGeneral, nextId, ok, type ActionResult } from './state';

export type UnitHolder = { army: ArmyId } | 'garrison' | 'new';

function holderUnits(s: GameState, pid: ProvinceId, h: UnitHolder): Unit[] | undefined {
  if (h === 'garrison') return s.provinces[pid].garrison;
  if (h === 'new') return undefined;
  return s.armies[h.army]?.units;
}

/**
 * Verschiebt Einheiten (Indizes in der Quelle) von einer Armee/Garnison in eine andere
 * Armee, die Garnison oder eine neue Armee (mit neuem 1★-General).
 */
export function transferUnits(
  state: GameState, clan: ClanId, pid: ProvinceId, from: UnitHolder, to: UnitHolder, indices: number[],
): ActionResult {
  if (from === 'new') return fail(state, 'Ungültige Quelle.');
  const prov = state.provinces[pid];
  const usesGarrison = from === 'garrison' || to === 'garrison';
  if (usesGarrison && prov.owner !== clan) return fail(state, 'Die Garnison gehört euch nicht.');
  if (usesGarrison && prov.siege) return fail(state, 'Die Burg ist eingeschlossen.');
  for (const h of [from, to]) {
    if (typeof h === 'object') {
      const a = state.armies[h.army];
      if (!a || a.owner !== clan || a.location !== pid) return fail(state, 'Armee nicht vor Ort.');
    }
  }
  const uniq = [...new Set(indices)].sort((a, b) => b - a);
  const src = holderUnits(state, pid, from)!;
  if (!uniq.length || uniq.some((i) => i < 0 || i >= src.length)) return fail(state, 'Keine gültigen Einheiten gewählt.');

  const s = clone(state);
  const source = holderUnits(s, pid, from)!;
  let target = holderUnits(s, pid, to);
  const cap = to === 'garrison' ? CAMPAIGN.maxGarrisonUnits : CAMPAIGN.maxUnitsPerArmy;
  if ((target?.length ?? 0) + uniq.length > cap) return fail(state, `Zu viele Einheiten (max. ${cap}).`);
  if (to === 'new') {
    const id = nextId(s, 'a');
    s.armies[id] = { id, owner: clan, location: pid, general: newGeneral(s, clan), units: [], moved: false, stance: 'hold' };
    // Eine neu aufgestellte Armee darf sich nur bewegen, wenn die Quelle es noch durfte.
    if (typeof from === 'object') s.armies[id].moved = s.armies[from.army].moved;
    target = s.armies[id].units;
  }
  const moving = uniq.map((i) => source.splice(i, 1)[0]).reverse();
  target!.push(...moving);
  if (typeof from === 'object' && source.length === 0) delete s.armies[from.army];
  return ok(s, `${moving.length} Einheit(en) verlegt.`);
}

/** Vereinigt zwei Armeen am selben Ort; der bessere General führt. */
export function mergeArmies(state: GameState, clan: ClanId, fromId: ArmyId, intoId: ArmyId): ActionResult {
  const a = state.armies[fromId];
  const b = state.armies[intoId];
  if (!a || !b || a.owner !== clan || b.owner !== clan || a.location !== b.location || fromId === intoId) {
    return fail(state, 'Armeen können nicht vereinigt werden.');
  }
  if (a.units.length + b.units.length > CAMPAIGN.maxUnitsPerArmy) return fail(state, `Zu viele Einheiten (max. ${CAMPAIGN.maxUnitsPerArmy}).`);
  const s = clone(state);
  const into = s.armies[intoId];
  const from = s.armies[fromId];
  into.units.push(...from.units);
  if (from.general.stars > into.general.stars || from.general.isDaimyo) into.general = from.general;
  into.moved = into.moved || from.moved;
  delete s.armies[fromId];
  return ok(s, 'Armeen vereinigt.');
}

export function setStance(state: GameState, clan: ClanId, armyId: ArmyId, stance: Tactic): ActionResult {
  const a = state.armies[armyId];
  if (!a || a.owner !== clan) return fail(state, 'Keine eigene Armee.');
  const s = clone(state);
  s.armies[armyId].stance = stance;
  return ok(s);
}

export function disbandUnit(state: GameState, clan: ClanId, pid: ProvinceId, holder: UnitHolder, index: number): ActionResult {
  if (holder === 'new') return fail(state, 'Ungültig.');
  if (holder === 'garrison' && state.provinces[pid].owner !== clan) return fail(state, 'Nicht eure Garnison.');
  if (typeof holder === 'object' && state.armies[holder.army]?.owner !== clan) return fail(state, 'Nicht eure Armee.');
  const s = clone(state);
  const list = holderUnits(s, pid, holder);
  if (!list?.[index]) return fail(state, 'Keine solche Einheit.');
  list.splice(index, 1);
  if (typeof holder === 'object' && list.length === 0) delete s.armies[holder.army];
  return ok(s, 'Einheit entlassen.');
}
