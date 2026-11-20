import type { BuildingId, ClanId, ProvinceId, UnitTypeId } from './types';

// Startaufstellung (Frühling 1545). Reine Daten; der Aufbau des GameState
// erfolgt in src/campaign.

export interface StartArmy {
  clan: ClanId;
  location: ProvinceId;
  general: string;
  stars: number;
  isDaimyo?: boolean;
  units: UnitTypeId[];
}

export interface StartProvinceSetup {
  buildings: Record<BuildingId, number>;
  garrison: UnitTypeId[];
}

/** Heimatprovinz eines Clans. */
export const HOME_SETUP: StartProvinceSetup = {
  buildings: { castle: 2, farm: 1, barracks: 1, spear_dojo: 1 },
  garrison: ['ashigaru_yari', 'ashigaru_yari'],
};

/** Weitere Startprovinz eines Clans. */
export const SECONDARY_SETUP: StartProvinceSetup = {
  buildings: { castle: 1, barracks: 1 },
  garrison: ['ashigaru_yari'],
};

/** Provinz der Unabhängigen. */
export const NEUTRAL_SETUP: StartProvinceSetup = {
  buildings: { castle: 1 },
  garrison: ['ashigaru_yari', 'ashigaru_yari'],
};

/** Sonderfall Kyoto: schwer befestigt, gute Garnison. */
export const CAPITAL_SETUP: StartProvinceSetup = {
  buildings: { castle: 2, farm: 2, barracks: 1, bow_dojo: 1 },
  garrison: ['ashigaru_yari', 'ashigaru_yari', 'samurai_yari', 'yumi', 'yumi'],
};

/** Clan-spezifische Extra-Gebäude (Flair). */
export const CLAN_BONUS_BUILDINGS: Record<ClanId, Record<BuildingId, number>> = {
  kurogane: { sword_dojo: 1 },
  murasaki: { bow_dojo: 1 },
  akagane: { farm: 2 },
  matsukaze: { stables: 1, farm: 2 },
  kitakaze: { bow_dojo: 1 },
  aoyama: { castle: 3 },
};

export const START_ARMIES: StartArmy[] = [
  { clan: 'kurogane', location: 'satsuma', general: 'Kurogane Yoshihisa', stars: 3, isDaimyo: true, units: ['samurai_yari', 'samurai_yari', 'ashigaru_yari', 'ashigaru_yari', 'yumi'] },
  { clan: 'murasaki', location: 'aki', general: 'Murasaki Motonari', stars: 3, isDaimyo: true, units: ['samurai_yari', 'ashigaru_yari', 'ashigaru_yari', 'yumi', 'yumi'] },
  { clan: 'akagane', location: 'owari', general: 'Akagane Nobuhide', stars: 3, isDaimyo: true, units: ['samurai_yari', 'ashigaru_yari', 'ashigaru_yari', 'ashigaru_yari', 'yumi'] },
  { clan: 'matsukaze', location: 'kai', general: 'Matsukaze Harunobu', stars: 3, isDaimyo: true, units: ['kiba', 'kiba', 'samurai_yari', 'samurai_yari', 'ashigaru_yari', 'ashigaru_yari'] },
  { clan: 'kitakaze', location: 'echigo', general: 'Kitakaze Kagenori', stars: 4, isDaimyo: true, units: ['samurai_yari', 'ashigaru_yari', 'ashigaru_yari', 'yumi', 'kiba'] },
  { clan: 'aoyama', location: 'sagami', general: 'Aoyama Ujiyasu', stars: 3, isDaimyo: true, units: ['samurai_yari', 'samurai_yari', 'ashigaru_yari', 'ashigaru_yari', 'yumi'] },
];

/** Startbeziehungen (Default: Frieden mit Wert 0; Unabhängige: immer Krieg). */
export const START_RELATIONS: { a: ClanId; b: ClanId; state: 'war' | 'peace' | 'alliance'; value: number }[] = [
  { a: 'matsukaze', b: 'kitakaze', state: 'peace', value: -40 },
  { a: 'akagane', b: 'matsukaze', state: 'peace', value: 10 },
  { a: 'aoyama', b: 'matsukaze', state: 'alliance', value: 50 },
  { a: 'kurogane', b: 'murasaki', state: 'war', value: -50 },
];
