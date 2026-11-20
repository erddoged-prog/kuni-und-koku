// Tuschemalerei-Ebenen der Karte (Sumi-e): Meer mit Küstenringen und Wellen, Seewege,
// Geländezeichen je Provinz, Clan-Lasur und Pinsel-Grenzen. Reine String-Erzeugung,
// alles aus festen Seeds abgeleitet – die Karte sieht bei jedem Spiel gleich aus.
import { ADJACENCIES, CLANS, NEUTRAL_CLAN, PROVINCES, PROVINCE_IDS } from '../data';
import type { GameState, ProvinceId } from '../data/types';
import { MAP_H, MAP_W, pointInPolygon, sharedEdges, toPath, type MapGeometry, type Pt } from './geometry';

export const INK = '#2b2118';
export const SEA = '#d7dbd0';
const SEA_DEEP = '#c6cec4';
const WASH = '#59636b';

/** Kleiner, fester Zufallsgenerator aus einer Zeichenkette (FNV-1a + Mulberry32). */
export function rngFrom(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (n: number) => n.toFixed(1);

/** Filter für Lasur, Pinselstrich und Papier. */
export function inkDefs(): string {
  return `
    <filter id="wash" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="11" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.2"/>
    </filter>
    <filter id="brush" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <radialGradient id="deep" cx="50%" cy="50%" r="72%">
      <stop offset="55%" stop-color="${SEA_DEEP}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${SEA_DEEP}" stop-opacity="1"/>
    </radialGradient>
    <pattern id="seigaiha" width="36" height="18" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="${WASH}" stroke-width=".8" opacity=".22">
        <path d="M0,18 a18,18 0 0 1 36,0 M6,18 a12,12 0 0 1 24,0 M12,18 a6,6 0 0 1 12,0"/>
        <path d="M-18,9 a18,18 0 0 1 36,0 M-12,9 a12,12 0 0 1 24,0 M18,9 a18,18 0 0 1 36,0 M24,9 a12,12 0 0 1 24,0"/>
      </g>
    </pattern>`;
}

/** Meer: Tuschegrund, Wellenmuster weit draußen, Küstenringe und einzelne Wellenkämme. */
export function seaLayer(geo: MapGeometry): string {
  const isl = Object.values(geo.islands).map((p) => toPath(p)).join('');
  const out: string[] = [];
  out.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="${SEA}"/>`);
  // Dunklere Tiefe zum Kartenrand hin
  out.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="url(#deep)"/>`);
  out.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="url(#seigaiha)"/>`);
  // Ruhiges Wasser an der Küste deckt das Muster ab, darin konzentrische Ringe.
  const rings: [number, number][] = [[60, 0.1], [42, 0.16], [26, 0.24], [13, 0.34]];
  for (const [w, o] of rings) {
    out.push(`<path d="${isl}" fill="none" stroke="${INK}" stroke-width="${w + 1.4}" stroke-linejoin="round" opacity="${o}"/>`);
    out.push(`<path d="${isl}" fill="none" stroke="${SEA}" stroke-width="${w}" stroke-linejoin="round"/>`);
  }
  // Flachwasser: helle Lasur direkt an der Küste
  out.push(`<path d="${isl}" fill="none" stroke="#e6e6d8" stroke-width="9" stroke-linejoin="round" opacity=".9"/>`);
  out.push(waveCrests(geo));
  return out.join('');
}

/** Einzelne, gemalte Wellenkämme im offenen Meer (animiert per CSS). */
function waveCrests(geo: MapGeometry): string {
  const rnd = rngFrom('wellen');
  const isles = Object.values(geo.islands);
  const nearLand = (p: Pt) =>
    [[0, 0], [70, 0], [-70, 0], [0, 70], [0, -70], [50, 50], [-50, 50], [50, -50], [-50, -50]].some(([dx, dy]) =>
      isles.some((poly) => pointInPolygon([p[0] + dx, p[1] + dy], poly)),
    );
  const pts: Pt[] = [];
  for (let tries = 0; tries < 600 && pts.length < 26; tries++) {
    const p: Pt = [30 + rnd() * (MAP_W - 60), 30 + rnd() * (MAP_H - 60)];
    if (nearLand(p) || pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 85)) continue;
    pts.push(p);
  }
  return `<g class="crests" fill="none" stroke="${WASH}" stroke-linecap="round">${pts
    .map((p, i) => {
      const s = 0.7 + rnd() * 0.6;
      return `<g transform="translate(${f1(p[0])},${f1(p[1])}) scale(${s.toFixed(2)})"><g class="crest" style="animation-delay:${(-i * 0.73).toFixed(2)}s">
        <path d="M-22,4 q8,-12 20,-8 q8,3 4,9 q-5,4 -9,-1" stroke-width="1.6" opacity=".55"/>
        <path d="M-30,9 q15,-6 30,0 t30,0" stroke-width="1.1" opacity=".4"/></g></g>`;
    })
    .join('')}</g>`;
}

/** Seewege: gestrichelte Bögen mit kleinem Boot (unter dem Land gezeichnet). */
export function seaRoutes(geo: MapGeometry, open: boolean): string {
  const out: string[] = [];
  for (const e of ADJACENCIES.filter((x) => x.sea)) {
    const a = geo.centers[e.a];
    const b = geo.centers[e.b];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const c: Pt = [mx - (dy / len) * len * 0.18, my + (dx / len) * len * 0.18];
    const bx = 0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0];
    const by = 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1];
    out.push(`<path d="M${f1(a[0])},${f1(a[1])} Q${f1(c[0])},${f1(c[1])} ${f1(b[0])},${f1(b[1])}" />`);
    out.push(`<g transform="translate(${f1(bx)},${f1(by)})" class="boat"><path d="M-8,0 L8,0 L5,4 L-5,4Z" fill="${INK}" stroke="none"/>
      <path d="M0,0 V-12" stroke-width="1"/><path d="M1,-11 L8,-3 L1,-3Z" fill="#efe3c8" stroke-width=".8"/></g>`);
  }
  return `<g class="searoutes${open ? '' : ' closed'}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-dasharray="2 6" stroke-linecap="round" opacity=".55">${out.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Geländezeichen
// ---------------------------------------------------------------------------

function mountain(s: number, flip: boolean): string {
  const k = flip ? -1 : 1;
  return `<g transform="scale(${(k * s).toFixed(2)},${s.toFixed(2)})">
    <path d="M-16,6 L-5,-13 L1,-4 L6,-9 L16,6Z" fill="${INK}" opacity=".07"/>
    <path d="M-5,-13 L1,-4 L-2,6 L-9,6Z" fill="${INK}" opacity=".16"/>
    <path d="M-16,6 L-5,-13 L1,-4 L6,-9 L16,6" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M-5,-13 L-6,-5 M6,-9 L5,-3" stroke="${INK}" stroke-width=".8" opacity=".6"/>
    <path class="snow" d="M-8,-7.5 L-5,-13 L-1.5,-8 L-3,-6.5 L-5,-8 Z"/></g>`;
}

function pine(s: number): string {
  return `<g transform="scale(${s.toFixed(2)})">
    <path d="M0,9 V-4" stroke="${INK}" stroke-width="1.4"/>
    <path d="M-10,4 q10,-5 20,0 q-10,2 -20,0Z M-8,-1 q8,-5 16,0 q-8,2 -16,0Z M-5,-6 q5,-5 10,0 q-5,2 -10,0Z" fill="${INK}" opacity=".78"/></g>`;
}

function paddy(s: number, r: number): string {
  return `<g transform="rotate(${r.toFixed(0)}) scale(${s.toFixed(2)})" stroke="${INK}" fill="none" opacity=".45">
    <rect x="-10" y="-6" width="20" height="12" stroke-width="1"/>
    <path d="M-7,-2.5 h14 M-7,1 h14 M-7,4 h14" stroke-width=".6"/></g>`;
}

function reeds(s: number): string {
  return `<g transform="scale(${s.toFixed(2)})" stroke="${INK}" fill="none" stroke-linecap="round" opacity=".6">
    <path d="M0,6 q-1,-8 -4,-13 M2,6 q1,-7 4,-11 M-2,6 q-3,-5 -7,-7" stroke-width=".9"/></g>`;
}

/** Freier Punkt in der Provinz: nicht am Rand, nicht auf Beschriftung/Burg/Banner. */
function freeSpots(id: ProvinceId, poly: Pt[], center: Pt, count: number, minDist: number): Pt[] {
  const rnd = rngFrom(`gelaende-${id}`);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const m = 12;
  const inside = (p: Pt) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dy]) => pointInPolygon([p[0] + dx, p[1] + dy], poly));
  const label = (p: Pt) => p[0] > center[0] - 48 && p[0] < center[0] + 52 && p[1] > center[1] - 46 && p[1] < center[1] + 28;
  const out: Pt[] = [];
  for (let t = 0; t < 400 && out.length < count; t++) {
    const p: Pt = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
    if (!inside(p) || label(p) || out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < minDist)) continue;
    out.push(p);
  }
  return out.sort((a, b) => a[1] - b[1]); // von hinten nach vorn zeichnen
}

