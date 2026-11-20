// SVG-Karte im Tuschestil (Sumi-e) auf Washi-Papier. Reine String-Erzeugung aus Spielzustand + UI-Zustand.
// Zwei Ebenen: ein fester Hintergrund (Meer, gemaltes Land, Rahmen – nur einmal gezeichnet)
// und ein Vordergrund, der bei jeder Änderung neu entsteht (Clans, Grenzen, Figuren …).
import { CAPITAL_ID, CLANS, PROVINCES, PROVINCE_IDS, seasonOf } from '../data';
import type { Army, GameState, ProvinceId } from '../data/types';
import { armyMen } from '../campaign';
import { MAP_H, MAP_W, toPath, type MapGeometry, type Pt } from './geometry';
import { monGroup } from './mon';
import {
  bordersLayer, castleArt, clanBands, clanWash, compassRose, goldClouds, goldDefs, inkDefs, mapFrame, seaLayer, seaRoutes,
  seasonLayer, terrainLayer,
} from './ink';
import { paintedLand } from './painted';

let terrainCache: { geo: MapGeometry; svg: string } | undefined;

export interface MapView {
  selectedProvince?: ProvinceId;
  selectedArmy?: string;
  /** Zugziele der gewählten Armee. */
  targets: { to: ProvinceId; hostile: boolean }[];
  /** Armee, die gerade gezogen hat (kurze Lande-Animation). */
  landed?: string;
}

const INK = '#2b2118';
const PAPER = '#efe3c8';

/** Statische Definitionen (Filter, Muster) – einmalig. */
function defs(geo: MapGeometry): string {
  const islandClip = Object.values(geo.islands).map((p) => `<path d="${toPath(p)}"/>`).join('');
  return `<defs>
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
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6c896"/><stop offset=".55" stop-color="#cfa66c"/><stop offset="1" stop-color="#a97c45"/>
    </linearGradient>
    <pattern id="grain" width="40" height="6" patternUnits="userSpaceOnUse">
      <path d="M0,2 q10,-1.5 20,0 t20,0 M0,5 q10,1 20,0 t20,0" fill="none" stroke="#7a5228" stroke-width=".5" opacity=".35"/>
    </pattern>
    ${inkDefs()}${goldDefs()}
    <pattern id="siege" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="10" fill="${INK}" opacity=".35"/>
    </pattern>
    <clipPath id="land">${islandClip}</clipPath>
  </defs>`;
}

/**
 * Spielfigur (Koma): lackierter Holzstein in Shōgi-Form mit Clan-Wappen,
 * Sternen des Generals oben und Mannstärke auf dem Sockel. Ursprung = Standfläche.
 */
function piece(army: Army, opts: { selected: boolean; mine: boolean; landed: boolean }): string {
  const c = CLANS[army.owner];
  const men = armyMen(army);
  const cls = ['army'];
  if (opts.selected) cls.push('selected');
  if (opts.mine && !army.moved) cls.push('mine');
  if (army.moved) cls.push('spent');
  if (opts.landed) cls.push('landed');
  const body = 'M0,-34 L14,-26 L17,0 L-17,0 L-14,-26 Z';
  const stars = army.general.stars;
  const starRow = Array.from({ length: stars }, (_, i) => `<text x="${(i - (stars - 1) / 2) * 7}" y="-37" class="army-stars">★</text>`).join('');
  return `<g class="${cls.join(' ')}" data-army="${army.id}">
    <rect x="-22" y="-46" width="44" height="62" fill="transparent"/>
    <ellipse class="piece-shadow" cx="2" cy="2" rx="19" ry="5" fill="${INK}" opacity=".35"/>
    <g class="piece-body">
      <path d="M-17,0 L17,0 L17,4 L-17,4 Z" fill="#7d5732"/>
      <path d="${body}" fill="url(#wood)" stroke="${opts.selected ? '#e2b13c' : '#4a3018'}" stroke-width="${opts.selected ? 3 : 1.2}" stroke-linejoin="round"/>
      <path d="${body}" fill="url(#grain)"/>
      <path d="M-13.5,-25 L0,-32.5 L13.5,-25" fill="none" stroke="${c.color}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="0" cy="-14" r="10" fill="${c.color}" stroke="#d9b45a" stroke-width="1.2"/>
      <g transform="translate(0,-14) scale(0.12)">${monGroup(army.owner)}</g>
      <rect x="-12" y="-3.5" width="24" height="9" rx="2" fill="${PAPER}" stroke="#4a3018" stroke-width=".6"/>
      <text x="0" y="3.6" class="army-men">${men}</text>
      ${army.general.isDaimyo ? `<circle cx="13" cy="-30" r="5" fill="#a8261c" stroke="${PAPER}" stroke-width=".8"/><text x="13" y="-27.4" class="daimyo-seal">主</text>` : ''}
    </g>
    ${starRow}
  </g>`;
}

/** Fester Hintergrund: Meer, Inseln, gemaltes Land, Rahmen. Hängt nur von der Geometrie ab. */
function backgroundInner(geo: MapGeometry): string {
  const parts: string[] = [];
  parts.push(defs(geo));
  parts.push(seaLayer(geo));
  parts.push(`<g filter="url(#shadow)">${Object.values(geo.islands).map((p) => `<path d="${toPath(p)}" fill="${PAPER}"/>`).join('')}</g>`);
  const painted = paintedLand(geo);
  if (painted) {
    parts.push(`<image href="${painted}" x="0" y="0" width="${MAP_W}" height="${MAP_H}" pointer-events="none"/>`);
  } else {
    if (terrainCache?.geo !== geo) terrainCache = { geo, svg: terrainLayer(geo) };
    parts.push(terrainCache.svg);
  }
  parts.push(compassRose(960, 620));
  parts.push(mapFrame());
  return parts.join('');
}

