// Bauen & Rekrutieren: Bauschlange pro Provinz.
import { BUILDINGS, CAMPAIGN, UNIT_TYPES, yearOf } from '../data';
import type { BuildingRequirement, ClanId, GameState, ProvinceId } from '../data/types';
import { armiesIn, buildingLevel, clone, fail, log, newGeneral, newUnit, nextId, ok, provinceName, type ActionResult } from './state';

export interface Check {
  ok: boolean;
  reason?: string;
}

const meets = (state: GameState, pid: ProvinceId, reqs: BuildingRequirement[] = []): BuildingRequirement | undefined =>
  reqs.find((r) => buildingLevel(state, pid, r.building) < r.level);

/** Stufe, die als nächstes gebaut würde (berücksichtigt bereits eingereihte Aufträge). */
export function plannedLevel(state: GameState, pid: ProvinceId, building: string): number {
  const queued = state.provinces[pid].queue.filter((q) => q.kind === 'building' && q.id === building).length;
  return buildingLevel(state, pid, building) + queued;
}

export function canBuild(state: GameState, clan: ClanId, pid: ProvinceId, building: string): Check {
  const p = state.provinces[pid];
  const def = BUILDINGS[building];
  if (!def) return { ok: false, reason: 'Unbekanntes Gebäude.' };
  if (p.owner !== clan) return { ok: false, reason: 'Nicht eure Provinz.' };
  if (p.siege) return { ok: false, reason: 'Die Provinz wird belagert.' };
  const next = plannedLevel(state, pid, building) + 1;
  if (next > def.levels.length) return { ok: false, reason: 'Höchste Stufe erreicht.' };
  const lvl = def.levels[next - 1];
  const missing = meets(state, pid, lvl.requires);
  if (missing) return { ok: false, reason: `Benötigt ${BUILDINGS[missing.building].levels[missing.level - 1].name}.` };
  if (state.clans[clan].treasury < lvl.cost) return { ok: false, reason: `Zu wenig Koku (${lvl.cost} benötigt).` };
  return { ok: true };
}

export function queueBuilding(state: GameState, clan: ClanId, pid: ProvinceId, building: string): ActionResult {
  const check = canBuild(state, clan, pid, building);
  if (!check.ok) return fail(state, check.reason!);
  const s = clone(state);
  const lvl = BUILDINGS[building].levels[plannedLevel(s, pid, building)];
  s.clans[clan].treasury -= lvl.cost;
  s.provinces[pid].queue.push({ kind: 'building', id: building, turnsLeft: lvl.buildTime });
  return ok(s, `${lvl.name} in ${provinceName(pid)} in Auftrag gegeben.`);
}

export function canRecruit(state: GameState, clan: ClanId, pid: ProvinceId, unitType: string): Check {
  const p = state.provinces[pid];
  const def = UNIT_TYPES[unitType];
  if (!def) return { ok: false, reason: 'Unbekannte Einheit.' };
  if (p.owner !== clan) return { ok: false, reason: 'Nicht eure Provinz.' };
  if (p.siege) return { ok: false, reason: 'Die Provinz wird belagert.' };
  if (def.availableFromYear && yearOf(state.turn, state.startYear) < def.availableFromYear) {
    return { ok: false, reason: `Erst ab ${def.availableFromYear} verfügbar.` };
  }
  const missing = meets(state, pid, def.requires);
  if (missing) return { ok: false, reason: `Benötigt ${BUILDINGS[missing.building].levels[missing.level - 1].name}.` };
  if (state.clans[clan].treasury < def.cost) return { ok: false, reason: `Zu wenig Koku (${def.cost} benötigt).` };
  return { ok: true };
}

