import type { ClanId, Season, Tactic, Terrain, Unit, UnitTypeId } from '../data/types';

export type Side = 'attacker' | 'defender';

export interface BattleSideInput {
  clan: ClanId;
  /** Anzeigename des Clans für den Bericht. */
  clanName: string;
  generalName: string;
  /** Sterne 1–5. */
  stars: number;
  units: Unit[];
  tactic: Tactic;
}

export interface BattleInput {
  attacker: BattleSideInput;
  defender: BattleSideInput;
  terrain: Terrain;
  season: Season;
  /** > 0: Sturm auf eine Burg dieser Stufe (Verteidiger hinter Mauern). */
  castleLevel?: number;
  seed: number;
  /** Aus wessen Sicht der Bericht formuliert wird ("Eure …"). */
  perspective?: Side;
}

export interface UnitOutcome {
  type: UnitTypeId;
  menBefore: number;
  menAfter: number;
  /** Gefallen. */
  killed: number;
  /** In Gefangenschaft geraten. */
  captured: number;
  /** Ist im Kampf geflohen (überlebende Männer sind in menAfter enthalten). */
  routed: boolean;
  /** Neue Erfahrungsstufe. */
  experience: number;
}

export interface SideOutcome {
  units: UnitOutcome[];
  totalBefore: number;
  totalAfter: number;
  killed: number;
  captured: number;
  /** Überlebende Männer aus geflohenen Einheiten. */
  fled: number;
  /** Erfahrungspunkte für den General. */
  generalXp: number;
  /** Hat sich geordnet zurückgezogen (Taktik Rückzug oder Abbruch nach Patt). */
  withdrew: boolean;
}

export type PhaseId = 'deploy' | 'ranged' | 'charge' | 'melee' | 'morale' | 'pursuit' | 'result';

export interface ReportPhase {
  id: PhaseId;
  title: string;
  lines: string[];
}

export interface BattleResult {
  winner: Side;
  attacker: SideOutcome;
  defender: SideOutcome;
  /** Gelang das Flankenmanöver? (nur gesetzt, wenn eine Seite flankierte) */
  flank?: { side: Side; success: boolean }[];
  meleeRounds: number;
  report: ReportPhase[];
}
