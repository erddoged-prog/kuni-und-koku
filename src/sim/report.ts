// Textbausteine für den Schlachtbericht. Rein darstellend, keine Spiellogik.
import type { TacticDef } from '../data/config';
import type { UnitType } from '../data/types';
import { COUNTERS } from '../data';
import type { BattleResult, Side } from './types';

interface Ref {
  side: Side;
  def: UnitType;
}

type Case = 'nom' | 'dat';

export const pct = (x: number) => `${Math.round(x * 100)} %`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Dativ Plural: "Reiter" → "Reitern", "Bogenschützen" bleibt. */
const dativePlural = (name: string) => (name.endsWith('n') ? name : `${name}n`);

export class Narrator {
  constructor(
    private perspective: Side | undefined,
    private names: Record<Side, string>,
  ) {}

  private you(side: Side) {
    return this.perspective === side;
  }

  /** "Eure Reiter" / "die Reiter der Akagane" (Nominativ/Akkusativ) bzw. Dativ. */
  unit(r: Ref, c: Case = 'nom'): string {
    const n = c === 'dat' ? dativePlural(r.def.name) : r.def.name;
    if (this.you(r.side)) return `${c === 'dat' ? 'Euren' : 'Eure'} ${n}`;
    return `${c === 'dat' ? 'den' : 'die'} ${n} der ${this.names[r.side]}`;
  }

  /** "Ihr" / "Die Akagane" */
  sideSubject(side: Side): string {
    return this.you(side) ? 'Ihr' : `Die ${this.names[side]}`;
  }

  private verb(side: Side, youForm: string, theyForm: string) {
    return this.you(side) ? youForm : theyForm;
  }

  tacticLine(side: Side, t: TacticDef): string {
    const s = this.sideSubject(side);
    switch (t.id) {
      case 'attack':
        return `${s} ${this.verb(side, 'befehlt', 'befehlen')} den Angriff.`;
      case 'hold':
        return `${s} ${this.verb(side, 'haltet', 'halten')} die Stellung.`;
      case 'flank':
        return `${s} ${this.verb(side, 'schickt', 'schicken')} Truppen zur Umgehung aus.`;
      case 'retreat':
        return `${s} ${this.verb(side, 'befehlt', 'befehlen')} den geordneten Rückzug.`;
    }
  }

  flankLine(side: Side, success: boolean, terrain: string): string {
    const s = this.sideSubject(side);
    if (success) return `Das Umgehungsmanöver gelingt (${terrain})! ${s} ${this.verb(side, 'fallt', 'fallen')} dem Gegner in die Flanke.`;
    const army = this.you(side) ? 'Eure Armee' : `Die Armee der ${this.names[side]}`;
    return `Das Umgehungsmanöver scheitert – ${army} ist auseinandergezogen und verwundbar.`;
  }

  hitLine(from: Ref, to: Ref, kills: number, phase: 'ranged' | 'charge' | 'melee'): string {
    const A = cap(this.unit(from));
    const fr = from.def.role;
    const tr = to.def.role;
    const n = `${kills} Gefallene`;
    if (phase === 'ranged') {
      if (from.def.gunpowder) return `${A} feuerten Salven in ${this.unit(to)}: ${n}.`;
      if (tr === 'spear') return `${A} dünnten die dichten Reihen von ${this.unit(to, 'dat')} aus: ${n}.`;
      if (tr === 'cavalry') return `${A} beschossen ${this.unit(to)}, doch die Reiter boten wenig Ziel: ${n}.`;
      return `${A} beschossen ${this.unit(to)}: ${n}.`;
    }
    if (phase === 'charge') {
      if (fr === 'spear' && tr === 'cavalry') return `${A} empfingen ${this.unit(to)} mit gesenkten Speeren: ${kills} Reiter fielen.`;
      if (fr === 'cavalry' && tr === 'ranged') return `${A} ritten ${this.unit(to)} nieder: ${n}.`;
      if (fr === 'cavalry') return `${A} brachen in ${this.unit(to)} ein: ${n}.`;
      return `${A} stürmten gegen ${this.unit(to)}: ${n}.`;
    }
    const counter = COUNTERS[fr][tr];
    if (fr === 'spear' && tr === 'cavalry') return `${A} hielten ${this.unit(to, 'dat')} stand: ${n}.`;
    if (fr === 'sword' && tr === 'spear') return `${A} fanden Lücken zwischen den Speerspitzen: ${n} bei ${this.unit(to, 'dat')}.`;
    if (fr === 'cavalry' && tr === 'ranged') return `${A} ritten ${this.unit(to)} nieder: ${n}.`;
    if (tr === 'ranged' && fr !== 'ranged') return `${A} fielen über ${this.unit(to)} her: ${n}.`;
    if (counter < 0.8) return `${A} rieben sich an ${this.unit(to, 'dat')} auf und töteten nur ${kills}.`;
    return `${A} fügten ${this.unit(to, 'dat')} ${kills} Verluste zu.`;
  }

  routLine(u: Ref, reason: string): string {
    return `${cap(this.unit(u))} brachen ein und flohen (${reason}).`;
  }

  pursuitLine(winner: Side, cavShare: number, killed: number, captured: number, orderly: boolean): string {
    if (orderly) return `Beim Abzug der Unterlegenen fielen noch ${killed}, ${captured} gerieten in Gefangenschaft.`;
    const who = cavShare > 0.15
      ? (this.you(winner) ? 'Eure Reiter' : `Die Reiter der ${this.names[winner]}`)
      : this.sideSubject(winner);
    const verb = cavShare > 0.15 ? 'setzten' : this.verb(winner, 'setztet', 'setzten');
    return `${who} ${verb} den Fliehenden nach: ${killed} fielen, ${captured} wurden gefangen genommen.`;
  }

  retreatLine(side: Side, killed: number, captured: number, enemyCav: number): string {
    const s = this.sideSubject(side);
    let line = `${s} ${this.verb(side, 'zieht', 'ziehen')} sich geordnet zurück. Die Nachhut verlor ${killed} Mann, ${captured} gerieten in Gefangenschaft.`;
    if (enemyCav > 0.2) line += ' Die feindliche Reiterei setzte hart nach.';
    else line += ' Ohne Reiterei konnte der Gegner kaum nachsetzen.';
    return line;
  }

  resultLines(r: BattleResult): string[] {
    const lines: string[] = [];
    const w = r.winner;
    if (this.perspective) lines.push(this.perspective === w ? 'Sieg! Das Feld gehört euch.' : 'Niederlage. Das Feld ist verloren.');
    else lines.push(`Sieg der ${this.names[w]}.`);
    for (const side of ['attacker', 'defender'] as Side[]) {
      const o = r[side];
      const label = this.you(side) ? 'Eure Verluste' : `Verluste der ${this.names[side]}`;
      let line = `${label}: ${o.killed} gefallen, ${o.captured} gefangen`;
      if (o.fled) line += `, ${o.fled} versprengt`;
      line += ` – ${o.totalAfter} von ${o.totalBefore} Mann übrig.`;
      lines.push(line);
    }
    return lines;
  }
}
