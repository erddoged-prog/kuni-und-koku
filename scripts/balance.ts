// Balancing-Script (Schritt 6): simuliert für jede Einheitenpaarung viele Kämpfe
// und gibt Siegquoten aus.
//
//   npm run balance                      1000 Kämpfe je Paarung, Ebene, Sommer
//   npm run balance -- --n 500 --terrain hills --season winter
//   npm run balance -- --units 3 --md balancing.md
//
// Zwei Auswertungen:
//   1. Gleiche Zahl: je Seite gleich viele Einheiten (--units, Standard 4)
//   2. Gleiche Kosten: je Seite so viele Einheiten, wie für --budget Koku (Standard 1200) zu haben sind
// Jede Paarung wird je zur Hälfte mit vertauschten Rollen (Angreifer/Verteidiger) gespielt,
// damit der Vorteil des Verteidigers die Zahlen nicht verzerrt.
import { writeFileSync } from 'node:fs';
import { COUNTERS, SEASONS, TERRAIN, UNIT_TYPES, UNIT_TYPE_IDS } from '../src/data';
import type { Season, Tactic, Terrain, Unit } from '../src/data/types';
import { deriveSeed, simulateBattle } from '../src/sim';

interface Options {
  n: number;
  units: number;
  budget: number;
  terrain: Terrain;
  season: Season;
  stars: number;
  attackTactic: Tactic;
  defendTactic: Tactic;
  md?: string;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { n: 1000, units: 4, budget: 1200, terrain: 'plains', season: 'summer', stars: 2, attackTactic: 'attack', defendTactic: 'hold' };
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === '--n') o.n = Number(v);
    else if (k === '--units') o.units = Number(v);
    else if (k === '--budget') o.budget = Number(v);
    else if (k === '--terrain') o.terrain = v as Terrain;
    else if (k === '--season') o.season = v as Season;
    else if (k === '--stars') o.stars = Number(v);
    else if (k === '--attack') o.attackTactic = v as Tactic;
    else if (k === '--defend') o.defendTactic = v as Tactic;
    else if (k === '--md') o.md = v;
    else continue;
    i++;
  }
  if (!TERRAIN[o.terrain]) throw new Error(`Unbekanntes Gelände: ${o.terrain} (${Object.keys(TERRAIN).join(', ')})`);
  if (!SEASONS.some((s) => s.id === o.season)) throw new Error(`Unbekannte Jahreszeit: ${o.season}`);
  return o;
}

const squad = (type: string, count: number): Unit[] => Array.from({ length: count }, () => ({ type, men: UNIT_TYPES[type].men, experience: 0 }));

/** Siegquote von a gegen b (0–1), Rollen je zur Hälfte vertauscht. */
function winRate(a: string, b: string, countA: number, countB: number, o: Options, salt: string): number {
  let wins = 0;
  for (let i = 0; i < o.n; i++) {
    const aAttacks = i % 2 === 0;
    const sideA = { clan: 'a', clanName: 'A', generalName: 'A', stars: o.stars, units: squad(a, countA) };
    const sideB = { clan: 'b', clanName: 'B', generalName: 'B', stars: o.stars, units: squad(b, countB) };
    const res = simulateBattle({
      attacker: { ...(aAttacks ? sideA : sideB), tactic: o.attackTactic },
      defender: { ...(aAttacks ? sideB : sideA), tactic: o.defendTactic },
      terrain: o.terrain,
      season: o.season,
      seed: deriveSeed(20261120, salt, a, b, i),
    });
    if ((res.winner === 'attacker') === aAttacks) wins++;
  }
  return wins / o.n;
}

type Matrix = Record<string, Record<string, number>>;

function runMatrix(o: Options, count: (t: string) => number, salt: string): Matrix {
  const m: Matrix = {};
  for (const a of UNIT_TYPE_IDS) {
    m[a] = {};
    for (const b of UNIT_TYPE_IDS) m[a][b] = winRate(a, b, count(a), count(b), o, salt);
  }
  return m;
}

const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(5);
const short = (t: string) => UNIT_TYPES[t].name;

function table(title: string, m: Matrix, count: (t: string) => number): string[] {
  const w = Math.max(...UNIT_TYPE_IDS.map((t) => short(t).length)) + 6;
  const lines = [title, `${'Zeile gewinnt gegen Spalte'.padEnd(w)}${UNIT_TYPE_IDS.map((t) => short(t).slice(0, 9).padStart(10)).join('')}   Schnitt`];
  for (const a of UNIT_TYPE_IDS) {
    const avg = UNIT_TYPE_IDS.filter((b) => b !== a).reduce((s, b) => s + m[a][b], 0) / (UNIT_TYPE_IDS.length - 1);
    lines.push(`${`${short(a)} ×${count(a)}`.padEnd(w)}${UNIT_TYPE_IDS.map((b) => pct(m[a][b]).padStart(10)).join('')}   ${pct(avg)}`);
  }
  return lines;
}

