// Gemaltes Land: Einmal beim Start mit vielen Pinselstrichen auf ein Canvas gemalt
// (Berge mit Nebel, Kiefernwälder, Reisfelder, Flüsse, Papierfasern) und als Bild
// unter die SVG-Karte gelegt. Fest geseedet – sieht bei jedem Spiel gleich aus.
import { PROVINCES, PROVINCE_IDS } from '../data';
import type { ProvinceId } from '../data/types';
import { MAP_H, MAP_W, pointInPolygon, type MapGeometry, type Pt } from './geometry';
import { rngFrom } from './ink';

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;

const INK = [43, 33, 24];
const ink = (a: number) => `rgba(${INK[0]},${INK[1]},${INK[2]},${a.toFixed(3)})`;

let cache: { geo: MapGeometry; url: string } | undefined;

/** Liefert das gemalte Land als Bild-URL, oder undefined ohne Browser (Tests). */
export function paintedLand(geo: MapGeometry): string | undefined {
  if (cache?.geo === geo) return cache.url;
  if (typeof document === 'undefined') return undefined;
  const K = 1.6;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(MAP_W * K);
  canvas.height = Math.round(MAP_H * K);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.scale(K, K);
  paint(ctx, geo);
  const url = canvas.toDataURL('image/webp', 0.88);
  cache = { geo, url };
  return url;
}

