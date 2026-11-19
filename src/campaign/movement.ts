// Bewegung, Angriff, Belagerung, Sturm und Eroberung.
import { BUILDINGS, isSeaRoute, neighborsOf, seasonOf } from '../data';
import type { Army, ArmyId, ClanId, GameState, ProvinceId, Tactic } from '../data/types';
import { fight } from './combat';
import { applyWarDeclaration } from './diplomacy';
import {
  allied, armiesIn, atWar, castleLevel, clanName, clone, fail, log, ok, provinceName, relation,
  type ActionResult, type BattleRecord,
} from './state';

export interface MoveCheck {
  ok: boolean;
  reason?: string;
  /** Führt der Zug zu einem Kampf / einer Belagerung? */
  hostile?: boolean;
}

/** Feindliche Armeen (Krieg) in einer Provinz. */
function hostileArmies(s: GameState, pid: ProvinceId, clan: ClanId): Army[] {
  return armiesIn(s, pid).filter((a) => atWar(s, clan, a.owner));
}

export function canMove(state: GameState, armyId: ArmyId, to: ProvinceId): MoveCheck {
  const army = state.armies[armyId];
  if (!army) return { ok: false, reason: 'Armee existiert nicht.' };
  if (army.moved) return { ok: false, reason: 'Die Armee hat sich in dieser Runde schon bewegt.' };
  if (!neighborsOf(army.location).some((n) => n.id === to)) return { ok: false, reason: 'Nur in Nachbarprovinzen.' };
  if (isSeaRoute(army.location, to) && !seasonOf(state.turn).seaOpen) return { ok: false, reason: 'Im Winter ruhen die Seewege.' };
  const owner = state.provinces[to].owner;
  const hostileHere = hostileArmies(state, to, army.owner).length > 0;
  if (owner === army.owner || allied(state, army.owner, owner)) return { ok: true, hostile: hostileHere };
  const rel = relation(state, army.owner, owner);
  if (rel.state !== 'war') return { ok: false, reason: `Frieden mit ${clanName(owner)} – erst Krieg erklären.` };
  return { ok: true, hostile: true };
}

/** Alle erlaubten Ziele einer Armee. */
export function legalMoves(state: GameState, armyId: ArmyId): { to: ProvinceId; hostile: boolean }[] {
  const a = state.armies[armyId];
  if (!a) return [];
  return neighborsOf(a.location)
    .map((n) => ({ to: n.id, check: canMove(state, armyId, n.id) }))
    .filter((x) => x.check.ok)
    .map((x) => ({ to: x.to, hostile: !!x.check.hostile }));
}

/**
 * Bewegt eine Armee. Bei feindlichem Ziel: Feldschlacht gegen dortige Armeen
 * (und Garnison ohne Burg), danach Belagerung oder Einnahme.
 * `tactic` ist die Taktik des Angreifers in einer eventuellen Schlacht.
 */
export function moveArmy(state: GameState, armyId: ArmyId, to: ProvinceId, tactic: Tactic = 'attack'): ActionResult {
  const check = canMove(state, armyId, to);
  if (!check.ok) return fail(state, check.reason!);
  const s = clone(state);
  const army = s.armies[armyId];
  const from = army.location;
  const clan = army.owner;
  const battles: BattleRecord[] = [];
  army.moved = true;
  army.cameFrom = from;

  if (!check.hostile) {
    army.location = to;
    return ok(s, `Armee zieht nach ${provinceName(to)}.`);
  }

  const prov = s.provinces[to];
  // 1) Feldschlacht gegen Armeen des wichtigsten Gegners vor Ort
  const enemies = hostileArmies(s, to, clan);
  const defClan = enemies.some((e) => e.owner === prov.owner) ? prov.owner : enemies[0]?.owner ?? prov.owner;
  const defArmies = enemies.filter((e) => e.owner === defClan);
  const garrisonFights = prov.owner === defClan && castleLevel(s, to) === 0 && prov.garrison.length > 0 && atWar(s, clan, defClan);
  if (defArmies.length || garrisonFights) {
    const defTactic: Tactic = defArmies.length ? strongest(defArmies).stance : 'hold';
    const rec = fight(s, to, { clan, armies: [army], tactic }, { clan: defClan, armies: defArmies, withGarrison: garrisonFights, tactic: defTactic }, 'field');
    battles.push(rec);
    if (rec.result.winner === 'defender') {
      if (s.armies[armyId]) s.armies[armyId].location = from; // zurück in die Ausgangsprovinz
      return ok(s, `Niederlage in ${provinceName(to)} – die Armee weicht zurück.`, battles);
    }
    // Besiegte Armeen ziehen sich zurück
    for (const d of defArmies) if (s.armies[d.id]) retreat(s, s.armies[d.id], from);
    liftSiegeIfAbandoned(s, to); // Entsatz einer eigenen, belagerten Burg
  }
  if (!s.armies[armyId]) return ok(s, 'Die Armee wurde aufgerieben.', battles);
  s.armies[armyId].location = to;

  // 2) Provinz eines Kriegsgegners: Belagerung oder Einnahme
  if (prov.owner !== clan && atWar(s, clan, prov.owner)) {
    if (castleLevel(s, to) > 0 && prov.garrison.length > 0) {
      if (!prov.siege || prov.siege.besieger !== clan) {
        prov.siege = { besieger: clan, turns: 0 };
        log(s, `${clanName(clan)} belagern ${provinceName(to)}.`);
      }
      return ok(s, `Belagerung von ${provinceName(to)} begonnen. Die Vorräte reichen ${supplyTurns(s, to)} Runden.`, battles);
    }
    capture(s, to, clan);
    return ok(s, `${provinceName(to)} eingenommen!`, battles);
  }
  return ok(s, battles.length ? `Sieg in ${provinceName(to)}!` : `Armee zieht nach ${provinceName(to)}.`, battles);
}

