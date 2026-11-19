// Zentrale Typdefinitionen für statische Spieldaten (Config) und den Spielzustand.
// Diese Datei enthält KEINE Logik – nur Formen von Daten.

// ---------------------------------------------------------------------------
// Grundbegriffe
// ---------------------------------------------------------------------------

export type ClanId = string;
export type ProvinceId = string;
export type UnitTypeId = string;
export type BuildingId = string;
export type ArmyId = string;
export type GeneralId = string;

/** Rolle einer Einheit – Grundlage des Konter-Systems (Stein-Schere-Papier). */
export type UnitRole = 'spear' | 'cavalry' | 'ranged' | 'sword';

export type Terrain = 'plains' | 'hills' | 'forest' | 'river';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Taktik, die vor einer Schlacht gewählt wird. */
export type Tactic = 'attack' | 'hold' | 'flank' | 'retreat';

export type DiplomaticState = 'war' | 'peace' | 'alliance';

// ---------------------------------------------------------------------------
// Statische Definitionen (Config)
// ---------------------------------------------------------------------------

export interface UnitType {
  id: UnitTypeId;
  name: string;
  /** Kurzbeschreibung für das UI. */
  description: string;
  role: UnitRole;
  /** Nahkampf-Angriff (1–12). */
  attack: number;
  /** Verteidigung inkl. Rüstung (1–12). */
  defense: number;
  /** Fernkampfwert; 0 = kein Fernkampf. */
  ranged: number;
  /** Bonus beim Ansturm (Charge). */
  charge: number;
  /** Grundmoral (1–12). */
  morale: number;
  /** Volle Mannstärke beim Rekrutieren. */
  men: number;
  /** Rekrutierungskosten in Koku. */
  cost: number;
  /** Unterhalt pro Runde in Koku. */
  upkeep: number;
  /** Runden bis zur Fertigstellung. */
  recruitTime: number;
  /** Benötigte Gebäude (alle) in der Rekrutierungsprovinz. */
  requires: BuildingRequirement[];
  /** Feuerwaffe (leidet unter Regen/Winter). */
  gunpowder?: boolean;
  /** Frühestes Jahr der Verfügbarkeit (z. B. Arkebusen). */
  availableFromYear?: number;
}

export interface BuildingRequirement {
  building: BuildingId;
  level: number;
}

export interface BuildingLevel {
  name: string;
  cost: number;
  /** Bauzeit in Runden. */
  buildTime: number;
  /** Prozentualer Bonus auf den Koku-Ertrag der Provinz (0.2 = +20 %). */
  kokuBonus?: number;
  /** Burg: Verteidigungsbonus für Verteidiger einer Belagerung (Multiplikator-Zuschlag). */
  siegeDefense?: number;
  /** Burg: Runden, die die Garnison einer Aushungerung standhält. */
  supplyTurns?: number;
  /** Dojo: Starterfahrung neu ausgebildeter Einheiten. */
  recruitExperience?: number;
  /** Benötigte andere Gebäude für diese Stufe. */
  requires?: BuildingRequirement[];
}

export interface BuildingType {
  id: BuildingId;
  name: string;
  description: string;
  /** Stufen; Index 0 = Stufe 1. */
  levels: BuildingLevel[];
}

export interface TerrainDef {
  id: Terrain;
  name: string;
  /** Multiplikator auf Verteidigung des Verteidigers. */
  defenderDefense: number;
  /** Multiplikator auf Fernkampf (beider Seiten). */
  rangedMod: number;
  /** Multiplikator auf Kavallerie-Ansturm (beider Seiten). */
  cavalryChargeMod: number;
  /** Multiplikator auf den Nahkampf-Angriff des Angreifers (Flussüberquerung etc.). */
  attackerMeleeMod: number;
  /** Ob Flankieren hier gut funktioniert (Multiplikator auf Flankenbonus). */
  flankMod: number;
  description: string;
}

export interface ProvinceDef {
  id: ProvinceId;
  name: string;
  /** Kanji-Name (rein dekorativ). */
  kanji: string;
  /** Grundertrag in Koku pro Runde. */
  koku: number;
  terrain: Terrain;
  /** Kartenkoordinaten (0–100 x, 0–80 y) des Provinzzentrums. */
  x: number;
  y: number;
  /** Ist dies die Hauptstadt (Kyoto)? */
  isCapital?: boolean;
}

