// Erzeugt eine statische Vorschau der Spieldaten (Schritt 1) als HTML.
import { writeFileSync } from 'node:fs';
import {
  ADJACENCIES, BUILDINGS, CLANS, CLAN_IDS, COUNTERS, PROVINCES, PROVINCE_IDS, TERRAIN, UNIT_TYPES,
  TACTICS, SEASONS, NEUTRAL_CLAN, START_ARMIES,
} from '../src/data';

const owner = (p: string) => CLAN_IDS.find((c) => CLANS[c].startProvinces.includes(p)) ?? NEUTRAL_CLAN;
const S = 9; // Skalierung
const px = (x: number) => x * S + 20, py = (y: number) => y * S + 20;

const edges = ADJACENCIES.map(({ a, b, sea }) => {
  const A = PROVINCES[a], B = PROVINCES[b];
  return `<line x1="${px(A.x)}" y1="${py(A.y)}" x2="${px(B.x)}" y2="${py(B.y)}" stroke="${sea ? '#5b7fa6' : '#6b5a44'}" stroke-width="${sea ? 2 : 3}" ${sea ? 'stroke-dasharray="6 5"' : ''} opacity=".7"/>`;
}).join('');
const nodes = PROVINCE_IDS.map((id) => {
  const p = PROVINCES[id], c = CLANS[owner(id)];
  const r = 14 + p.koku / 25;
  return `<g><circle cx="${px(p.x)}" cy="${py(p.y)}" r="${r}" fill="${c.color}" stroke="${p.isCapital ? '#c9a227' : c.accent}" stroke-width="${p.isCapital ? 5 : 2}"/>
  <text x="${px(p.x)}" y="${py(p.y) + 6}" text-anchor="middle" font-size="16" fill="${c.accent}">${p.kanji[0]}</text>
  <text x="${px(p.x)}" y="${py(p.y) + r + 16}" text-anchor="middle" font-size="13" fill="#2a2118">${p.name} · ${p.koku}</text></g>`;
}).join('');

const clanRows = CLAN_IDS.map((id) => {
  const c = CLANS[id];
  const army = START_ARMIES.find((a) => a.clan === id);
  return `<tr><td><span class="mon" style="background:${c.color};color:${c.accent}">${c.kanji}</span></td><td><b>${c.name}</b><br><small>${c.description}</small></td>
  <td>${c.startProvinces.map((p) => PROVINCES[p].name).join(', ') || '(alle übrigen)'}</td>
  <td>${army ? `${army.general} ${'★'.repeat(army.stars)}<br><small>${army.units.map((u) => UNIT_TYPES[u].name).join(', ')}</small>` : '–'}</td></tr>`;
}).join('');

const roleDe: Record<string, string> = { spear: 'Speer', cavalry: 'Reiterei', ranged: 'Fernkampf', sword: 'Schwert' };
const unitRows = Object.values(UNIT_TYPES).map((u) => `<tr><td><b>${u.name}</b><br><small>${u.description}</small></td><td>${roleDe[u.role]}</td>
<td>${u.attack}</td><td>${u.defense}</td><td>${u.ranged || '–'}</td><td>${u.charge}</td><td>${u.morale}</td><td>${u.men}</td><td>${u.cost}</td><td>${u.upkeep}</td>
<td>${u.requires.map((r) => BUILDINGS[r.building].levels[r.level - 1].name).join(', ')}${u.availableFromYear ? ` (ab ${u.availableFromYear})` : ''}</td></tr>`).join('');

const roles = Object.keys(COUNTERS) as (keyof typeof COUNTERS)[];
const counter = `<tr><th>Angreifer ↓ / Ziel →</th>${roles.map((r) => `<th>${roleDe[r]}</th>`).join('')}</tr>` +
  roles.map((a) => `<tr><th>${roleDe[a]}</th>${roles.map((d) => { const v = COUNTERS[a][d]; return `<td style="background:${v > 1.05 ? '#b9d3a0' : v < 0.95 ? '#e3a99a' : 'transparent'}">×${v}</td>`; }).join('')}</tr>`).join('');

