// Standard-Gegner-KI. Eigene Datei, damit sie leicht gegen eine andere ausgetauscht werden kann:
// Jede KI ist nur eine Funktion vom Typ AiHook (state, clan) => ActionResult.
//
// Ablauf eines Zuges:
//   1. Lage erfassen (Bedrohung je Provinz, Grenzprovinzen, Gegner-Einheitenmix)
//   2. Armeen am selben Ort vereinigen
//   3. Wirtschaft: Reisfelder (vor Militär, außer bei akuter Gefahr), Kaserne/Burg
//   4. Belagerungen: stürmen bei guter Chance, sonst weiter aushungern
//   5. Verteidigung: freie Armeen in bedrohte Nachbarprovinzen
//   6. Angriff: Nachbarprovinzen nach Wert × Siegchance bewerten, nur bei Vorteil
//   7. Garnisonen in Grenzprovinzen auffüllen
//   8. Rekrutieren: Konter gegen den Einheitenmix der Gegner, im Rahmen des Unterhalts
import { BUILDINGS, CAMPAIGN, CAPITAL_ID, COUNTERS, NEUTRAL_CLAN, PROVINCES, UNIT_TYPES, UNIT_TYPE_IDS, neighborsOf, seasonOf } from '../data';
import type { Army, ClanId, GameState, ProvinceId, Tactic, UnitRole } from '../data/types';
import {
  allied, armiesIn, armiesOf, assault, attackWithWar, canMove, canRecruit, castleLevel, clanIncome, clanStrength,
  clanUpkeep, kokuBonus, mergeArmies, moveArmy, newUnit, ok, provincesOf, queueBuilding, queueUnit, relation, transferUnits,
  type ActionResult, type AiHook, type BattleRecord,
} from '../campaign';
import { armyPower, unitPower } from '../sim/power';

export interface AiConfig {
  /** Mindest-Kraftverhältnis (eigene / feindliche Stärke) vor der genaueren Prüfung. */
  minPowerRatio: number;
  /** Mindest-Siegchance (Probeschlachten) für einen Angriff. */
  minWinChance: number;
  /** Mindest-Siegchance für einen Sturm auf eine Burg. */
  minAssaultChance: number;
  /** Probeschlachten je Taktik. */
  trials: number;
  /** Gesamtstärke-Vorsprung, ab dem ein Clan einem Nachbarn im Frieden den Krieg erklärt. */
  warStrengthRatio: number;
  /** Frühestens ab dieser Runde Kriegserklärungen. */
  warFromTurn: number;
  /** Höchstens so viele Kriege gleichzeitig gegen große Clans (Unabhängige zählen nicht). */
  maxWars: number;
  /** Anteil des Einkommens, den der Unterhalt höchstens ausmachen darf (ruhige Lage / Bedrohung). */
  upkeepShareCalm: number;
  upkeepShareThreat: number;
  /** Rücklage in Runden-Unterhalt (mindestens minReserve Koku). */
  reserveTurns: number;
  minReserve: number;
  /** Maximal akzeptierte Amortisationszeit eines Reisfeldes in Runden. */
  farmPaybackTurns: number;
  /** Höchstens so viele neue Rekrutierungen pro Zug. */
  maxRecruitsPerTurn: number;
  /** Eine Armee behält beim Abgeben an Garnisonen mindestens so viele Einheiten. */
  minArmyUnits: number;
  /** Ab dieser Kasse gilt der Clan als reich: mehr Ausbau, mehr Rekruten. */
  richTreasury: number;
  /** Ohne eigenes Land (kein Einkommen): niedrigere Schwellen für Angriffe. */
  desperateRatio: number;
  desperateWinChance: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  minPowerRatio: 1.15,
  minWinChance: 0.65,
  minAssaultChance: 0.7,
  trials: 6,
  warStrengthRatio: 1.4,
  warFromTurn: 4,
  maxWars: 1,
  upkeepShareCalm: 0.65,
  upkeepShareThreat: 0.9,
  reserveTurns: 2,
  minReserve: 200,
  farmPaybackTurns: 26,
  maxRecruitsPerTurn: 2,
  minArmyUnits: 4,
  richTreasury: 3000,
  desperateRatio: 0.6,
  desperateWinChance: 0.3,
};