function islandPath(ctx: Ctx, geo: MapGeometry) {
  ctx.beginPath();
  for (const poly of Object.values(geo.islands)) {
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
}

function paint(ctx: Ctx, geo: MapGeometry) {
  const rnd = rngFrom('pinsel');
  ctx.save();
  islandPath(ctx, geo);
  ctx.clip();

  // 1. Papiergrund mit unregelmäßigen Farbwolken
  ctx.fillStyle = '#efe3c6';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * MAP_W;
    const y = rnd() * MAP_H;
    const r = 30 + rnd() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rnd() < 0.5 ? '120,128,70' : '160,120,60';
    g.addColorStop(0, `rgba(${tone},${(0.04 + rnd() * 0.06).toFixed(3)})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Papierfasern
  ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * MAP_W;
    const y = rnd() * MAP_H;
    const a = rnd() * Math.PI;
    const l = 3 + rnd() * 12;
    ctx.strokeStyle = rnd() < 0.5 ? ink(0.035) : 'rgba(255,250,235,0.25)';
    ctx.lineWidth = 0.4 + rnd() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  // 2. Gelände je Provinz, von hinten (oben) nach vorn (unten)
  const items: { y: number; draw: () => void }[] = [];
  for (const id of PROVINCE_IDS) {
    const t = PROVINCES[id].terrain;
    const r = rngFrom(`land-${id}`);
    const poly = geo.cells[id];
    const c = geo.centers[id];
    if (t === 'river') river(ctx, id, geo, r);
    const spots = scatter(id, poly, c, t === 'hills' ? 26 : t === 'forest' ? 20 : 14, t === 'hills' ? 20 : 22, r);
    for (const p of spots) {
      const k = r();
      if (t === 'hills') {
        if (k < 0.8) items.push({ y: p[1], draw: () => mountain(ctx, p, 0.8 + r() * 0.9, r) });
        else items.push({ y: p[1], draw: () => grove(ctx, p, r) });
      } else if (t === 'forest') {
        if (k < 0.75) items.push({ y: p[1], draw: () => grove(ctx, p, r) });
        else items.push({ y: p[1], draw: () => mountain(ctx, p, 0.7 + r() * 0.5, r) });
      } else if (t === 'river') {
        if (k < 0.55) items.push({ y: p[1] - 100, draw: () => paddies(ctx, p, r) });
        else if (k < 0.8) items.push({ y: p[1], draw: () => reeds(ctx, p, r) });
        else items.push({ y: p[1], draw: () => grove(ctx, p, r, 0.6) });
      } else {
        if (k < 0.6) items.push({ y: p[1] - 100, draw: () => paddies(ctx, p, r) });
        else if (k < 0.8) items.push({ y: p[1], draw: () => grove(ctx, p, r, 0.6) });
        else items.push({ y: p[1], draw: () => village(ctx, p, r) });
      }
    }
  }
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

  // 3. Dunklerer Rand entlang der Küste (wie verlaufene Farbe)
  ctx.save();
  ctx.filter = 'blur(5px)';
  islandPath(ctx, geo);
  ctx.strokeStyle = 'rgba(120,92,50,0.28)';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Punkte in der Provinz, fern von Rand und Beschriftung. */
function scatter(id: ProvinceId, poly: Pt[], c: Pt, count: number, minDist: number, rnd: Rnd): Pt[] {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const m = 9;
  const inside = (p: Pt) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dy]) => pointInPolygon([p[0] + dx, p[1] + dy], poly));
  const label = (p: Pt) => p[0] > c[0] - 50 && p[0] < c[0] + 54 && p[1] > c[1] - 48 && p[1] < c[1] + 30;
  const out: Pt[] = [];
  const area = (x1 - x0) * (y1 - y0);
  const n = Math.min(count, Math.max(3, Math.round(area / 900)));
  for (let t = 0; t < 900 && out.length < n; t++) {
    const p: Pt = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
    if (!inside(p) || label(p) || out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < minDist)) continue;
    out.push(p);
  }
  void id;
  return out;
}

/** Berg im Sumi-e-Stil: Lasur von oben nach unten verblassend, Grat als Pinselstrich, Faltenstriche, Nebel am Fuß. */
function mountain(ctx: Ctx, [x, y]: Pt, s: number, rnd: Rnd) {
  const w = (34 + rnd() * 26) * s;
  const h = (24 + rnd() * 22) * s;
  const apex: Pt = [x + (rnd() - 0.5) * w * 0.3, y - h];
  // Gratlinie mit Zacken
  const ridge: Pt[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const left = t <= 0.5;
    const u = left ? t * 2 : (t - 0.5) * 2;
    const px = left ? x - w / 2 + (apex[0] - (x - w / 2)) * u : apex[0] + (x + w / 2 - apex[0]) * u;
    const py = left ? y + (apex[1] - y) * Math.pow(u, 0.8) : apex[1] + (y - apex[1]) * Math.pow(u, 1.25);
    const j = i === 0 || i === steps || i === steps / 2 ? 0 : (rnd() - 0.5) * 4 * s;
    ridge.push([px, py + j]);
  }
  // Körper
  const g = ctx.createLinearGradient(0, apex[1], 0, y);
  g.addColorStop(0, ink(0.42));
  g.addColorStop(0.55, ink(0.14));
  g.addColorStop(1, ink(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ridge.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // Schattenseite
  ctx.fillStyle = ink(0.12);
  ctx.beginPath();
  ctx.moveTo(apex[0], apex[1]);
  ctx.lineTo(apex[0] + w * 0.08, y);
  ctx.lineTo(x + w / 2, y);
  ridge.slice(steps / 2).reverse().forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.closePath();
  ctx.fill();
  // Grat: mehrere leicht versetzte Striche = Pinselspur
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = ink(0.35 + rnd() * 0.25);
    ctx.lineWidth = (0.8 + rnd() * 1.6) * s;
    ctx.beginPath();
    ridge.slice(0, steps - 1).forEach(([px, py], i) => {
      const jx = px + (rnd() - 0.5) * 1.2;
      const jy = py + (rnd() - 0.5) * 1.2;
      if (i) ctx.lineTo(jx, jy);
      else ctx.moveTo(jx, jy);
    });
    ctx.stroke();
  }
  // Faltenstriche (Cun)
  ctx.lineWidth = 0.7 * s;
  for (let k = 0; k < 5; k++) {
    const t = 0.2 + rnd() * 0.6;
    const sx = apex[0] + (rnd() - 0.3) * w * 0.4;
    const sy = apex[1] + h * t * 0.6;
    ctx.strokeStyle = ink(0.25 + rnd() * 0.2);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx - 3 * s, sy + 5 * s, sx - 2 * s, sy + (8 + rnd() * 6) * s);
    ctx.stroke();
  }
  // Nebel am Fuß
  const m = ctx.createLinearGradient(0, y - h * 0.35, 0, y + 4);
  m.addColorStop(0, 'rgba(244,236,214,0)');
  m.addColorStop(1, 'rgba(244,236,214,0.85)');
  ctx.fillStyle = m;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.62, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Kiefernhain: Stämme und Tupfen in Schichten (Mi-Punkte). */
function grove(ctx: Ctx, [x, y]: Pt, rnd: Rnd, scale = 1) {
  const n = Math.round((3 + rnd() * 4) * scale);
  for (let i = 0; i < n; i++) {
    const tx = x + (rnd() - 0.5) * 30 * scale;
    const ty = y + (rnd() - 0.5) * 14 * scale;
    const th = (12 + rnd() * 10) * scale;
    ctx.strokeStyle = ink(0.6);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + (rnd() - 0.5) * 4, ty - th * 0.5, tx + (rnd() - 0.5) * 3, ty - th);
    ctx.stroke();
    // Nadelpolster als waagrechte Tupfen
    for (let l = 0; l < 3; l++) {
      const ly = ty - th * (0.45 + l * 0.22);
      const lw = (9 - l * 2.2) * scale;
      for (let d = 0; d < 6; d++) {
        ctx.fillStyle = `rgba(${36 + rnd() * 20},${46 + rnd() * 20},${30},${(0.35 + rnd() * 0.35).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(tx + (rnd() - 0.5) * lw * 1.6, ly + (rnd() - 0.5) * 2.5, 2 + rnd() * 3, 1 + rnd() * 1.4, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Reisfelder: Lasur in Grüngelb, Dämme als feine Linien. */
function paddies(ctx: Ctx, [x, y]: Pt, rnd: Rnd) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rnd() - 0.5) * 0.5);
  const cols = 2 + Math.floor(rnd() * 2);
  const rows = 2;
  const cw = 13 + rnd() * 5;
  const rh = 8 + rnd() * 3;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const px = (i - cols / 2) * cw;
      const py = (j - rows / 2) * rh;
      ctx.fillStyle = `rgba(${130 + rnd() * 30},${140 + rnd() * 20},${60 + rnd() * 20},${(0.3 + rnd() * 0.2).toFixed(2)})`;
      ctx.fillRect(px + 1, py + 1, cw - 2, rh - 2);
      ctx.strokeStyle = ink(0.42);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(px + 1, py + 1, cw - 2, rh - 2);
      ctx.strokeStyle = 'rgba(70,90,40,0.25)';
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(px + 3, py + 1 + (k * (rh - 2)) / 3);
        ctx.lineTo(px + cw - 3, py + 1 + (k * (rh - 2)) / 3);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function reeds(ctx: Ctx, [x, y]: Pt, rnd: Rnd) {
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const bx = x + (rnd() - 0.5) * 16;
    ctx.strokeStyle = ink(0.35 + rnd() * 0.25);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 6, y - 6, bx + (rnd() - 0.5) * 10, y - 10 - rnd() * 6);
    ctx.stroke();
  }
}

/** Kleines Dorf: zwei, drei Dächer. */
function village(ctx: Ctx, [x, y]: Pt, rnd: Rnd) {
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const hx = x + (i - n / 2) * 9 + rnd() * 3;
    const hy = y + (rnd() - 0.5) * 6;
    ctx.fillStyle = 'rgba(240,230,205,0.95)';
    ctx.fillRect(hx - 3.5, hy - 3, 7, 5);
    ctx.strokeStyle = ink(0.5);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(hx - 3.5, hy - 3, 7, 5);
    ctx.fillStyle = ink(0.7);
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy - 2.5);
    ctx.lineTo(hx, hy - 7.5);
    ctx.lineTo(hx + 6, hy - 2.5);
    ctx.closePath();
    ctx.fill();
  }
}