const buildingRows = Object.values(BUILDINGS).map((b) => `<tr><td><b>${b.name}</b><br><small>${b.description}</small></td><td>${b.levels.map((l, i) =>
  `${i + 1}. ${l.name} – ${l.cost} Koku, ${l.buildTime} Rd.${l.kokuBonus ? `, +${l.kokuBonus * 100}% Koku` : ''}${l.supplyTurns ? `, Vorräte ${l.supplyTurns} Rd.` : ''}${l.recruitExperience ? `, +${l.recruitExperience} Erfahrung` : ''}`).join('<br>')}</td></tr>`).join('');

const tacticRows = Object.values(TACTICS).map((t) => `<tr><td><b>${t.name}</b></td><td>${t.description}</td></tr>`).join('');
const seasonRows = SEASONS.map((s) => `<tr><td>${s.kanji} <b>${s.name}</b></td><td>Einkommen ×${s.incomeMod}</td><td>Seewege ${s.seaOpen ? 'offen' : 'gesperrt'}</td><td>${s.attrition ? `Verluste ${s.attrition * 100}%` : ''}</td></tr>`).join('');
const terrainRows = Object.values(TERRAIN).map((t) => `<tr><td><b>${t.name}</b></td><td>${t.description}</td></tr>`).join('');

const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Kuni & Koku – Datenvorschau</title><style>
body{background:#efe4cc;color:#2a2118;font-family:Georgia,serif;margin:0;padding:24px 32px;background-image:radial-gradient(#e6d8ba 1px,transparent 1px);background-size:6px 6px}
h1{margin:0}h2{border-bottom:2px solid #8a2b1f;padding-bottom:4px;margin-top:32px}
table{border-collapse:collapse;background:#f7efdc;margin:8px 0}td,th{border:1px solid #c9b48e;padding:5px 8px;vertical-align:top;font-size:14px}th{background:#e3d3b1}
small{opacity:.75}.mon{display:inline-flex;width:38px;height:38px;border-radius:50%;align-items:center;justify-content:center;font-size:22px}
svg{background:#f7efdc;border:1px solid #c9b48e}.legend{font-size:13px;opacity:.8}
</style></head><body>
<h1>国と石 Kuni & Koku <small>– Datenvorschau (Schritt 1, noch keine Spieloberfläche)</small></h1>
<h2>Karte & Nachbarschaftsgraph (${PROVINCE_IDS.length} Provinzen, ${ADJACENCIES.length} Verbindungen)</h2>
<p class="legend">Kreisgröße = Koku-Ertrag · gestrichelt = Seeweg (im Winter gesperrt) · goldener Rand = Kyōto. Die echte Karte mit Provinzflächen kommt in Schritt 4.</p>
<svg width="${px(100) + 20}" height="${py(80) + 30}">${edges}${nodes}</svg>
<h2>Clans</h2><table><tr><th></th><th>Clan</th><th>Startprovinzen</th><th>Daimyo-Armee</th></tr>${clanRows}</table>
<h2>Einheiten</h2><table><tr><th>Einheit</th><th>Rolle</th><th>Angr.</th><th>Vert.</th><th>Fern</th><th>Ansturm</th><th>Moral</th><th>Männer</th><th>Kosten</th><th>Unterhalt</th><th>Benötigt</th></tr>${unitRows}</table>
<h2>Konter-Matrix (Schadensmultiplikator)</h2><table>${counter}</table>
<h2>Gebäude</h2><table>${buildingRows}</table>
<h2>Taktiken</h2><table>${tacticRows}</table>
<h2>Jahreszeiten</h2><table>${seasonRows}</table>
<h2>Gelände</h2><table>${terrainRows}</table>
</body></html>`;
writeFileSync(process.argv[2] ?? 'datenvorschau.html', html);
console.log('ok');