const ROLES: UnitRole[] = ['spear', 'cavalry', 'ranged', 'sword'];
const REF_UNIT_POWER = unitPower(newUnit('ashigaru_yari'));

/** Lagebild eines Clans zu Beginn (und nach Änderungen neu berechnet). */
interface Situation {
  own: ProvinceId[];
  /** Feindliche (bzw. potenziell feindliche) Kraft in Nachbarprovinzen. */
  threat: Record<ProvinceId, number>;
  /** Eigene Verteidigungskraft vor Ort (Armeen + Garnison). */
  defense: Record<ProvinceId, number>;
  border: Set<ProvinceId>;
  /** Mannstärke je Rolle bei benachbarten Gegnern. */
  enemyRoles: Record<UnitRole, number>;
}

/** Erzeugt eine KI mit eigener Konfiguration. */
export function createStandardAi(config: Partial<AiConfig> = {}): AiHook {
  const cfg = { ...DEFAULT_AI_CONFIG, ...config };
  return (state, clan) => new Turn(state, clan, cfg).run();
}

/** Die Standard-KI mit Grundeinstellungen. */
export const standardAi: AiHook = createStandardAi();

class Turn {
  private battles: BattleRecord[] = [];
  private busy = new Set<string>();
  private recruits = 0;

  constructor(private s: GameState, private clan: ClanId, private cfg: AiConfig) {}

  run(): ActionResult {
    this.mergeArmies();
    let sit = this.situate();
    const danger = this.inDanger(sit);
    if (!danger) this.buildEconomy(sit);
    this.handleSieges();
    this.defend(sit);
    this.attack();
    sit = this.situate();
    this.garrisonBorders(sit);
    this.recruit(sit);
    this.buildMilitary(sit);
    if (danger) this.buildEconomy(sit);
    return ok(this.s, undefined, this.battles);
  }

  // -------------------------------------------------------------------------
  // Hilfen
  // -------------------------------------------------------------------------

  /** Übernimmt das Ergebnis einer Aktion, falls sie gelang. */
  private apply(res: ActionResult): boolean {
    if (!res.ok) return false;
    this.s = res.state;
    this.battles.push(...res.battles);
    return true;
  }

  private get treasury() {
    return this.s.clans[this.clan].treasury;
  }

  private get rich() {
    return this.treasury >= this.cfg.richTreasury;
  }

  private reserve(): number {
    return Math.max(this.cfg.minReserve, clanUpkeep(this.s, this.clan) * this.cfg.reserveTurns);
  }

  /** Ist der andere Clan (potenziell) feindlich? Gewichtet: Krieg 1, Frieden 0,5, Unabhängige 0,3. */
  private hostility(other: ClanId): number {
    if (other === this.clan || allied(this.s, this.clan, other)) return 0;
    if (other === NEUTRAL_CLAN) return 0.3;
    return relation(this.s, this.clan, other).state === 'war' ? 1 : 0.5;
  }

  private situate(): Situation {
    const own = provincesOf(this.s, this.clan);
    const threat: Record<ProvinceId, number> = {};
    const defense: Record<ProvinceId, number> = {};
    const border = new Set<ProvinceId>();
    const enemyRoles: Record<UnitRole, number> = { spear: 0, cavalry: 0, ranged: 0, sword: 0 };
    const seenArmies = new Set<string>();
    for (const pid of own) {
      const p = this.s.provinces[pid];
      defense[pid] = armyPower(p.garrison) + armiesIn(this.s, pid, this.clan).reduce((a, x) => a + armyPower(x.units, x.general.stars), 0);
      threat[pid] = 0;
      for (const n of neighborsOf(pid)) {
        const np = this.s.provinces[n.id];
        if (this.hostility(np.owner) > 0) border.add(pid);
        for (const a of armiesIn(this.s, n.id)) {
          const h = this.hostility(a.owner);
          if (!h) continue;
          threat[pid] += h * armyPower(a.units, a.general.stars);
          if (!seenArmies.has(a.id)) {
            seenArmies.add(a.id);
            for (const u of a.units) enemyRoles[UNIT_TYPES[u.type].role] += u.men * h;
          }
        }
      }
      // Feindliche Armeen in der eigenen Provinz (Belagerer) zählen voll.
      for (const a of armiesIn(this.s, pid)) {
        if (this.hostility(a.owner) === 1) threat[pid] += armyPower(a.units, a.general.stars);
      }
    }
    return { own, threat, defense, border, enemyRoles };
  }