function area(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) a += poly[i][0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * poly[i][1];
  return Math.abs(a / 2);
}

/** Fluss vom Inneren der Provinz zur nächsten Küste. */
function river(id: ProvinceId, geo: MapGeometry): string {
  const c = geo.centers[id];
  const coast = Object.values(geo.islands).flat();
  let best = coast[0];
  for (const p of coast) if (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(best[0] - c[0], best[1] - c[1])) best = p;
  const rnd = rngFrom(`fluss-${id}`);
  const start: Pt = [c[0] + (c[0] - best[0]) * 0.35 + 30, c[1] + (c[1] - best[1]) * 0.35 - 20];
  const pts: Pt[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = start[0] + (best[0] - start[0]) * t;
    const y = start[1] + (best[1] - start[1]) * t;
    const dx = best[0] - start[0];
    const dy = best[1] - start[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = Math.sin(t * Math.PI * 2.2 + rnd()) * 9 * (1 - t * 0.4);
    pts.push([x - (dy / l) * w, y + (dx / l) * w]);
  }
  const d = `M${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' L')}`;
  return `<path d="${d}" fill="none" stroke="${WASH}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".25"/>
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>`;
}

/** Geländezeichen aller Provinzen (statisch, nur von der Geometrie abhängig). */
export function terrainLayer(geo: MapGeometry): string {
  const out: string[] = ['<g class="terrain" pointer-events="none">'];
  for (const id of PROVINCE_IDS) {
    const poly = geo.cells[id];
    const terrain = PROVINCES[id].terrain;
    const rnd = rngFrom(`zeichen-${id}`);
    const n = Math.max(2, Math.min(9, Math.round(area(poly) / 1700)));
    if (terrain === 'river') out.push(river(id, geo));
    for (const [x, y] of freeSpots(id, poly, geo.centers[id], n, 26)) {
      const r = rnd();
      let g: string;
      if (terrain === 'hills') g = r < 0.72 ? mountain(0.9 + rnd() * 0.6, rnd() < 0.5) : pine(0.8 + rnd() * 0.3);
      else if (terrain === 'forest') g = r < 0.85 ? pine(0.8 + rnd() * 0.5) : mountain(0.8, rnd() < 0.5);
      else if (terrain === 'river') g = r < 0.6 ? paddy(0.9, rnd() * 30 - 15) : reeds(1 + rnd() * 0.3);
      else g = r < 0.7 ? paddy(0.9 + rnd() * 0.3, rnd() * 30 - 15) : pine(0.75);
      out.push(`<g transform="translate(${f1(x)},${f1(y)})">${g}</g>`);
    }
  }
  out.push('</g>');
  return out.join('');
}

// ---------------------------------------------------------------------------
// Clan-Lasur und Grenzen
// ---------------------------------------------------------------------------

/** Farblasur je Clan – halbtransparent, mit ausfransenden Rändern. */
export function clanWash(state: GameState, geo: MapGeometry): string {
  const out: string[] = ['<g class="wash" filter="url(#wash)" pointer-events="none">'];
  for (const id of PROVINCE_IDS) {
    const owner = state.provinces[id].owner;
    if (owner === NEUTRAL_CLAN) continue;
    const c = CLANS[owner].color;
    out.push(`<path d="${toPath(geo.cells[id])}" fill="${c}" fill-opacity=".42" stroke="${c}" stroke-width="5" stroke-opacity=".35"/>`);
  }
  out.push('</g>');
  return out.join('');
}

/** Gemeinsame Grenzen, vorberechnet: [a, b, Kanten]. */
export function computeBorders(geo: MapGeometry): { a: ProvinceId; b: ProvinceId; d: string }[] {
  const res: { a: ProvinceId; b: ProvinceId; d: string }[] = [];
  for (let i = 0; i < PROVINCE_IDS.length; i++) {
    for (let j = i + 1; j < PROVINCE_IDS.length; j++) {
      const [a, b] = [PROVINCE_IDS[i], PROVINCE_IDS[j]];
      const edges = sharedEdges(geo.cells[a], geo.cells[b]);
      if (!edges.length) continue;
      res.push({ a, b, d: edges.map(([p, q]) => `M${f1(p[0])},${f1(p[1])}L${f1(q[0])},${f1(q[1])}`).join('') });
    }
  }
  return res;
}

let bordersCache: { geo: MapGeometry; list: ReturnType<typeof computeBorders> } | undefined;

/** Grenzen: fein innerhalb eines Clans, kräftiger Pinselstrich zwischen Clans, Küste als Tuschelinie. */
export function bordersLayer(state: GameState, geo: MapGeometry): string {
  if (bordersCache?.geo !== geo) bordersCache = { geo, list: computeBorders(geo) };
  const inner: string[] = [];
  const outer: string[] = [];
  for (const b of bordersCache.list) (state.provinces[b.a].owner === state.provinces[b.b].owner ? inner : outer).push(b.d);
  const isl = Object.values(geo.islands).map((p) => toPath(p)).join('');
  return `<g pointer-events="none" fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" filter="url(#brush)">
    <path d="${inner.join('')}" stroke-width="1" stroke-dasharray="1 4" opacity=".6"/>
    <path d="${outer.join('')}" stroke-width="2.6" opacity=".8"/>
    <path d="${isl}" stroke-width="2.8"/></g>`;
}

// ---------------------------------------------------------------------------
// Goldwolken (Suyari-gasumi) wie auf Stellschirmen
// ---------------------------------------------------------------------------

/** Goldverlauf und Blattgold-Raster für die Wolken. */
export function goldDefs(): string {
  return `
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f1d98a"/><stop offset=".5" stop-color="#dcb65a"/><stop offset="1" stop-color="#c39a3f"/>
    </linearGradient>
    <filter id="goldleaf" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .75  0 0 0 1.6 -1.05" result="f"/>
      <feComposite in="f" in2="SourceGraphic" operator="in" result="fl"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="fl"/></feMerge>
    </filter>`;
}

/** Eine Wolke: flacher Boden, oben eine Reihe runder Bäusche, die Enden eingerollt. */
function cloudBank(x: number, y: number, w: number, h: number, rnd: () => number): string {
  // Bäusche von rechts nach links
  const bumps: number[] = [];
  let rest = w;
  while (rest > h * 0.9) {
    const r = h * (0.45 + rnd() * 0.45);
    bumps.push(Math.min(r, rest / 2));
    rest -= bumps[bumps.length - 1] * 2;
  }
  const yb = y + h;
  let d = `M${f1(x)},${f1(yb)} L${f1(x + w - rest)},${f1(yb)}`;
  for (const r of bumps) d += ` a${f1(r)},${f1(r * 0.85)} 0 0 0 ${f1(-2 * r)},0`;
  d += ' Z';
  const curl = (px: number, s: number) =>
    `<path d="M${f1(px)},${f1(yb - 3)} a${f1(5 * s)},${f1(5 * s)} 0 1 1 ${f1(7 * s)},${f1(-4 * s)} a${f1(3 * s)},${f1(3 * s)} 0 1 1 ${f1(-4 * s)},${f1(2 * s)}"/>`;
  return `<g class="cloud">
    <path d="${d}" fill="#7a5a22" opacity=".25" transform="translate(2,3)"/>
    <path d="${d}" fill="url(#gold)" filter="url(#goldleaf)"/>
    <path d="${d}" fill="none" stroke="#8d6a2a" stroke-width="1.4" stroke-linejoin="round"/>
    <g fill="none" stroke="#8d6a2a" stroke-width="1.1" stroke-linecap="round">${curl(x + bumps[bumps.length - 1] * 0.6, h / 30)}${curl(x + w - rest - 18, h / 34)}</g></g>`;
}

/** Wolken über Meer und Kartenrand (ziehen langsam, verdecken keine Provinzmitten). */
export function goldClouds(): string {
  const rnd = rngFrom('wolken');
  const banks: [number, number, number, number][] = [
    [-20, 60, 340, 34], [110, 108, 200, 26], [690, 90, 150, 28], [-30, 470, 140, 26], [620, 720, 400, 36], [400, 790, 180, 26],
  ];
  return `<g class="clouds" pointer-events="none">${banks
    .map(([x, y, w, h], i) => `<g class="drift" style="animation-delay:${(-i * 3.7).toFixed(1)}s">${cloudBank(x, y, w, h, rnd)}</g>`)
    .join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Clan-Farbbänder entlang der Außengrenzen (wie auf alten Provinzkarten)
// ---------------------------------------------------------------------------

export function clanBands(state: GameState, geo: MapGeometry): string {
  if (bordersCache?.geo !== geo) bordersCache = { geo, list: computeBorders(geo) };
  const clans = new Map<string, ProvinceId[]>();
  for (const id of PROVINCE_IDS) {
    const o = state.provinces[id].owner;
    if (o === NEUTRAL_CLAN) continue;
    if (!clans.has(o)) clans.set(o, []);
    clans.get(o)!.push(id);
  }
  const isl = Object.values(geo.islands).map((p) => toPath(p)).join('');
  const clips: string[] = [];
  const bands: string[] = [];
  for (const [clan, ids] of clans) {
    clips.push(`<clipPath id="terr-${clan}">${ids.map((id) => `<path d="${toPath(geo.cells[id])}"/>`).join('')}</clipPath>`);
    const edges = bordersCache.list.filter((b) => (state.provinces[b.a].owner === clan) !== (state.provinces[b.b].owner === clan)).map((b) => b.d);
    const c = CLANS[clan].color;
    bands.push(`<g clip-path="url(#terr-${clan})" fill="none" stroke="${c}" stroke-linejoin="round">
      <path d="${edges.join('')}${isl}" stroke-width="18" stroke-opacity=".28"/>
      <path d="${edges.join('')}${isl}" stroke-width="7" stroke-opacity=".45"/></g>`);
  }
  return `<defs>${clips.join('')}</defs><g class="bands" pointer-events="none" filter="url(#brush)">${bands.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Burgen
// ---------------------------------------------------------------------------

/** Gemalte Burg: Steinsockel, weiße Mauern, geschwungene dunkle Dächer; Stockwerke = Stufe. */
export function castleArt(level: number): string {
  const roof = (w: number, y: number) =>
    `<path d="M${-w - 3},${y} Q${-w},${y - 1} ${-w + 2},${y - 4} L${w - 2},${y - 4} Q${w},${y - 1} ${w + 3},${y} Z" fill="#2f2a26"/>`;
  const floors: string[] = [];
  let y = -2;
  let w = 10;
  for (let i = 0; i < level; i++) {
    floors.push(`<rect x="${-w + 2}" y="${y - 6}" width="${(w - 2) * 2}" height="6" fill="#f6f0e2" stroke="${INK}" stroke-width=".5"/>`);
    floors.push(`<path d="M${-w + 4},${y - 3} h${(w - 4) * 2}" stroke="${INK}" stroke-width=".4" opacity=".5"/>`);
    floors.push(roof(w, y - 6));
    y -= 10;
    w -= 2.5;
  }
  floors.push(`<path d="M-1.5,${y + 4} l1.5,-3 l1.5,3" fill="#d9b45a"/>`);
  return `<g class="castle">
    <ellipse cx="0" cy="7" rx="15" ry="3" fill="${INK}" opacity=".18"/>
    <path d="M-13,6 L13,6 L10,-2 L-10,-2Z" fill="#8b8273" stroke="${INK}" stroke-width=".6"/>
    <path d="M-11,3 h22 M-10.5,0.5 h21" stroke="${INK}" stroke-width=".35" opacity=".5"/>${floors.join('')}</g>`;
}