export interface Adjacency {
  a: ProvinceId;
  b: ProvinceId;
  /** Seeweg: im Winter gesperrt. */
  sea?: boolean;
}

export interface ClanDef {
  id: ClanId;
  name: string;
  /** Pluralform nach Artikel ("der Unabhängigen"), falls abweichend vom Namen. */
  plural?: string;
  /** Ein Zeichen für das Clan-Symbol. */
  kanji: string;
  /** Hauptfarbe (Kartenfläche). */
  color: string;
  /** Akzentfarbe (Symbol, Rand). */
  accent: string;
  /** Mon-Grundform für das selbst gestaltete Wappen. */
  mon: MonShape;
  description: string;
  startProvinces: ProvinceId[];
  /** Heimatprovinz mit Burg und Daimyo. */
  homeProvince: ProvinceId;
  /** Spielbar? (Unabhängige sind es nicht.) */
  playable: boolean;
}

export type MonShape = 'ring' | 'diamond' | 'triple' | 'wave' | 'pine' | 'mountain' | 'square';

// ---------------------------------------------------------------------------
// Laufzeit-Zustand (wird gespeichert)
// ---------------------------------------------------------------------------

export interface Unit {
  type: UnitTypeId;
  /** Aktuelle Mannstärke. */
  men: number;
  /** Erfahrung 0–9 (Veteranenstufen). */
  experience: number;
}

export interface General {
  id: GeneralId;
  name: string;
  /** Sterne 1–5. */
  stars: number;
  /** Erfahrungspunkte; bei Schwellen steigt die Sternzahl. */
  xp: number;
  /** Ist dies der Daimyo des Clans? */
  isDaimyo?: boolean;
}

export interface Army {
  id: ArmyId;
  owner: ClanId;
  location: ProvinceId;
  general: General;
  units: Unit[];
  /** Hat sich in dieser Runde schon bewegt. */
  moved: boolean;
  /** Taktik, wenn diese Armee angegriffen wird. */
  stance: Tactic;
  /** Herkunftsprovinz des letzten Zuges (für Rückzug nach verlorenem Angriff). */
  cameFrom?: ProvinceId;
}

export interface QueueItem {
  kind: 'building' | 'unit';
  /** Gebäude- oder Einheitentyp-ID. */
  id: string;
  /** Verbleibende Runden. */
  turnsLeft: number;
}

export interface Siege {
  /** Belagernder Clan. */
  besieger: ClanId;
  /** Bisherige Runden der Belagerung. */
  turns: number;
}

export interface ProvinceState {
  id: ProvinceId;
  owner: ClanId;
  /** Gebäude-ID -> Stufe (1-basiert). */
  buildings: Record<BuildingId, number>;
  /** Garnisonstruppen (in der Burg). */
  garrison: Unit[];
  queue: QueueItem[];
  siege?: Siege;
}

export interface DiplomacyRelation {
  state: DiplomaticState;
  /** Beziehungswert -100 (Hass) bis +100 (Freundschaft). */
  value: number;
}

export type AgentKind = 'ninja' | 'shinobi';

/** Stub: Agenten haben im Prototyp nur ein Datenmodell. */
export interface Agent {
  id: string;
  kind: AgentKind;
  owner: ClanId;
  location: ProvinceId;
  skill: number;
}

export interface ClanState {
  id: ClanId;
  treasury: number;
  isPlayer: boolean;
  /** Ausgelöscht? */
  defeated: boolean;
}

export interface GameState {
  version: number;
  /** Runde ab 0; 4 Runden = 1 Jahr. */
  turn: number;
  startYear: number;
  seed: number;
  playerClan: ClanId;
  clans: Record<ClanId, ClanState>;
  provinces: Record<ProvinceId, ProvinceState>;
  armies: Record<ArmyId, Army>;
  /** Schlüssel "clanA|clanB" (alphabetisch sortiert). */
  diplomacy: Record<string, DiplomacyRelation>;
  agents: Agent[];
  /** Laufender Zähler für eindeutige IDs. */
  nextId: number;
  /** Ereignisprotokoll (Texte für das UI). */
  log: string[];
  winner?: ClanId;
}