  private inDanger(sit: Situation): boolean {
    return sit.own.some((pid) => sit.threat[pid] > sit.defense[pid] * 1.2 && sit.threat[pid] > REF_UNIT_POWER * 2);
  }

  /** Wert einer Provinz für Eroberung: Ertrag, Ausbau, Hauptstadt. */
  private provinceValue(pid: ProvinceId): number {
    const p = this.s.provinces[pid];
    const built = Object.values(p.buildings).reduce((a, l) => a + l, 0);
    return PROVINCES[pid].koku * (1 + kokuBonus(this.s, pid)) + built * 15 + (pid === CAPITAL_ID ? 250 : 0);
  }

  /** Feindliche Kraft, die sich einer Armee beim Einmarsch in pid entgegenstellt. */
  private opposition(pid: ProvinceId): number {
    const p = this.s.provinces[pid];
    let power = 0;
    for (const a of armiesIn(this.s, pid)) if (this.hostility(a.owner) > 0) power += armyPower(a.units, a.general.stars);
    if (p.owner !== this.clan && castleLevel(this.s, pid) === 0) power += armyPower(p.garrison);
    return power;
  }

  /** Siegchance per Probeschlachten; liefert beste Taktik. undefined-Chance = kein Kampf nötig. */
  private estimate(run: (trial: GameState, tactic: Tactic) => ActionResult, tactics: Tactic[]): { tactic: Tactic; chance: number | undefined } {
    let best: { tactic: Tactic; chance: number | undefined } = { tactic: tactics[0], chance: 0 };
    for (const tactic of tactics) {
      let fights = 0;
      let wins = 0;
      for (let i = 0; i < this.cfg.trials; i++) {
        const trial = { ...this.s, seed: ((this.s.seed ^ 0x2f6b9e1d) + i * 104729) >>> 0 };
        const r = run(trial, tactic);
        if (!r.ok) return { tactic, chance: 0 };
        if (!r.battles.length) continue;
        fights++;
        if (r.battles.every((b) => b.result.winner === 'attacker')) wins++;
      }
      if (!fights) return { tactic, chance: undefined };
      const chance = wins / fights;
      if (best.chance === undefined || chance > best.chance) best = { tactic, chance };
    }
    return best;
  }

  private freeArmies(): Army[] {
    return armiesOf(this.s, this.clan).filter((a) => !a.moved && !this.busy.has(a.id) && this.s.armies[a.id]);
  }

