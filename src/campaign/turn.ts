// Rundenablauf: KI-Züge, dann Rundenende (Wirtschaft, Bau, Belagerung, Nachschub, Zermürbung, Diplomatie).
import { CAMPAIGN, CAPITAL_ID, CLAN_IDS, CLANS, NEUTRAL_CLAN, UNIT_TYPES, seasonOf } from '../data';
import type { ClanId, GameState } from '../data/types';
import { processQueues } from './construction';
import { driftRelations } from './diplomacy';
import { clanIncome, clanUpkeep } from './economy';
import { capture, liftSiegeIfAbandoned, supplyTurns } from './movement';
import { allied, armiesOf, clanName, clone, isAlive, log, provinceName, provincesOf, type ActionResult, type BattleRecord } from './state';

/** Schnittstelle für die KI: führt alle Aktionen eines Clans aus. */
export type AiHook = (state: GameState, clan: ClanId) => ActionResult;

export interface TurnResult {
  state: GameState;
  battles: BattleRecord[];
  /** Kurze Ereignisse dieser Runde für das UI. */
  events: string[];
}

/** Beendet die Runde des Spielers: KI-Clans ziehen, dann Rundenende. */
export function endTurn(state: GameState, ai?: AiHook): TurnResult {
  let s = clone(state);
  const battles: BattleRecord[] = [];
  const logStart = s.log.length;
  if (ai) {
    for (const clan of CLAN_IDS) {
      if (clan === NEUTRAL_CLAN || clan === s.playerClan || s.clans[clan].defeated) continue;
      const res = ai(s, clan);
      s = res.state;
      battles.push(...res.battles);
    }
  }
  roundEnd(s);
  return { state: s, battles, events: s.log.slice(Math.min(logStart, s.log.length)) };
}

/** Mutiert s: alles, was am Ende jeder Runde passiert. */
export function roundEnd(s: GameState) {
  const season = seasonOf(s.turn);

  // Wirtschaft
  const indebted = new Set<ClanId>();
  for (const clan of CLAN_IDS) {
    if (clan === NEUTRAL_CLAN || s.clans[clan].defeated) continue;
    const net = clanIncome(s, clan) - clanUpkeep(s, clan);
    s.clans[clan].treasury += net;
    if (s.clans[clan].treasury < 0) {
      desertion(s, clan);
      indebted.add(clan);
    }
  }

  processQueues(s);

  // Belagerungen
  for (const p of Object.values(s.provinces)) {
    if (!p.siege) continue;
    liftSiegeIfAbandoned(s, p.id);
    if (!p.siege) continue;
    p.siege.turns++;
    // Hunger: die Garnison schwindet
    for (const u of p.garrison) u.men = Math.max(0, Math.floor(u.men * 0.93));
    p.garrison = p.garrison.filter((u) => u.men > 0);
    if (p.siege.turns >= supplyTurns(s, p.id) || p.garrison.length === 0) {
      log(s, `Die ausgehungerte Garnison von ${provinceName(p.id)} ergibt sich.`);
      capture(s, p.id, p.siege.besieger);
    }
  }

  // Nachschub in eigenen, unbelagerten Provinzen (nicht bei leerer Kasse)
  for (const p of Object.values(s.provinces)) {
    if (p.siege || indebted.has(p.owner)) continue;
    const refill = (u: { type: string; men: number }) => {
      const max = UNIT_TYPES[u.type].men;
      u.men = Math.min(max, u.men + Math.ceil(max * CAMPAIGN.replenishRate));
    };
    p.garrison.forEach(refill);
    for (const a of armiesOf(s, p.owner)) if (a.location === p.id) a.units.forEach(refill);
  }

  // Winter-Zermürbung für Armeen in fremden Provinzen
  if (season.attrition > 0) {
    for (const a of Object.values(s.armies)) {
      if (allied(s, a.owner, s.provinces[a.location].owner)) continue;
      for (const u of a.units) u.men = Math.floor(u.men * (1 - season.attrition));
      a.units = a.units.filter((u) => u.men > 0);
      if (!a.units.length) delete s.armies[a.id];
    }
  }

  driftRelations(s);
  for (const a of Object.values(s.armies)) a.moved = false;
  s.turn++;
  updateDefeats(s);
  checkVictory(s);
}

/** Bei Schulden laufen Truppen davon: jede Armee-Einheit verliert 10 %. */
function desertion(s: GameState, clan: ClanId) {
  for (const a of armiesOf(s, clan)) {
    for (const u of a.units) u.men = Math.floor(u.men * 0.9);
    a.units = a.units.filter((u) => u.men > 0);
    if (!a.units.length) delete s.armies[a.id];
  }
  if (s.clans[clan].isPlayer) log(s, 'Die Schatzkammer ist leer – unbezahlte Truppen desertieren!');
}

function updateDefeats(s: GameState) {
  for (const clan of CLAN_IDS) {
    if (clan === NEUTRAL_CLAN || s.clans[clan].defeated) continue;
    if (!isAlive(s, clan)) {
      s.clans[clan].defeated = true;
      log(s, `Der Clan ${clanName(clan)} ist vernichtet.`);
    }
  }
}

/** Mutiert s: setzt s.winner, falls ein Clan gewonnen hat. */
export function checkVictory(s: GameState) {
  if (s.winner) return;
  const alive = CLAN_IDS.filter((c) => CLANS[c].playable && !s.clans[c].defeated);
  for (const clan of alive) {
    if (s.provinces[CAPITAL_ID].owner === clan && provincesOf(s, clan).length >= CAMPAIGN.victoryProvinces) {
      s.winner = clan;
      log(s, `${clanName(clan)} beherrschen Kyōto und ${provincesOf(s, clan).length} Provinzen – das Reich ist geeint!`);
      return;
    }
  }
  if (alive.length === 1) {
    s.winner = alive[0];
    log(s, `${clanName(alive[0])} haben alle Rivalen vernichtet!`);
  }
}

/** Hat der Spieler verloren? */
export function playerDefeated(s: GameState): boolean {
  return s.clans[s.playerClan].defeated || (!!s.winner && s.winner !== s.playerClan);
}
