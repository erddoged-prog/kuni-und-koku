import { BUILDINGS, CAMPAIGN, PROVINCES, UNIT_TYPES, seasonOf } from '../data';
import type { ClanId, GameState, ProvinceId } from '../data/types';
import { armiesOf, provincesOf } from './state';

/** Koku-Bonus aller Gebäude einer Provinz (0.4 = +40 %). */
export function kokuBonus(state: GameState, pid: ProvinceId): number {
  let bonus = 0;
  for (const [b, lvl] of Object.entries(state.provinces[pid].buildings)) {
    const def = BUILDINGS[b];
    if (def && lvl > 0) bonus += def.levels[lvl - 1].kokuBonus ?? 0;
  }
  return bonus;
}

/** Einkommen einer Provinz in dieser Runde (belagerte Provinzen bringen nichts). */
export function provinceIncome(state: GameState, pid: ProvinceId, turn = state.turn): number {
  const p = state.provinces[pid];
  if (p.siege) return 0;
  const base = PROVINCES[pid].koku;
  return Math.round(base * (1 + kokuBonus(state, pid)) * seasonOf(turn).incomeMod);
}

export function clanIncome(state: GameState, clan: ClanId, turn = state.turn): number {
  return provincesOf(state, clan).reduce((a, pid) => a + provinceIncome(state, pid, turn), 0);
}

export function clanUpkeep(state: GameState, clan: ClanId): number {
  let total = 0;
  for (const a of armiesOf(state, clan)) for (const u of a.units) total += UNIT_TYPES[u.type].upkeep;
  for (const pid of provincesOf(state, clan)) {
    for (const u of state.provinces[pid].garrison) total += UNIT_TYPES[u.type].upkeep * CAMPAIGN.garrisonUpkeepShare;
  }
  return Math.round(total);
}

/** Netto-Bilanz dieser Runde. */
export function clanBalance(state: GameState, clan: ClanId, turn = state.turn): number {
  return clanIncome(state, clan, turn) - clanUpkeep(state, clan);
}