/** Fluss vom Bergland zur nächsten Küste: zur Mündung hin breiter. */
function river(ctx: Ctx, id: ProvinceId, geo: MapGeometry, rnd: Rnd) {
  const c = geo.centers[id];
  let best = geo.islands.honshu[0];
  for (const poly of Object.values(geo.islands)) {
    for (const p of poly) if (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(best[0] - c[0], best[1] - c[1])) best = p;
  }
  const start: Pt = [c[0] + (c[0] - best[0]) * 0.4 + 34, c[1] + (c[1] - best[1]) * 0.4 - 26];
  const pts: Pt[] = [];
  const n = 18;
  const dx = best[0] - start[0];
  const dy = best[1] - start[1];
  const l = Math.hypot(dx, dy) || 1;
  const ph = rnd() * 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = Math.sin(t * Math.PI * 2.4 + ph) * 11 * (1 - t * 0.5);
    pts.push([start[0] + dx * t - (dy / l) * w, start[1] + dy * t + (dx / l) * w]);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const [a, b] = [pts[i], pts[i + 1]];
    ctx.strokeStyle = 'rgba(88,108,112,0.45)';
    ctx.lineWidth = 1.5 + t * 6;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,232,226,0.7)';
    ctx.lineWidth = 0.4 + t * 2.2;
    ctx.stroke();
  }
}