/** Erklärt bei Bedarf Krieg (nur für KI/Komfort) und greift an. */
export function attackWithWar(state: GameState, armyId: ArmyId, to: ProvinceId, tactic: Tactic): ActionResult {
  const s = clone(state);
  const a = s.armies[armyId];
  if (a && relation(s, a.owner, s.provinces[to].owner).state === 'peace') applyWarDeclaration(s, a.owner, s.provinces[to].owner);
  return moveArmy(s, armyId, to, tactic);
}

export function supplyTurns(s: GameState, pid: ProvinceId): number {
  const lvl = castleLevel(s, pid);
  return lvl > 0 ? BUILDINGS.castle.levels[lvl - 1].supplyTurns ?? 0 : 0;
}

/** Sturm auf eine belagerte Burg. */
export function assault(state: GameState, armyId: ArmyId, tactic: Tactic = 'attack'): ActionResult {
  const a = state.armies[armyId];
  if (!a) return fail(state, 'Armee existiert nicht.');
  const prov = state.provinces[a.location];
  if (!prov.siege || prov.siege.besieger !== a.owner) return fail(state, 'Hier wird keine Burg belagert.');
  if (a.moved) return fail(state, 'Die Armee ist in dieser Runde schon im Einsatz gewesen.');
  const s = clone(state);
  const army = s.armies[armyId];
  army.moved = true;
  const pid = army.location;
  const rec = fight(s, pid, { clan: army.owner, armies: [army], tactic }, { clan: prov.owner, armies: [], withGarrison: true, tactic: 'hold' }, 'assault');
  if (rec.result.winner === 'attacker' || s.provinces[pid].garrison.length === 0) {
    capture(s, pid, rec.attacker);
    return ok(s, `Die Burg von ${provinceName(pid)} ist gefallen!`, [rec]);
  }
  if (s.armies[armyId]) retreat(s, s.armies[armyId], undefined);
  liftSiegeIfAbandoned(s, pid);
  return ok(s, `Der Sturm auf ${provinceName(pid)} ist gescheitert.`, [rec]);
}

/** Mutiert s: Provinz wechselt den Besitzer. */
export function capture(s: GameState, pid: ProvinceId, clan: ClanId) {
  const prov = s.provinces[pid];
  const old = prov.owner;
  prov.owner = clan;
  prov.garrison = [];
  prov.queue = [];
  prov.siege = undefined;
  log(s, `${clanName(clan)} erobern ${provinceName(pid)} von ${clanName(old)}.`);
  // Feindliche Armeen, die noch hier stehen (z. B. Verbündete des Alten), weichen.
  for (const a of armiesIn(s, pid)) if (a.owner !== clan && !allied(s, a.owner, clan)) retreat(s, a, undefined);
}

/** Mutiert s: Armee weicht in eine sichere Nachbarprovinz aus – oder wird aufgerieben. */
export function retreat(s: GameState, army: Army, avoid: ProvinceId | undefined) {
  const options = neighborsOf(army.location)
    .map((n) => n.id)
    .filter((pid) => pid !== avoid && allied(s, army.owner, s.provinces[pid].owner))
    .filter((pid) => !armiesIn(s, pid).some((a) => atWar(s, army.owner, a.owner)));
  const prefer = army.cameFrom && options.includes(army.cameFrom) ? army.cameFrom : options[0];
  if (prefer) {
    army.location = prefer;
    army.moved = true;
  } else {
    log(s, `Die Armee von ${army.general.name} ist eingeschlossen und wird aufgerieben.`);
    delete s.armies[army.id];
  }
}

export function liftSiegeIfAbandoned(s: GameState, pid: ProvinceId) {
  const prov = s.provinces[pid];
  if (prov.siege && !armiesIn(s, pid, prov.siege.besieger).length) {
    log(s, `Die Belagerung von ${provinceName(pid)} ist aufgehoben.`);
    prov.siege = undefined;
  }
}

function strongest(armies: Army[]): Army {
  return [...armies].sort((a, b) => b.units.length - a.units.length)[0];
}
