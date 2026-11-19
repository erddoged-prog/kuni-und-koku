import {
  CAMPAIGN, CAPITAL_ID, CAPITAL_SETUP, CLANS, CLAN_BONUS_BUILDINGS, CLAN_IDS, HOME_SETUP, NEUTRAL_CLAN, NEUTRAL_SETUP,
  PROVINCE_IDS, SECONDARY_SETUP, START_ARMIES, START_RELATIONS, relationKey,
} from '../data';
import type { ClanId, GameState, ProvinceState } from '../data/types';
import { log, newUnit } from './state';

export const SAVE_VERSION = 1;

/** Baut den Startzustand (Frühling 1545). */
export function createInitialState(playerClan: ClanId, seed: number): GameState {
  if (!CLANS[playerClan]?.playable) throw new Error(`Clan nicht spielbar: ${playerClan}`);
  const state: GameState = {
    version: SAVE_VERSION,
    turn: 0,
    startYear: CAMPAIGN.startYear,
    seed: seed >>> 0,
    playerClan,
    clans: {},
    provinces: {},
    armies: {},
    diplomacy: {},
    agents: [],
    nextId: 1,
    log: [],
  };

  for (const id of CLAN_IDS) {
    state.clans[id] = { id, treasury: id === NEUTRAL_CLAN ? 0 : CAMPAIGN.startTreasury, isPlayer: id === playerClan, defeated: false };
  }

  for (const pid of PROVINCE_IDS) {
    const owner = CLAN_IDS.find((c) => CLANS[c].startProvinces.includes(pid)) ?? NEUTRAL_CLAN;
    const setup =
      pid === CAPITAL_ID ? CAPITAL_SETUP : owner === NEUTRAL_CLAN ? NEUTRAL_SETUP : CLANS[owner].homeProvince === pid ? HOME_SETUP : SECONDARY_SETUP;
    const buildings = { ...setup.buildings };
    if (owner !== NEUTRAL_CLAN && CLANS[owner].homeProvince === pid) {
      for (const [b, lvl] of Object.entries(CLAN_BONUS_BUILDINGS[owner] ?? {})) buildings[b] = Math.max(buildings[b] ?? 0, lvl);
    }
    const p: ProvinceState = { id: pid, owner, buildings, garrison: setup.garrison.map((t) => newUnit(t)), queue: [] };
    state.provinces[pid] = p;
  }

  for (const a of START_ARMIES) {
    const id = `a${state.nextId++}`;
    state.armies[id] = {
      id,
      owner: a.clan,
      location: a.location,
      general: { id: `g${state.nextId++}`, name: a.general, stars: a.stars, xp: 0, isDaimyo: a.isDaimyo },
      units: a.units.map((t) => newUnit(t)),
      moved: false,
      stance: 'hold',
    };
  }

  for (const r of START_RELATIONS) state.diplomacy[relationKey(r.a, r.b)] = { state: r.state, value: r.value };

  log(state, `Die Kampagne beginnt. Ihr führt den Clan ${CLANS[playerClan].name}.`);
  return state;
}
