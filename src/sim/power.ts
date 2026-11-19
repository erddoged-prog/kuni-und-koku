import { COMBAT, UNIT_TYPES } from '../data';
import type { Unit } from '../data/types';

/** Grobe Kampfkraft-Schätzung einer Truppe (für KI und UI-Vorschau). */
export function unitPower(u: Unit): number {
  const d = UNIT_TYPES[u.type];
  return u.men * (d.attack + d.defense + d.ranged * 0.7 + d.charge * 0.3 + d.morale * 0.3) * (1 + u.experience * COMBAT.combatPerExperience);
}

export function armyPower(units: Unit[], stars = 1): number {
  return units.reduce((a, u) => a + unitPower(u), 0) * (1 + (stars - 1) * COMBAT.combatPerStar);
}

/** Sterne aus Erfahrungspunkten. */
export function starsForXp(xp: number, baseStars = 1): number {
  let s = 1;
  COMBAT.starThresholds.forEach((t, i) => {
    if (xp >= t) s = i + 1;
  });
  return Math.min(5, Math.max(baseStars, s));
}
