// Kartengeometrie (rein, testbar): Inselumrisse, Provinzflächen per Voronoi-Zerlegung
// innerhalb der jeweiligen Insel, Schwerpunkte für Beschriftungen.
import { PROVINCES, PROVINCE_IDS } from '../data';
import type { ProvinceId } from '../data/types';

export type Pt = [number, number];

/** Skalierung Datenkoordinaten (0–100 × 0–80) -> SVG-Einheiten. */
export const SCALE = 10;
export const MAP_W = 1040;
export const MAP_H = 840;

/** Grobe, handgezeichnete Inselumrisse in Datenkoordinaten (werden geglättet). */
const ISLAND_OUTLINES: Record<string, Pt[]> = {
  kyushu: [
    [5, 56], [9, 54.5], [13, 55], [16, 57], [19, 59], [21, 62], [20, 67], [17, 71], [14, 76], [12, 80],
    [9, 79.5], [6, 78], [3, 74], [5, 70], [4, 66], [2, 62], [3, 58],
  ],
  shikoku: [
    [24, 58], [28, 57], [33, 56], [38, 55], [42, 55.5], [43, 58], [41, 61], [38, 63], [36, 67],
    [33, 66.5], [30, 64], [27, 64.5], [24, 63], [23, 60],
  ],
  honshu: [
    [13, 53], [15, 56], [20, 55.5], [26, 54.5], [32, 52.5], [38, 52], [44, 51], [47, 54], [48, 57],
    [49, 62], [52, 64.5], [56, 61], [57, 57], [60, 56], [62, 53], [66, 52], [70, 53], [74, 52.5],
    [78, 52], [80, 51], [82, 50.5], [85, 50], [88, 47], [91, 45], [95, 43], [97, 40], [98, 34],
    [99, 27], [100, 20], [99, 12], [96, 6], [91, 5], [86, 8], [84, 13], [82, 19], [79, 22], [74, 27],
    [70, 31], [65, 33], [62, 32], [60, 34], [56, 35], [52, 39], [48, 40], [44, 41], [38, 41],
    [32, 41], [26, 42], [20, 46], [15, 49], [13, 51],
  ],
};

export const ISLAND_OF: Record<ProvinceId, string> = Object.fromEntries(
  PROVINCE_IDS.map((id) => [id, ['satsuma', 'higo', 'chikuzen', 'bungo'].includes(id) ? 'kyushu' : ['iyo', 'tosa', 'sanuki'].includes(id) ? 'shikoku' : 'honshu']),
);

/** Chaikin-Glättung für weiche Küsten. */
export function chaikin(poly: Pt[], iterations = 2): Pt[] {
  let p = poly;
  for (let it = 0; it < iterations; it++) {
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

/** Sutherland–Hodgman: Polygon an Halbebene {p : (p - m)·n <= 0} abschneiden. */
export function clipHalfPlane(poly: Pt[], m: Pt, n: Pt): Pt[] {
  const inside = (p: Pt) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] <= 1e-9;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci !== pi) {
      const dc = (cur[0] - m[0]) * n[0] + (cur[1] - m[1]) * n[1];
      const dp = (prev[0] - m[0]) * n[0] + (prev[1] - m[1]) * n[1];
      const t = dp / (dp - dc);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (ci) out.push(cur);
  }
  return out;
}

export function centroid(poly: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return poly[0];
  return [cx / (3 * a), cy / (3 * a)];
}

export interface MapGeometry {
  islands: Record<string, Pt[]>;
  cells: Record<ProvinceId, Pt[]>;
  centers: Record<ProvinceId, Pt>;
}

/**
 * Verformt eine Küstenlinie entlang der Normalen mit festem, glattem Rauschen
 * (Summe von Sinuswellen über die Bogenlänge) – zerklüftet, aber bei jedem Spiel gleich.
 */
export function roughen(poly: Pt[], seed: number, amp = 5): Pt[] {
  const n = poly.length;
  // Umlaufsinn bestimmen, damit "außen" immer außen ist
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1];
  const sign = area > 0 ? 1 : -1;
  let s = 0;
  return poly.map((p, i) => {
    const prev = poly[(i + n - 1) % n];
    const next = poly[(i + 1) % n];
    s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = (ty / tl) * sign;
    const ny = (-tx / tl) * sign;
    const d =
      amp * (0.55 * Math.sin(s * 0.021 + seed) + 0.3 * Math.sin(s * 0.057 + seed * 2.3) + 0.15 * Math.sin(s * 0.13 + seed * 4.1));
    return [p[0] + nx * d, p[1] + ny * d] as Pt;
  });
}

/** Berechnet alle Polygone in SVG-Koordinaten. */
export function buildGeometry(): MapGeometry {
  const islands: Record<string, Pt[]> = {};
  Object.entries(ISLAND_OUTLINES).forEach(([k, outline], i) => {
    islands[k] = roughen(chaikin(outline, 3).map(([x, y]) => [x * SCALE + 20, y * SCALE + 20] as Pt), 1.7 + i * 3.1);
  });
  const site = (id: ProvinceId): Pt => [PROVINCES[id].x * SCALE + 20, PROVINCES[id].y * SCALE + 20];
  const cells: Record<ProvinceId, Pt[]> = {};
  const centers: Record<ProvinceId, Pt> = {};
  for (const id of PROVINCE_IDS) {
    let poly = islands[ISLAND_OF[id]];
    const a = site(id);
    for (const other of PROVINCE_IDS) {
      if (other === id || ISLAND_OF[other] !== ISLAND_OF[id]) continue;
      const b = site(other);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      poly = clipHalfPlane(poly, mid, [b[0] - a[0], b[1] - a[1]]);
    }
    cells[id] = poly;
    centers[id] = centroid(poly);
  }
  return { islands, cells, centers };
}

/** Länge der gemeinsamen Grenze zweier Polygone (Kanten von a, die auf dem Rand von b liegen). */
export function borderLength(a: Pt[], b: Pt[], eps = 0.6): number {
  return sharedEdges(a, b, eps).reduce((len, [p, q]) => len + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
}

/** Kanten von a, die auf dem Rand von b liegen (gemeinsame Grenze). */
export function sharedEdges(a: Pt[], b: Pt[], eps = 0.6): [Pt, Pt][] {
  const onSeg = (p: Pt, q: Pt, r: Pt) => {
    const dx = r[0] - q[0];
    const dy = r[1] - q[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy) < eps;
  };
  const edges: [Pt, Pt][] = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j];
      const t = b[(j + 1) % b.length];
      if (onSeg(p, r, t) && onSeg(q, r, t)) {
        edges.push([p, q]);
        break;
      }
    }
  }
  return edges;
}

/** Punkt-in-Polygon (Ray Casting). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const toPath = (poly: Pt[]) => `M${poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
