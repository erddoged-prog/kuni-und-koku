// SVG-Karte im Washi-Stil. Reine String-Erzeugung aus Spielzustand + UI-Zustand.
import { CAPITAL_ID, CLANS, PROVINCES, PROVINCE_IDS } from '../data';
import type { Army, GameState, ProvinceId } from '../data/types';
import { armyMen } from '../campaign';
import { MAP_H, MAP_W, toPath, type MapGeometry, type Pt } from './geometry';
import { monGroup } from './mon';

export interface MapView {
  selectedProvince?: ProvinceId;
  selectedArmy?: string;
  /** Zugziele der gewählten Armee. */
  targets: { to: ProvinceId; hostile: boolean }[];
}

const INK = '#2b2118';
const PAPER = '#efe3c8';

/** Statische Definitionen (Filter, Muster) – einmalig. */
function defs(geo: MapGeometry): string {
  const islandClip = Object.values(geo.islands).map((p) => `<path d="${toPath(p)}"/>`).join('');
  return `<defs>
    <filter id="washi" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9 0.05" numOctaves="3" seed="7" result="n"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.22  0 0 0 0.9 -0.35"/>
    </filter>
    <filter id="mottle" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.18  0 0 0 0.5 -0.1"/>
    </filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dx="3" dy="5"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/><feOffset dx="1" dy="2"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="waves" width="48" height="24" patternUnits="userSpaceOnUse">
      <path d="M0,24 a12,12 0 0 1 24,0 a12,12 0 0 1 24,0 M6,24 a6,6 0 0 1 12,0 M30,24 a6,6 0 0 1 12,0
               M-12,12 a12,12 0 0 1 24,0 a12,12 0 0 1 24,0 a12,12 0 0 1 24,0" fill="none" stroke="#7f97a6" stroke-width="1" opacity=".35"/>
    </pattern>
    <pattern id="siege" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="10" fill="${INK}" opacity=".35"/>
    </pattern>
    <clipPath id="land">${islandClip}</clipPath>
  </defs>`;
}

function castleIcon(level: number): string {
  // Kleine Burg: Steinsockel + 1–3 Dachstufen
  const roofs = [
    '<path d="M-11,-2 L11,-2 L8,-7 L-8,-7Z"/>',
    '<path d="M-8,-9 L8,-9 L6,-13 L-6,-13Z"/>',
    '<path d="M-5,-15 L5,-15 L3,-19 L-3,-19Z"/>',
  ].slice(0, level).join('');
  return `<g class="castle" fill="${INK}" stroke="${PAPER}" stroke-width=".8">
    <path d="M-10,8 L10,8 L8,-1 L-8,-1Z" fill="#6b5a46"/>${roofs}</g>`;
}

function banner(army: Army, selected: boolean): string {
  const c = CLANS[army.owner];
  const men = armyMen(army);
  // Ursprung = Fuß der Stange
  return `<g class="army${selected ? ' selected' : ''}" data-army="${army.id}" filter="url(#soft)">
    <rect x="-3" y="-40" width="26" height="44" fill="transparent"/>
    <line x1="0" y1="-34" x2="0" y2="2" stroke="${INK}" stroke-width="2"/>
    <path d="M1,-33 h17 v24 h-17 z" fill="${c.color}" stroke="${selected ? '#e2b13c' : INK}" stroke-width="${selected ? 3 : 1}"/>
    <g transform="translate(9.5,-21) scale(0.13)">${monGroup(army.owner)}</g>
    <text x="9.5" y="-37" class="army-stars">${'★'.repeat(army.general.stars)}</text>
    <text x="10" y="1" class="army-men">${men}</text>
  </g>`;
}

