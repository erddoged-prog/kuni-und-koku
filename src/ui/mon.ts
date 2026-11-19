// Selbst gestaltete Clan-Wappen (Mon) aus einfachen geometrischen Formen.
// Koordinatensystem: Kreis mit Radius 50 um (0,0).
import { CLANS } from '../data';
import type { ClanId, MonShape } from '../data/types';

function shapeBody(shape: MonShape, fg: string, bg: string): string {
  switch (shape) {
    case 'ring': // Sonnenring: dicker Ring, Scheibe, vier Strahlpunkte
      return `<circle r="30" fill="none" stroke="${fg}" stroke-width="7"/><circle r="13" fill="${fg}"/>
        ${[0, 90, 180, 270].map((a) => `<circle cx="${Math.cos((a * Math.PI) / 180) * 21.5}" cy="${Math.sin((a * Math.PI) / 180) * 21.5}" r="3.5" fill="${fg}"/>`).join('')}`;
    case 'diamond': // Doppelraute
      return `<path d="M0,-34L34,0L0,34L-34,0Z" fill="none" stroke="${fg}" stroke-width="7"/><path d="M0,-15L15,0L0,15L-15,0Z" fill="${fg}"/>`;
    case 'triple': // Drei Scheiben im Dreieck
      return [0, 120, 240]
        .map((a) => {
          const r = ((a - 90) * Math.PI) / 180;
          return `<circle cx="${(Math.cos(r) * 17).toFixed(2)}" cy="${(Math.sin(r) * 17).toFixed(2)}" r="13" fill="${fg}"/>`;
        })
        .join('') + `<circle r="5" fill="${bg}"/>`;
    case 'wave': // Drei Wellenbänder
      return [-16, 0, 16]
        .map((y) => `<path d="M-32,${y} q8,-10 16,0 t16,0 t16,0 t16,0" fill="none" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>`)
        .join('');
    case 'pine': // Stilisierte Kiefer aus drei Dreiecken
      return `<path d="M0,-34L18,-12H-18Z M0,-20L24,6H-24Z M0,-4L30,22H-30Z" fill="${fg}"/><rect x="-4" y="22" width="8" height="12" fill="${fg}"/>`;
    case 'mountain': // Zwei Bergspitzen (Yamagata)
      return `<path d="M-34,22L-12,-14L0,4L14,-24L36,22Z" fill="none" stroke="${fg}" stroke-width="7" stroke-linejoin="miter"/><path d="M-6,22L14,-6L28,22Z" fill="${fg}"/>`;
    case 'square': // Eisenquadrat mit Kreuz
      return `<rect x="-24" y="-24" width="48" height="48" fill="none" stroke="${fg}" stroke-width="7" transform="rotate(45)"/><path d="M-12,0H12M0,-12V12" stroke="${fg}" stroke-width="7"/>`;
  }
}

/** Mon als SVG-Gruppe (für Einbettung in die Karte), zentriert auf (0,0), Durchmesser ≈ 100. */
export function monGroup(clan: ClanId, opts: { inverse?: boolean } = {}): string {
  const c = CLANS[clan];
  const fg = opts.inverse ? c.color : c.accent;
  const bg = opts.inverse ? c.accent : c.color;
  return `<circle r="48" fill="${bg}"/><circle r="44" fill="none" stroke="${fg}" stroke-width="3"/>${shapeBody(c.mon, fg, bg)}`;
}

/** Eigenständiges SVG-Element (für HTML-Panels). */
export function monSvg(clan: ClanId, size = 32, opts: { inverse?: boolean } = {}): string {
  return `<svg class="mon" width="${size}" height="${size}" viewBox="-50 -50 100 100" aria-label="Wappen ${CLANS[clan].name}">${monGroup(clan, opts)}</svg>`;
}
