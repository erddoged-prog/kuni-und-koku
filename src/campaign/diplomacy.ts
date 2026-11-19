// Rudimentäre Diplomatie: Krieg, Frieden, Allianz, Geschenke, Beziehungswerte.
import { CAMPAIGN, CLAN_IDS, NEUTRAL_CLAN, relationKey } from '../data';
import type { ClanId, DiplomaticState, GameState } from '../data/types';
import { armyPower } from '../sim/power';
import { armiesOf, clanName, clone, fail, isAlive, log, ok, provincesOf, relation, type ActionResult } from './state';

const clamp = (v: number) => Math.max(-100, Math.min(100, v));

/** Mutiert s: Beziehungswert verschieben. */
export function adjustRelation(s: GameState, a: ClanId, b: ClanId, delta: number) {
  if (a === b || a === NEUTRAL_CLAN || b === NEUTRAL_CLAN) return;
  const r = relation(s, a, b);
  s.diplomacy[relationKey(a, b)] = { state: r.state, value: clamp(r.value + delta) };
}

function setState(s: GameState, a: ClanId, b: ClanId, st: DiplomaticState) {
  if (a === b || a === NEUTRAL_CLAN || b === NEUTRAL_CLAN) return;
  const r = relation(s, a, b);
  s.diplomacy[relationKey(a, b)] = { state: st, value: r.value };
}

/** Militärische Gesamtstärke eines Clans (Armeen + Garnisonen). */
export function clanStrength(s: GameState, clan: ClanId): number {
  let p = armiesOf(s, clan).reduce((acc, a) => acc + armyPower(a.units, a.general.stars), 0);
  for (const pid of provincesOf(s, clan)) p += armyPower(s.provinces[pid].garrison);
  return p;
}

/** Mutiert s. Verbündete des Opfers treten dem Krieg bei. */
export function applyWarDeclaration(s: GameState, a: ClanId, b: ClanId) {
  if (a === NEUTRAL_CLAN || b === NEUTRAL_CLAN || relation(s, a, b).state === 'war') return;
  const wasAllied = relation(s, a, b).state === 'alliance';
  setState(s, a, b, 'war');
  adjustRelation(s, a, b, CAMPAIGN.warDeclarationPenalty);
  log(s, `${clanName(a)} erklären ${clanName(b)} den Krieg${wasAllied ? ' und brechen ihr Bündnis' : ''}.`);
  for (const c of CLAN_IDS) {
    if (c === a || c === b || c === NEUTRAL_CLAN || !isAlive(s, c)) continue;
    if (wasAllied) adjustRelation(s, a, c, -15); // Verrat spricht sich herum
    if (relation(s, b, c).state === 'alliance') {
      if (relation(s, a, c).state === 'alliance') setState(s, a, c, 'peace');
      setState(s, c, a, 'war');
      adjustRelation(s, a, c, -30);
      log(s, `${clanName(c)} stehen ihrem Verbündeten ${clanName(b)} bei.`);
    }
  }
}

export function declareWar(state: GameState, a: ClanId, b: ClanId): ActionResult {
  if (a === b || b === NEUTRAL_CLAN) return fail(state, 'Kein gültiges Ziel.');
  if (relation(state, a, b).state === 'war') return fail(state, 'Ihr befindet euch bereits im Krieg.');
  const s = clone(state);
  applyWarDeclaration(s, a, b);
  return ok(s, `Krieg mit ${clanName(b)}!`);
}

/** Nimmt b ein Friedensangebot von a an? (einfache, deterministische Regel) */
export function acceptsPeace(s: GameState, a: ClanId, b: ClanId): boolean {
  const r = relation(s, a, b);
  const strA = clanStrength(s, a);
  const strB = clanStrength(s, b);
  // Unterlegene nehmen Frieden eher an; Überlegene nur bei guter Beziehung.
  const ratio = strB / Math.max(1, strA);
  const shift = ratio > 1.5 ? 25 : ratio < 0.5 ? -70 : ratio < 0.8 ? -35 : 0;
  const threshold = CAMPAIGN.peaceThreshold + shift;
  return r.value >= threshold;
}