export function queueUnit(state: GameState, clan: ClanId, pid: ProvinceId, unitType: string): ActionResult {
  const check = canRecruit(state, clan, pid, unitType);
  if (!check.ok) return fail(state, check.reason!);
  const s = clone(state);
  const def = UNIT_TYPES[unitType];
  s.clans[clan].treasury -= def.cost;
  s.provinces[pid].queue.push({ kind: 'unit', id: unitType, turnsLeft: def.recruitTime });
  return ok(s, `${def.name} in ${provinceName(pid)} werden ausgehoben.`);
}

/** Auftrag abbrechen: volle Rückerstattung. Spätere Ausbaustufen desselben Gebäudes werden mit abgebrochen. */
export function cancelQueueItem(state: GameState, clan: ClanId, pid: ProvinceId, index: number): ActionResult {
  const p = state.provinces[pid];
  if (p.owner !== clan) return fail(state, 'Nicht eure Provinz.');
  const item = p.queue[index];
  if (!item) return fail(state, 'Kein solcher Auftrag.');
  const s = clone(state);
  const queue = s.provinces[pid].queue;
  const remove = new Set<number>([index]);
  if (item.kind === 'building') queue.forEach((q, i) => i > index && q.kind === 'building' && q.id === item.id && remove.add(i));
  let refund = 0;
  let sameBefore = 0;
  queue.forEach((q, i) => {
    if (q.kind === 'unit') {
      if (remove.has(i)) refund += UNIT_TYPES[q.id].cost;
      return;
    }
    if (q.id !== item.id) return;
    // Stufe dieses Auftrags = aktuelle Stufe + gleiche Aufträge davor + 1
    if (remove.has(i)) refund += BUILDINGS[q.id].levels[buildingLevel(s, pid, q.id) + sameBefore].cost;
    sameBefore++;
  });
  s.provinces[pid].queue = queue.filter((_, i) => !remove.has(i));
  s.clans[clan].treasury += refund;
  return ok(s, `Auftrag abgebrochen (${refund} Koku erstattet).`);
}

/**
 * Bauschlangen eine Runde voranbringen (mutiert den übergebenen Zustand).
 * Pro Provinz laufen das erste Gebäude und die erste Einheit parallel.
 */
export function processQueues(s: GameState) {
  for (const p of Object.values(s.provinces)) {
    if (p.siege) continue;
    for (const kind of ['building', 'unit'] as const) {
      const idx = p.queue.findIndex((q) => q.kind === kind);
      if (idx < 0) continue;
      const item = p.queue[idx];
      item.turnsLeft--;
      if (item.turnsLeft > 0) continue;
      p.queue.splice(idx, 1);
      if (kind === 'building') {
        p.buildings[item.id] = (p.buildings[item.id] ?? 0) + 1;
        if (s.clans[p.owner].isPlayer) log(s, `${BUILDINGS[item.id].levels[p.buildings[item.id] - 1].name} in ${provinceName(p.id)} fertiggestellt.`);
      } else {
        placeNewUnit(s, p.id, item.id);
      }
    }
  }
}

/** Neue Einheit: in eine Armee vor Ort, sonst Garnison, sonst neue Armee. */
function placeNewUnit(s: GameState, pid: ProvinceId, unitType: string) {
  const p = s.provinces[pid];
  const dojo = p.buildings.sword_dojo ?? 0;
  const exp = dojo > 0 ? BUILDINGS.sword_dojo.levels[dojo - 1].recruitExperience ?? 0 : 0;
  const unit = newUnit(unitType, exp);
  const army = armiesIn(s, pid, p.owner).find((a) => a.units.length < CAMPAIGN.maxUnitsPerArmy);
  if (army) army.units.push(unit);
  else if (p.garrison.length < CAMPAIGN.maxGarrisonUnits) p.garrison.push(unit);
  else {
    const id = nextId(s, 'a');
    s.armies[id] = { id, owner: p.owner, location: pid, general: newGeneral(s, p.owner), units: [unit], moved: false, stance: 'hold' };
  }
  if (s.clans[p.owner].isPlayer) log(s, `${UNIT_TYPES[unitType].name} in ${provinceName(pid)} bereit.`);
}
