import type { Season, Tactic, UnitRole } from './types';

// ===========================================================================
// KONTER-MATRIX (Stein-Schere-Papier)
// COUNTERS[angreiferRolle][zielRolle] = Multiplikator auf den Schaden.
// Speer > Kavallerie > Bogen > Speer. Schwerter sind Allrounder mit leichtem
// Vorteil gegen Speere, aber anfällig für Reiter-Ansturm.
// ===========================================================================
export const COUNTERS: Record<UnitRole, Record<UnitRole, number>> = {
  spear: { spear: 1.0, cavalry: 1.6, ranged: 1.0, sword: 0.95 },
  cavalry: { spear: 0.6, cavalry: 1.0, ranged: 1.6, sword: 1.1 },
  ranged: { spear: 1.35, cavalry: 0.5, ranged: 1.0, sword: 1.0 },
  sword: { spear: 1.2, cavalry: 1.0, ranged: 1.2, sword: 1.0 },
};

/** Speere stoppen den Ansturm der Reiterei: Multiplikator auf Charge gegen diese Rolle. */
export const CHARGE_VS_ROLE: Record<UnitRole, number> = {
  spear: 0.2,
  cavalry: 1.0,
  ranged: 1.5,
  sword: 1.0,
};

// ===========================================================================
// TAKTIKEN
// ===========================================================================
export interface TacticDef {
  id: Tactic;
  name: string;
  description: string;
  /** Multiplikator auf eigenen Nahkampfschaden. */
  meleeMod: number;
  /** Multiplikator auf eigene Verteidigung (reduziert erlittenen Schaden). */
  defenseMod: number;
  /** Multiplikator auf eigenen Fernkampf. */
  rangedMod: number;
  /** Multiplikator auf eigenen Ansturm. */
  chargeMod: number;
  /** Moralbonus/-malus (absolut). */
  moraleMod: number;
  /** Zusätzlicher Flankenbonus (nur 'flank'), wird vom Gelände skaliert. */
  flankBonus: number;
  /** Chance-Modifikator, dass Flankieren misslingt und die eigene Seite verwundbar macht. */
  flankRisk: number;
  /** Rückzug: Anteil der Truppen, die vor dem Nahkampf geordnet abziehen. */
  retreatShare: number;
}

export const TACTICS: Record<Tactic, TacticDef> = {
  attack: {
    id: 'attack',
    name: 'Angreifen',
    description: 'Voller Ansturm. Mehr Schaden und Ansturmwucht, aber offene Deckung.',
    meleeMod: 1.2,
    defenseMod: 0.9,
    rangedMod: 1.0,
    chargeMod: 1.25,
    moraleMod: 1,
    flankBonus: 0,
    flankRisk: 0,
    retreatShare: 0,
  },
  hold: {
    id: 'hold',
    name: 'Halten',
    description: 'Feste Linie. Bessere Verteidigung und Fernkampf, kein Ansturm, weniger Schaden.',
    meleeMod: 0.85,
    defenseMod: 1.25,
    rangedMod: 1.2,
    chargeMod: 0.3,
    moraleMod: 1,
    flankBonus: 0,
    flankRisk: 0,
    retreatShare: 0,
  },
  flank: {
    id: 'flank',
    name: 'Flankieren',
    description: 'Umgehung des Gegners. Starker Bonus, wenn es gelingt (Gelände, General, Reiterei) – sonst zersplittert die Armee.',
    meleeMod: 1.0,
    defenseMod: 0.95,
    rangedMod: 0.9,
    chargeMod: 1.1,
    moraleMod: 0,
    flankBonus: 0.5,
    flankRisk: 0.35,
    retreatShare: 0,
  },
  retreat: {
    id: 'retreat',
    name: 'Rückzug',
    description: 'Geordneter Abzug. Die Schlacht ist verloren, aber der Großteil der Armee entkommt.',
    meleeMod: 0.5,
    defenseMod: 1.0,
    rangedMod: 0.7,
    chargeMod: 0,
    moraleMod: -1,
    flankBonus: 0,
    flankRisk: 0,
    retreatShare: 0.75,
  },
};

export const TACTIC_IDS: Tactic[] = ['attack', 'hold', 'flank', 'retreat'];

// ===========================================================================
// JAHRESZEITEN
// ===========================================================================
export interface SeasonDef {
  id: Season;
  name: string;
  kanji: string;
  /** Multiplikator auf Einkommen. */
  incomeMod: number;
  /** Seewege passierbar? */
  seaOpen: boolean;
  /** Verlust (Anteil Mannstärke) für Armeen außerhalb eigener Provinzen. */
  attrition: number;
  /** Moralmalus für den Angreifer in einer Schlacht. */
  attackerMoraleMod: number;
  /** Multiplikator auf Fernkampf (Regen im Sommer/Winter). */
  rangedMod: number;
  /** Zusätzlicher Multiplikator für Arkebusen (nasse Lunten). */
  gunpowderMod: number;
}

export const SEASONS: SeasonDef[] = [
  { id: 'spring', name: 'Frühling', kanji: '春', incomeMod: 1.0, seaOpen: true, attrition: 0, attackerMoraleMod: 0, rangedMod: 1.0, gunpowderMod: 1.0 },
  { id: 'summer', name: 'Sommer', kanji: '夏', incomeMod: 1.0, seaOpen: true, attrition: 0, attackerMoraleMod: 0, rangedMod: 1.0, gunpowderMod: 0.8 },
  { id: 'autumn', name: 'Herbst', kanji: '秋', incomeMod: 1.25, seaOpen: true, attrition: 0, attackerMoraleMod: 0, rangedMod: 1.0, gunpowderMod: 1.0 },
  { id: 'winter', name: 'Winter', kanji: '冬', incomeMod: 0.5, seaOpen: false, attrition: 0.08, attackerMoraleMod: -1, rangedMod: 0.85, gunpowderMod: 0.7 },
];

