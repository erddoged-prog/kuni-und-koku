import { ADJACENCIES } from './provinces';
import { CAMPAIGN, SEASONS, type SeasonDef } from './config';
import type { ProvinceId } from './types';

// Kleine, reine Hilfsfunktionen auf den statischen Daten.

const neighborMap: Map<ProvinceId, { id: ProvinceId; sea: boolean }[]> = new Map();
for (const { a, b, sea } of ADJACENCIES) {
  if (!neighborMap.has(a)) neighborMap.set(a, []);
  if (!neighborMap.has(b)) neighborMap.set(b, []);
  neighborMap.get(a)!.push({ id: b, sea: !!sea });
  neighborMap.get(b)!.push({ id: a, sea: !!sea });
}

/** Nachbarn einer Provinz inkl. Seeweg-Flag. */
export function neighborsOf(id: ProvinceId): { id: ProvinceId; sea: boolean }[] {
  return neighborMap.get(id) ?? [];
}

export function areAdjacent(a: ProvinceId, b: ProvinceId): boolean {
  return neighborsOf(a).some((n) => n.id === b);
}

export function isSeaRoute(a: ProvinceId, b: ProvinceId): boolean {
  return neighborsOf(a).some((n) => n.id === b && n.sea);
}

export function seasonOf(turn: number): SeasonDef {
  return SEASONS[turn % CAMPAIGN.turnsPerYear];
}

export function yearOf(turn: number, startYear: number = CAMPAIGN.startYear): number {
  return startYear + Math.floor(turn / CAMPAIGN.turnsPerYear);
}

/** Schlüssel für Diplomatie-Beziehungen (unabhängig von der Reihenfolge). */
export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
