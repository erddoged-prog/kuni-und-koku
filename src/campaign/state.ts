// Lesende Hilfsfunktionen auf dem GameState + gemeinsame Typen der Kampagne.
import { CAMPAIGN, CLANS, GENERAL_GIVEN_NAMES, NEUTRAL_CLAN, PROVINCES, UNIT_TYPES, relationKey, seasonOf, yearOf } from '../data';
import type { Army, ClanId, DiplomacyRelation, GameState, General, ProvinceId, Unit } from '../data/types';
import type { BattleResult } from '../sim';

/** Ein Kampf, der während einer Aktion stattfand (für Berichte im UI). */
export interface BattleRecord {
  turn: number;
  province: ProvinceId;
  attacker: ClanId;
  defender: ClanId;
  /** Art: Feldschlacht oder Sturm auf eine Burg. */
  kind: 'field' | 'assault';
  result: BattleResult;
}

/** Ergebnis jeder Aktion: neuer Zustand (die Eingabe bleibt unverändert). */
export interface ActionResult {
  state: GameState;
  ok: boolean;
  message?: string;
  battles: BattleRecord[];
}

export const ok = (state: GameState, message?: string, battles: BattleRecord[] = []): ActionResult => ({ state, ok: true, message, battles });
export const fail = (state: GameState, message: string): ActionResult => ({ state, ok: false, message, battles: [] });

export const clone = (s: GameState): GameState => structuredClone(s);

export function armiesIn(state: GameState, pid: ProvinceId, clan?: ClanId): Army[] {
  return Object.values(state.armies).filter((a) => a.location === pid && (!clan || a.owner === clan));
}

export function armiesOf(state: GameState, clan: ClanId): Army[] {
  return Object.values(state.armies).filter((a) => a.owner === clan);
}

export function provincesOf(state: GameState, clan: ClanId): ProvinceId[] {
  return Object.values(state.provinces).filter((p) => p.owner === clan).map((p) => p.id);
}

export function relation(state: GameState, a: ClanId, b: ClanId): DiplomacyRelation {
  if (a === b) return { state: 'alliance', value: 100 };
  if (a === NEUTRAL_CLAN || b === NEUTRAL_CLAN) return { state: 'war', value: -100 };
  return state.diplomacy[relationKey(a, b)] ?? { state: 'peace', value: 0 };
}

export const atWar = (state: GameState, a: ClanId, b: ClanId) => a !== b && relation(state, a, b).state === 'war';
export const allied = (state: GameState, a: ClanId, b: ClanId) => a === b || relation(state, a, b).state === 'alliance';

export function castleLevel(state: GameState, pid: ProvinceId): number {
  return state.provinces[pid].buildings.castle ?? 0;
}

export function buildingLevel(state: GameState, pid: ProvinceId, b: string): number {
  return state.provinces[pid].buildings[b] ?? 0;
}

export function newUnit(type: string, experience = 0): Unit {
  return { type, men: UNIT_TYPES[type].men, experience };
}

export function armyMen(a: { units: Unit[] }): number {
  return a.units.reduce((s, u) => s + u.men, 0);
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

export function newGeneral(state: GameState, clan: ClanId, stars = 1): General {
  const given = GENERAL_GIVEN_NAMES[state.nextId % GENERAL_GIVEN_NAMES.length];
  return { id: nextId(state, 'g'), name: `${CLANS[clan].name} ${given}`, stars, xp: 0 };
}

export function log(state: GameState, text: string) {
  state.log.push(`${dateLabel(state)}: ${text}`);
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

export function dateLabel(state: GameState): string {
  return `${seasonOf(state.turn).name} ${yearOf(state.turn, state.startYear)}`;
}

export function provinceName(pid: ProvinceId): string {
  return PROVINCES[pid].name;
}

export function clanName(clan: ClanId): string {
  return CLANS[clan].name;
}

/** Name nach Artikel: "der Akagane", "den Unabhängigen". */
export function clanPlural(clan: ClanId): string {
  return CLANS[clan].plural ?? CLANS[clan].name;
}

export function isAlive(state: GameState, clan: ClanId): boolean {
  return provincesOf(state, clan).length > 0 || armiesOf(state, clan).length > 0;
}

export const maxUnits = CAMPAIGN.maxUnitsPerArmy;