// ===========================================================================
// KAMPF
// ===========================================================================
export const COMBAT = {
  /** Grundschaden-Skalierung pro Mann und Runde. */
  baseLethality: 0.035,
  /** Zusätzlicher Faktor für Fernkampfschaden. */
  rangedLethality: 0.45,
  /** Fernkampf-Salven vor dem Nahkampf. */
  rangedVolleys: 2,
  /** Zusätzliche Salven, wenn der Gegner kaum Reiterei hat (Fußvolk nähert sich langsam). */
  extraVolleysVsInfantry: 1,
  /** Maximale Nahkampfrunden. */
  maxMeleeRounds: 6,
  /** Frontbreite: Gegen ein Ziel kämpfen im Nahkampf höchstens so viele Männer wie dieses Vielfache seiner Stärke. */
  maxOutnumber: 2,
  /** Zufallsstreuung pro Schadenswurf (±). */
  randomSpread: 0.2,
  /** Kriegsglück: Streuung eines Faktors pro Seite und Schlacht (±). */
  sideLuck: 0.2,
  /** Moralschwelle: Einheit flieht, wenn Moral unter diesen Wert fällt. */
  routThreshold: 0,
  /** Moralverlust pro 10 % verlorener Mannstärke in einer Runde. */
  moraleLossPer10Pct: 1.6,
  /** Moralbonus pro General-Stern (über 1). */
  moralePerStar: 0.5,
  /** Kampfbonus pro General-Stern (über 1). */
  combatPerStar: 0.035,
  /** Kampfbonus pro Erfahrungsstufe einer Einheit. */
  combatPerExperience: 0.04,
  /** Moralbonus pro Erfahrungsstufe. */
  moralePerExperience: 0.3,
  /** Anteil fliehender Männer, die beim Verfolgen niedergemacht werden (Basis). */
  pursuitKillBase: 0.15,
  /** Zusätzlicher Verfolgungsanteil pro Mann Reiterei-Anteil des Siegers. */
  pursuitCavalryFactor: 0.5,
  /** Anteil der Verfolgungsopfer, die stattdessen gefangen werden. */
  captureShare: 0.3,
  /** Moralbonus für Verteidiger hinter Burgmauern. */
  castleMoraleBonus: 2,
  /** Angreifer, die eine Burg stürmen: Malus auf Ansturm. */
  assaultChargeMod: 0.2,
  /** Erfahrungspunkte für den General pro Sieg (skaliert mit Gegnerstärke). */
  generalXpPerWin: 10,
  /** XP-Schwellen für Sterne 2..5. */
  starThresholds: [0, 15, 40, 80, 140],
  /** Einheiten, die überleben, gewinnen Erfahrung. */
  unitXpOnWin: 1,
  unitXpOnLoss: 0,
  maxExperience: 9,
} as const;

// ===========================================================================
// KAMPAGNE
// ===========================================================================
export const CAMPAIGN = {
  startYear: 1545,
  turnsPerYear: 4,
  startTreasury: 1500,
  /** Siegbedingung: Kyoto + mindestens so viele Provinzen. */
  victoryProvinces: 16,
  /** Maximale Einheiten pro Armee. */
  maxUnitsPerArmy: 12,
  /** Maximale Garnisonseinheiten pro Provinz. */
  maxGarrisonUnits: 6,
  /** Auffüllrate pro Runde in eigenen Provinzen (Anteil voller Stärke). */
  replenishRate: 0.15,
  /** Beziehungsverlust bei Angriff / Kriegserklärung. */
  warDeclarationPenalty: -60,
  /** Beziehungsdrift pro Runde Richtung 0. */
  relationDrift: 2,
  /** Ab diesem Beziehungswert akzeptiert die KI Frieden. */
  peaceThreshold: -10,
  /** Ab diesem Beziehungswert akzeptiert die KI Allianzen. */
  allianceThreshold: 40,
  /** Garnisonen kosten diesen Anteil des normalen Unterhalts. */
  garrisonUpkeepShare: 0.5,
  /** Beziehungsbonus pro Runde zwischen Clans im Frieden / in Allianz. */
  peaceRelationGain: 1,
  /** Koku pro Beziehungspunkt bei Geschenken. */
  giftKokuPerPoint: 25,
  /** Kriegsmüdigkeit: Beziehungsbonus pro Runde Krieg ohne Kämpfe (erleichtert Frieden). */
  warWearinessGain: 1,
} as const;

/** Generals-Namen für neue Heerführer (frei erfunden). */
export const GENERAL_GIVEN_NAMES = [
  'Hidemasa', 'Kagetora', 'Nobuyuki', 'Tadakatsu', 'Yoshitaka', 'Masanori', 'Kiyomasa', 'Takatora',
  'Munenori', 'Shigenaga', 'Tomonobu', 'Harukage', 'Sadamitsu', 'Yukinaga', 'Akimune', 'Toshiie',
  'Michitsuna', 'Koremasa', 'Narihisa', 'Kanetsugu',
];