export function renderMap(state: GameState, geo: MapGeometry, view: MapView): string {
  const targets = new Map(view.targets.map((t) => [t.to, t]));
  const parts: string[] = [];
  parts.push(`<svg id="map" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(defs(geo));
  // Meer
  parts.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="#cdd6d3"/><rect width="${MAP_W}" height="${MAP_H}" fill="url(#waves)"/>`);
  // Inseln mit Schatten
  parts.push(`<g filter="url(#shadow)">${Object.values(geo.islands).map((p) => `<path d="${toPath(p)}" fill="${PAPER}"/>`).join('')}</g>`);
  // Provinzen
  parts.push('<g class="provinces">');
  for (const id of PROVINCE_IDS) {
    const p = state.provinces[id];
    const clan = CLANS[p.owner];
    const cls = ['prov'];
    if (view.selectedProvince === id) cls.push('selected');
    const t = targets.get(id);
    if (t) cls.push(t.hostile ? 'target-hostile' : 'target');
    parts.push(`<path class="${cls.join(' ')}" data-pid="${id}" d="${toPath(geo.cells[id])}" fill="${clan.color}"/>`);
  }
  parts.push('</g>');
  // Papierstruktur über dem Land
  parts.push(`<g clip-path="url(#land)" pointer-events="none">
    <rect width="${MAP_W}" height="${MAP_H}" filter="url(#mottle)" opacity=".55"/>
    <rect width="${MAP_W}" height="${MAP_H}" filter="url(#washi)" opacity=".5"/></g>`);
  // Belagerungen
  for (const id of PROVINCE_IDS) {
    if (state.provinces[id].siege) parts.push(`<path d="${toPath(geo.cells[id])}" fill="url(#siege)" pointer-events="none"/>`);
  }
  // Grenzen + Küsten
  parts.push(`<g pointer-events="none" fill="none" stroke="${INK}" stroke-linejoin="round">
    ${PROVINCE_IDS.map((id) => `<path d="${toPath(geo.cells[id])}" stroke-width="1" opacity=".55"/>`).join('')}
    ${Object.values(geo.islands).map((p) => `<path d="${toPath(p)}" stroke-width="2.4"/>`).join('')}</g>`);
  // Zielmarkierungen & Auswahl obenauf
  parts.push('<g pointer-events="none">');
  for (const t of view.targets) {
    parts.push(`<path class="${t.hostile ? 'ring-hostile' : 'ring-target'}" d="${toPath(geo.cells[t.to])}"/>`);
  }
  if (view.selectedProvince) parts.push(`<path class="ring-selected" d="${toPath(geo.cells[view.selectedProvince])}"/>`);
  parts.push('</g>');

  // Beschriftungen, Burgen, Armeen
  const armiesBy = new Map<ProvinceId, Army[]>();
  for (const a of Object.values(state.armies)) {
    if (!armiesBy.has(a.location)) armiesBy.set(a.location, []);
    armiesBy.get(a.location)!.push(a);
  }
  parts.push('<g class="labels" pointer-events="none">');
  for (const id of PROVINCE_IDS) {
    const [x, y] = geo.centers[id];
    const def = PROVINCES[id];
    const name = def.name.replace(' (Kyōto)', '');
    parts.push(`<text x="${x}" y="${y + 9}" class="kanji">${def.kanji}</text>`);
    // Schriftgröße an die Breite der Provinz anpassen
    const xs = geo.cells[id].map((pt) => pt[0]);
    const width = Math.max(...xs) - Math.min(...xs);
    const size = Math.max(10, Math.min(13, (width * 0.85) / (name.length * 0.6)));
    parts.push(`<text x="${x}" y="${y + 18}" class="pname" style="font-size:${size.toFixed(1)}px">${name}</text>`);
    const lvl = state.provinces[id].buildings.castle ?? 0;
    if (lvl > 0) parts.push(`<g transform="translate(${x - 17},${y + 3})">${castleIcon(lvl)}</g>`);
    if (id === CAPITAL_ID) parts.push(`<g transform="translate(${x - 17},${y - 18})"><rect x="-8" y="-8" width="16" height="16" rx="2" fill="#a8261c"/><text y="4.5" class="seal">京</text></g>`);
  }
  parts.push('</g>');
  for (const [pid, list] of armiesBy) {
    const [x, y] = geo.centers[pid] as Pt;
    list.forEach((a, i) => {
      parts.push(`<g transform="translate(${x - 2 + i * 24},${y + 4})">${banner(a, view.selectedArmy === a.id)}</g>`);
    });
  }
  parts.push('</svg>');
  return parts.join('');
}