  // -------------------------------------------------------------------------
  // 2. Armeen vereinigen
  // -------------------------------------------------------------------------
  private mergeArmies() {
    for (const pid of provincesOf(this.s, this.clan)) {
      const here = armiesIn(this.s, pid, this.clan).filter((a) => !a.moved).sort((a, b) => b.general.stars - a.general.stars);
      for (let i = 1; i < here.length; i++) {
        const into = here[0];
        if (this.s.armies[into.id] && this.s.armies[here[i].id]) this.apply(mergeArmies(this.s, this.clan, here[i].id, into.id));
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Wirtschaft
  // -------------------------------------------------------------------------
  private buildEconomy(sit: Situation) {
    // Sichere, ertragreiche Provinzen zuerst.
    const order = [...sit.own].sort((a, b) => sit.threat[a] - sit.threat[b] || PROVINCES[b].koku - PROVINCES[a].koku);
    for (const pid of order) {
      const p = this.s.provinces[pid];
      if (p.siege || p.queue.some((q) => q.kind === 'building')) continue;
      const lvl = p.buildings.farm ?? 0;
      const next = BUILDINGS.farm.levels[lvl];
      if (!next) continue;
      const gain = PROVINCES[pid].koku * (next.kokuBonus! - (lvl ? BUILDINGS.farm.levels[lvl - 1].kokuBonus! : 0));
      const payback = this.cfg.farmPaybackTurns * (this.rich ? 2 : 1);
      if (next.cost / Math.max(1, gain) > payback) continue;
      if (this.treasury - next.cost < this.reserve()) return;
      this.apply(queueBuilding(this.s, this.clan, pid, 'farm'));
    }
  }

  /** Militärische Gebäude: Kaserne, Burg an bedrohter Grenze, Schulen für gebrauchte Konter. */
  private buildMilitary(sit: Situation) {
    const can = (pid: ProvinceId) => !this.s.provinces[pid].queue.some((q) => q.kind === 'building');
    const afford = (b: string, pid: ProvinceId) => {
      const lvl = BUILDINGS[b].levels[(this.s.provinces[pid].buildings[b] ?? 0)];
      return !!lvl && this.treasury - lvl.cost >= this.reserve();
    };
    // Burg in der stärkst bedrohten Grenzprovinz ohne Burg
    const exposed = [...sit.border].filter((pid) => castleLevel(this.s, pid) === 0 && sit.threat[pid] > REF_UNIT_POWER * 3);
    exposed.sort((a, b) => sit.threat[b] - sit.threat[a]);
    if (exposed[0] && can(exposed[0]) && afford('castle', exposed[0])) this.apply(queueBuilding(this.s, this.clan, exposed[0], 'castle'));

    // Reich: eroberte Grenzprovinzen ausbauen (Kaserne für Nachschub an der Front, dann Burg).
    if (this.rich) {
      const front = [...sit.border].sort((a, b) => sit.threat[b] - sit.threat[a] || PROVINCES[b].koku - PROVINCES[a].koku);
      for (const pid of front) {
        if (!can(pid)) continue;
        const b = !this.s.provinces[pid].buildings.barracks ? 'barracks' : castleLevel(this.s, pid) < 2 ? 'castle' : undefined;
        if (b && afford(b, pid)) this.apply(queueBuilding(this.s, this.clan, pid, b));
      }
    }

    // Fehlt für die gewünschte Konter-Rolle jede Ausbildungsstätte? Dann eine bauen.
    const role = this.bestRole(sit);
    const recruitable = sit.own.some((pid) => this.recruitableTypes(pid).some((t) => UNIT_TYPES[t].role === role));
    if (recruitable) return;
    const unlock: Record<UnitRole, string> = { spear: 'spear_dojo', cavalry: 'stables', ranged: 'bow_dojo', sword: 'sword_dojo' };
    const b = unlock[role];
    const sites = [...sit.own].sort((x, y) => castleLevel(this.s, y) - castleLevel(this.s, x) || PROVINCES[y].koku - PROVINCES[x].koku);
    for (const pid of sites) {
      if (!can(pid) || !afford(b, pid)) continue;
      if (this.apply(queueBuilding(this.s, this.clan, pid, b))) return;
      // Voraussetzung fehlt? Erst die Kaserne / Burg.
      for (const pre of ['barracks', 'castle']) if (afford(pre, pid) && this.apply(queueBuilding(this.s, this.clan, pid, pre))) return;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Belagerungen
  // -------------------------------------------------------------------------
  private handleSieges() {
    for (const a of this.freeArmies()) {
      const prov = this.s.provinces[a.location];
      if (!prov.siege || prov.siege.besieger !== this.clan) continue;
      this.busy.add(a.id); // bleibt in jedem Fall: Abzug würde die Belagerung aufheben
      const est = this.estimate((t, tac) => assault(t, a.id, tac), ['attack', 'flank']);
      if ((est.chance ?? 1) >= this.cfg.minAssaultChance) this.apply(assault(this.s, a.id, est.tactic));
    }
  }

  // -------------------------------------------------------------------------
  // 5. Verteidigung
  // -------------------------------------------------------------------------
  private defend(sit: Situation) {
    const endangered = sit.own
      .filter((pid) => sit.threat[pid] > sit.defense[pid] && sit.threat[pid] > REF_UNIT_POWER * 2)
      .sort((a, b) => this.provinceValue(b) - this.provinceValue(a));
    for (const pid of endangered) {
      // Schon eine Armee vor Ort? Dann bleibt sie.
      for (const a of armiesIn(this.s, pid, this.clan)) this.busy.add(a.id);
      if (sit.defense[pid] >= sit.threat[pid]) continue;
      const helper = this.freeArmies()
        .filter((a) => a.location !== pid && canMove(this.s, a.id, pid).ok && !canMove(this.s, a.id, pid).hostile)
        .filter((a) => sit.threat[a.location] <= (sit.defense[a.location] - armyPower(a.units, a.general.stars)) || !sit.own.includes(a.location))
        .sort((a, b) => armyPower(b.units, b.general.stars) - armyPower(a.units, a.general.stars))[0];
      if (helper && this.apply(moveArmy(this.s, helper.id, pid))) {
        this.busy.add(helper.id);
        sit.defense[pid] += armyPower(helper.units, helper.general.stars);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Angriff
  // -------------------------------------------------------------------------
  private warCount(): number {
    return Object.keys(this.s.clans).filter((c) => c !== NEUTRAL_CLAN && c !== this.clan && !this.s.clans[c].defeated && relation(this.s, this.clan, c).state === 'war').length;
  }

  /** Darf der Clan gegen diesen Provinzbesitzer vorgehen (ggf. mit Kriegserklärung)? */
  private mayAttack(owner: ClanId): boolean {
    if (owner === this.clan || allied(this.s, this.clan, owner)) return false;
    const rel = relation(this.s, this.clan, owner);
    if (rel.state === 'war') return true;
    if (this.s.turn < this.cfg.warFromTurn || this.warCount() >= this.cfg.maxWars || rel.value > 0) return false;
    return clanStrength(this.s, this.clan) >= clanStrength(this.s, owner) * this.cfg.warStrengthRatio;
  }

  private attack() {
    const winter = seasonOf(this.s.turn).attrition > 0;
    // Ohne eigenes Land gibt es kein Einkommen: dann lieber riskant angreifen als verhungern.
    const desperate = provincesOf(this.s, this.clan).length === 0;
    const minRatio = desperate ? this.cfg.desperateRatio : this.cfg.minPowerRatio;
    const minChance = desperate ? this.cfg.desperateWinChance : this.cfg.minWinChance;
    let progress = true;
    while (progress) {
      progress = false;
      const sit = this.situate();
      let best: { army: Army; to: ProvinceId; tactic: Tactic; score: number } | undefined;
      for (const army of this.freeArmies()) {
        const power = armyPower(army.units, army.general.stars);
        // Bleibt die Heimat ausreichend geschützt, wenn die Armee abzieht?
        const home = army.location;
        const leftBehind = (sit.defense[home] ?? 0) - power;
        const homeSafe = !sit.own.includes(home) || sit.threat[home] <= Math.max(0, leftBehind) * 1.1 || this.s.provinces[home].garrison.length >= 2 && sit.threat[home] < REF_UNIT_POWER * 2;
        for (const n of neighborsOf(home)) {
          const target = this.s.provinces[n.id];
          if (target.owner === this.clan || !this.mayAttack(target.owner)) continue;
          if (!canMove(this.s, army.id, n.id).ok && relation(this.s, this.clan, target.owner).state !== 'peace') continue;
          // Heimat nur verlassen, wenn sicher – oder wenn das Ziel die Bedrohung selbst ist.
          const targetIsThreat = armiesIn(this.s, n.id).some((a) => this.hostility(a.owner) === 1);
          if (!homeSafe && !targetIsThreat) continue;
          const castle = castleLevel(this.s, n.id) > 0 && target.garrison.length > 0;
          if (winter && castle && !desperate) continue; // Winterbelagerung zermürbt nur
          const opp = this.opposition(n.id);
          if (opp > 0 && power < opp * minRatio) continue;
          const est = this.estimate((t, tac) => attackWithWar(t, army.id, n.id, tac), ['attack', 'hold', 'flank']);
          const chance = est.chance ?? 1;
          if (chance < minChance) continue;
          // Belagerung bindet die Armee: Wert gegen Dauer abwägen.
          const siegeFactor = castle ? 1 / (1 + castleLevel(this.s, n.id)) : 1;
          const score = this.provinceValue(n.id) * chance * siegeFactor * (targetIsThreat ? 1.5 : 1);
          if (!best || score > best.score) best = { army, to: n.id, tactic: est.tactic, score };
        }
      }
      if (best) {
        this.busy.add(best.army.id);
        this.reinforceGarrisonBeforeLeaving(best.army.id, sit);
        if (this.s.armies[best.army.id]) this.apply(attackWithWar(this.s, best.army.id, best.to, best.tactic));
        progress = true; // die Armee ist jetzt beschäftigt, weiter mit den übrigen
      }
    }
  }

  /** Vor dem Abmarsch: schwächste Einheiten in die Garnison einer Grenzprovinz. */
  private reinforceGarrisonBeforeLeaving(armyId: string, sit: Situation) {
    const a = this.s.armies[armyId];
    if (!a || !sit.border.has(a.location) || this.s.provinces[a.location].owner !== this.clan) return;
    const want = this.garrisonTarget(a.location, sit) - this.s.provinces[a.location].garrison.length;
    this.giveToGarrison(a, want);
  }

  // -------------------------------------------------------------------------
  // 7. Garnisonen
  // -------------------------------------------------------------------------
  private garrisonTarget(pid: ProvinceId, sit: Situation): number {
    if (!sit.border.has(pid)) return 0;
    const extra = Math.floor(sit.threat[pid] / (REF_UNIT_POWER * 2));
    return Math.min(CAMPAIGN.maxGarrisonUnits, 1 + (sit.threat[pid] > 0 ? 1 : 0) + extra);
  }

  private giveToGarrison(a: Army, want: number) {
    const spare = a.units.length - this.cfg.minArmyUnits;
    const room = CAMPAIGN.maxGarrisonUnits - this.s.provinces[a.location].garrison.length;
    const n = Math.min(want, spare, room);
    if (n <= 0) return;
    // Billigste Einheiten (Ashigaru) bleiben in der Burg.
    const idx = a.units.map((u, i) => ({ i, c: UNIT_TYPES[u.type].cost })).sort((x, y) => x.c - y.c).slice(0, n).map((x) => x.i);
    this.apply(transferUnits(this.s, this.clan, a.location, { army: a.id }, 'garrison', idx));
  }

  private garrisonBorders(sit: Situation) {
    // Splitter-Armeen (1–2 Einheiten) in eigenen Provinzen gehen in die Burg, statt Generäle zu binden.
    for (const a of this.freeArmies()) {
      const p = this.s.provinces[a.location];
      if (a.units.length > 2 || a.general.isDaimyo || p.owner !== this.clan || p.siege) continue;
      if (p.garrison.length + a.units.length > CAMPAIGN.maxGarrisonUnits) continue;
      this.apply(transferUnits(this.s, this.clan, a.location, { army: a.id }, 'garrison', a.units.map((_, i) => i)));
    }
    for (const pid of sit.border) {
      const want = this.garrisonTarget(pid, sit) - this.s.provinces[pid].garrison.length;
      if (want <= 0) continue;
      const a = armiesIn(this.s, pid, this.clan).sort((x, y) => y.units.length - x.units.length)[0];
      if (a) this.giveToGarrison(a, want);
    }
  }

  // -------------------------------------------------------------------------
  // 8. Rekrutieren mit Kontern
  // -------------------------------------------------------------------------
  private roleScores(sit: Situation): Record<UnitRole, number> {
    return counterScores(sit.enemyRoles);
  }

  private bestRole(sit: Situation): UnitRole {
    return counterRoleFor(sit.enemyRoles);
  }

  private recruitableTypes(pid: ProvinceId): string[] {
    // Kosten ignorieren: nur Gebäude/Jahr prüfen (Geld wird separat geprüft).
    const rich = { ...this.s, clans: { ...this.s.clans, [this.clan]: { ...this.s.clans[this.clan], treasury: Infinity } } };
    return UNIT_TYPE_IDS.filter((t) => canRecruit(rich, this.clan, pid, t).ok);
  }

  /** Wählt die beste Einheit für eine Provinz nach Konter-Wert × Kraft je Koku. */
  private pickUnit(pid: ProvinceId, scores: Record<UnitRole, number>): string | undefined {
    let best: string | undefined;
    let bestScore = 0;
    for (const t of this.recruitableTypes(pid)) {
      const d = UNIT_TYPES[t];
      const score = scores[d.role] ** 2 * (unitPower(newUnit(t)) / (d.cost + d.upkeep * 8));
      if (score > bestScore) [best, bestScore] = [t, score];
    }
    return best;
  }

  private recruit(sit: Situation) {
    const scores = this.roleScores(sit);
    const danger = this.inDanger(sit);
    const income = clanIncome(this.s, this.clan);
    const cap = income * (danger ? this.cfg.upkeepShareThreat : this.cfg.upkeepShareCalm);
    // Bedrohte Grenzprovinzen zuerst, dann Provinzen mit Armee.
    const order = [...sit.own].sort(
      (a, b) => (sit.threat[b] - sit.defense[b]) - (sit.threat[a] - sit.defense[a]) || armiesIn(this.s, b, this.clan).length - armiesIn(this.s, a, this.clan).length,
    );
    let queuedUpkeep = Object.values(this.s.provinces)
      .filter((p) => p.owner === this.clan)
      .reduce((acc, p) => acc + p.queue.filter((q) => q.kind === 'unit').reduce((x, q) => x + UNIT_TYPES[q.id].upkeep, 0), 0);
    for (const pid of order) {
      if (this.recruits >= this.cfg.maxRecruitsPerTurn * (this.rich ? 2 : 1)) return;
      const p = this.s.provinces[pid];
      if (p.siege || p.queue.some((q) => q.kind === 'unit')) continue;
      const t = this.pickUnit(pid, scores);
      if (!t) continue;
      const d = UNIT_TYPES[t];
      if (clanUpkeep(this.s, this.clan) + queuedUpkeep + d.upkeep > cap) return;
      if (this.treasury - d.cost < (danger ? this.cfg.minReserve : this.reserve())) continue;
      if (this.apply(queueUnit(this.s, this.clan, pid, t))) {
        this.recruits++;
        queuedUpkeep += d.upkeep;
      }
    }
  }
}

/**
 * Konter-Wert jeder Rolle gegen einen Einheitenmix (Mannstärke je Rolle):
 * gewichteter Schadensvorteil COUNTERS[r][e] / COUNTERS[e][r].
 */
export function counterScores(enemyMen: Partial<Record<UnitRole, number>>): Record<UnitRole, number> {
  const total = ROLES.reduce((a, r) => a + (enemyMen[r] ?? 0), 0);
  const scores = {} as Record<UnitRole, number>;
  for (const r of ROLES) {
    // Ohne Feindbild: Speere als solides Rückgrat.
    scores[r] = total ? ROLES.reduce((a, e) => a + ((enemyMen[e] ?? 0) / total) * (COUNTERS[r][e] / COUNTERS[e][r]), 0) : r === 'spear' ? 1.1 : 1;
  }
  return scores;
}

/** Beste Konter-Rolle gegen einen Einheitenmix. */
export function counterRoleFor(enemyMen: Partial<Record<UnitRole, number>>): UnitRole {
  const sc = counterScores(enemyMen);
  return ROLES.reduce((b, r) => (sc[r] > sc[b] ? r : b), ROLES[0]);
}