/** Veränderlicher Vordergrund: Clans, Grenzen, Auswahl, Beschriftungen, Figuren. */
function foregroundInner(state: GameState, geo: MapGeometry, view: MapView): string {
  const targets = new Map(view.targets.map((t) => [t.to, t]));
  const parts: string[] = [];
  const season = seasonOf(state.turn);
  parts.push(seaRoutes(geo, season.seaOpen));
  // Clan-Lasur (multipliziert, damit die Malerei durchscheint) und Farbbänder an den Grenzen
  parts.push(`<g style="mix-blend-mode:multiply">${clanWash(state, geo)}${clanBands(state, geo)}</g>`);
  parts.push(seasonLayer(season.id, geo));
  // Klickflächen der Provinzen (unsichtbar, Hover hellt auf)
  parts.push('<g class="provinces">');
  for (const id of PROVINCE_IDS) {
    const cls = ['prov'];
    if (view.selectedProvince === id) cls.push('selected');
    const t = targets.get(id);
    if (t) cls.push(t.hostile ? 'target-hostile' : 'target');
    parts.push(`<path class="${cls.join(' ')}" data-pid="${id}" d="${toPath(geo.cells[id])}"/>`);
  }
  parts.push('</g>');
  for (const id of PROVINCE_IDS) {
    if (state.provinces[id].siege) parts.push(`<path d="${toPath(geo.cells[id])}" fill="url(#siege)" pointer-events="none"/>`);
  }
  parts.push(bordersLayer(state, geo));
  // Zielmarkierungen, Auswahl und Ablage-Hinweis beim Ziehen
  parts.push('<g pointer-events="none">');
  for (const t of view.targets) parts.push(`<path class="${t.hostile ? 'ring-hostile' : 'ring-target'}" d="${toPath(geo.cells[t.to])}"/>`);
  if (view.selectedProvince) parts.push(`<path class="ring-selected" d="${toPath(geo.cells[view.selectedProvince])}"/>`);
  parts.push('<path id="drophint" class="drop-hint" d=""/>');
  parts.push('</g>');

  parts.push('<g class="labels" pointer-events="none">');
  for (const id of PROVINCE_IDS) {
    const [x, y] = geo.centers[id];
    const def = PROVINCES[id];
    const name = def.name.replace(' (Kyōto)', '');
    parts.push(`<text x="${x}" y="${y + 9}" class="kanji">${def.kanji}</text>`);
    const xs = geo.cells[id].map((pt) => pt[0]);
    const width = Math.max(...xs) - Math.min(...xs);
    const size = Math.max(10, Math.min(13, (width * 0.85) / (name.length * 0.6)));
    parts.push(`<text x="${x}" y="${y + 18}" class="pname" style="font-size:${size.toFixed(1)}px">${name}</text>`);
    const lvl = state.provinces[id].buildings.castle ?? 0;
    if (lvl > 0) parts.push(`<g transform="translate(${x - 24},${y + 6})">${castleArt(lvl)}</g>`);
    if (id === CAPITAL_ID) parts.push(`<g transform="translate(${x - 24},${y - 22})"><rect x="-8" y="-8" width="16" height="16" rx="2" fill="#a8261c"/><text y="4.5" class="seal">京</text></g>`);
  }
  parts.push('</g>');
  parts.push(goldClouds());

  // Figuren: je Provinz nebeneinander, von hinten nach vorn
  const armiesBy = new Map<ProvinceId, Army[]>();
  for (const a of Object.values(state.armies)) {
    if (!armiesBy.has(a.location)) armiesBy.set(a.location, []);
    armiesBy.get(a.location)!.push(a);
  }
  parts.push('<g class="pieces">');
  const order = [...armiesBy.entries()].sort((a, b) => geo.centers[a[0]][1] - geo.centers[b[0]][1]);
  for (const [pid, list] of order) {
    const [x, y] = geo.centers[pid] as Pt;
    list.forEach((a, i) => {
      const px = x + 14 + (i - (list.length - 1) / 2) * 30;
      const opts = { selected: view.selectedArmy === a.id, mine: a.owner === state.playerClan, landed: view.landed === a.id };
      parts.push(`<g class="piece-pos" data-x="${px.toFixed(1)}" data-y="${(y + 6).toFixed(1)}" transform="translate(${px.toFixed(1)},${(y + 6).toFixed(1)})">${piece(a, opts)}</g>`);
    });
  }
  parts.push('</g>');
  return parts.join('');
}

const svgOpen = (id: string, cls = '') =>
  `<svg id="${id}"${cls ? ` class="${cls}"` : ''} viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;

/** Fester Hintergrund als eigenes SVG (wird nur einmal eingesetzt). */
export function renderMapBackground(geo: MapGeometry): string {
  return `${svgOpen('mapbg')}${backgroundInner(geo)}</svg>`;
}

/** Veränderlicher Vordergrund als eigenes SVG über dem Hintergrund. */
export function renderMapForeground(state: GameState, geo: MapGeometry, view: MapView): string {
  return `${svgOpen('map', `season-${seasonOf(state.turn).id}`)}${foregroundInner(state, geo, view)}</svg>`;
}

/** Ganze Karte in einem SVG (für Tests und Export). */
export function renderMap(state: GameState, geo: MapGeometry, view: MapView): string {
  return `${svgOpen('map', `season-${seasonOf(state.turn).id}`)}${backgroundInner(geo)}${foregroundInner(state, geo, view)}</svg>`;
}