export function proposePeace(state: GameState, a: ClanId, b: ClanId): ActionResult {
  if (b === NEUTRAL_CLAN) return fail(state, 'Mit den Unabhängigen kann man nicht verhandeln.');
  if (relation(state, a, b).state !== 'war') return fail(state, 'Ihr seid nicht im Krieg.');
  if (!acceptsPeace(state, a, b)) {
    const s = clone(state);
    adjustRelation(s, a, b, -3);
    return fail(s, `${clanName(b)} lehnen den Frieden ab.`);
  }
  const s = clone(state);
  setState(s, a, b, 'peace');
  adjustRelation(s, a, b, 10);
  log(s, `${clanName(a)} und ${clanName(b)} schließen Frieden.`);
  return ok(s, `${clanName(b)} nehmen den Frieden an.`);
}

export function acceptsAlliance(s: GameState, a: ClanId, b: ClanId): boolean {
  const r = relation(s, a, b);
  return r.state === 'peace' && r.value >= CAMPAIGN.allianceThreshold;
}

export function proposeAlliance(state: GameState, a: ClanId, b: ClanId): ActionResult {
  if (b === NEUTRAL_CLAN) return fail(state, 'Mit den Unabhängigen kann man nicht verhandeln.');
  const r = relation(state, a, b);
  if (r.state === 'alliance') return fail(state, 'Ihr seid bereits verbündet.');
  if (r.state === 'war') return fail(state, 'Erst muss Frieden herrschen.');
  if (!acceptsAlliance(state, a, b)) return fail(state, `${clanName(b)} trauen euch nicht genug (Beziehung ${r.value}, nötig ${CAMPAIGN.allianceThreshold}).`);
  const s = clone(state);
  setState(s, a, b, 'alliance');
  log(s, `${clanName(a)} und ${clanName(b)} schließen ein Bündnis.`);
  return ok(s, `Bündnis mit ${clanName(b)} geschlossen.`);
}

export function breakAlliance(state: GameState, a: ClanId, b: ClanId): ActionResult {
  if (relation(state, a, b).state !== 'alliance') return fail(state, 'Kein Bündnis.');
  const s = clone(state);
  setState(s, a, b, 'peace');
  adjustRelation(s, a, b, -30);
  log(s, `${clanName(a)} lösen das Bündnis mit ${clanName(b)}.`);
  return ok(s, 'Bündnis gelöst.');
}

export function sendGift(state: GameState, a: ClanId, b: ClanId, koku: number): ActionResult {
  if (b === NEUTRAL_CLAN || a === b) return fail(state, 'Kein gültiger Empfänger.');
  if (koku <= 0 || state.clans[a].treasury < koku) return fail(state, 'Nicht genug Koku.');
  const s = clone(state);
  s.clans[a].treasury -= koku;
  s.clans[b].treasury += koku;
  const pts = Math.round(koku / CAMPAIGN.giftKokuPerPoint);
  adjustRelation(s, a, b, pts);
  return ok(s, `${clanName(b)} nehmen das Geschenk an (+${pts} Beziehung).`);
}

/** Mutiert s: Beziehungen driften jede Runde (Frieden wärmt, Krieg ermüdet). */
export function driftRelations(s: GameState) {
  for (const [key, r] of Object.entries(s.diplomacy)) {
    const [a, b] = key.split('|');
    if (!isAlive(s, a) || !isAlive(s, b)) continue;
    let v = r.value;
    if (r.state === 'war') v = Math.min(0, v + CAMPAIGN.warWearinessGain);
    else if (r.state === 'alliance') v = Math.min(100, v + CAMPAIGN.peaceRelationGain);
    else if (v < 30) v = Math.min(30, v + CAMPAIGN.peaceRelationGain);
    else if (v > 30) v = Math.max(30, v - CAMPAIGN.relationDrift);
    s.diplomacy[key] = { state: r.state, value: v };
  }
}