function markdown(title: string, m: Matrix, count: (t: string) => number): string[] {
  const head = `| ${title} | ${UNIT_TYPE_IDS.map(short).join(' | ')} | Schnitt |`;
  const sep = `|${'---|'.repeat(UNIT_TYPE_IDS.length + 2)}`;
  const rows = UNIT_TYPE_IDS.map((a) => {
    const avg = UNIT_TYPE_IDS.filter((b) => b !== a).reduce((s, b) => s + m[a][b], 0) / (UNIT_TYPE_IDS.length - 1);
    return `| **${short(a)}** ×${count(a)} | ${UNIT_TYPE_IDS.map((b) => pct(m[a][b]).trim()).join(' | ')} | ${pct(avg).trim()} |`;
  });
  return [head, sep, ...rows];
}

/** Prüft die Konter-Matrix: Wo COUNTERS einen Vorteil verspricht, sollte die Rolle auch gewinnen. */
function counterCheck(m: Matrix): string[] {
  const out: string[] = [];
  for (const a of UNIT_TYPE_IDS) {
    for (const b of UNIT_TYPE_IDS) {
      if (a >= b) continue;
      const ra = UNIT_TYPES[a].role;
      const rb = UNIT_TYPES[b].role;
      const edge = COUNTERS[ra][rb] / COUNTERS[rb][ra];
      if (edge >= 1.5 && m[a][b] < 0.5) out.push(`  ${short(a)} sollte ${short(b)} kontern (×${edge.toFixed(2)}), gewinnt aber nur ${pct(m[a][b]).trim()}`);
      if (edge <= 1 / 1.5 && m[a][b] > 0.5) out.push(`  ${short(b)} sollte ${short(a)} kontern (×${(1 / edge).toFixed(2)}), verliert aber ${pct(m[a][b]).trim()}`);
    }
  }
  return out.length ? ['Konter-Prüfung – Abweichungen:', ...out] : ['Konter-Prüfung: alle Konter wirken wie vorgesehen.'];
}

/** Auffällige Einheiten: Schnitt über 65 % oder unter 35 % bei gleichen Kosten. */
function outliers(m: Matrix): string[] {
  const out: string[] = [];
  for (const a of UNIT_TYPE_IDS) {
    const avg = UNIT_TYPE_IDS.filter((b) => b !== a).reduce((s, b) => s + m[a][b], 0) / (UNIT_TYPE_IDS.length - 1);
    if (avg > 0.65) out.push(`  ${short(a)}: zu stark für den Preis (${pct(avg).trim()} im Schnitt)`);
    if (avg < 0.35) out.push(`  ${short(a)}: zu schwach für den Preis (${pct(avg).trim()} im Schnitt)`);
  }
  return out.length ? ['Preis-Leistung – Auffälligkeiten:', ...out] : ['Preis-Leistung: keine Einheit weicht stark ab (35–65 %).'];
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const sameCount = () => o.units;
  const sameCost = (t: string) => Math.max(1, Math.round(o.budget / UNIT_TYPES[t].cost));
  const head = `Balancing: ${o.n} Kämpfe je Paarung · ${TERRAIN[o.terrain].name} · ${SEASONS.find((s) => s.id === o.season)!.name} · ${o.stars}★ · Taktik ${o.attackTactic}/${o.defendTactic}`;
  console.log(head);
  const m1 = runMatrix(o, sameCount, 'zahl');
  const m2 = runMatrix(o, sameCost, 'kosten');
  const lines = [
    '',
    ...table(`1. Gleiche Zahl (${o.units} Einheiten je Seite)`, m1, sameCount),
    '',
    ...table(`2. Gleiche Kosten (${o.budget} Koku je Seite)`, m2, sameCost),
    '',
    ...counterCheck(m1),
    ...outliers(m2),
    '',
    `${UNIT_TYPE_IDS.length ** 2 * 2 * o.n} Kämpfe in ${((Date.now() - t0) / 1000).toFixed(1)} s.`,
  ];
  console.log(lines.join('\n'));
  if (o.md) {
    const md = [
      `# ${head}`, '',
      ...markdown(`Gleiche Zahl (×${o.units})`, m1, sameCount), '',
      ...markdown(`Gleiche Kosten (${o.budget} Koku)`, m2, sameCost), '',
      ...counterCheck(m1).map((l) => (l.startsWith('  ') ? `- ${l.trim()}` : l)), '',
      ...outliers(m2).map((l) => (l.startsWith('  ') ? `- ${l.trim()}` : l)),
    ].join('\n');
    writeFileSync(o.md, md + '\n', 'utf8');
    console.log(`Markdown geschrieben: ${o.md}`);
  }
}

main();
