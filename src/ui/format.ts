import { BUILDINGS, CLANS, TERRAIN, UNIT_TYPES } from '../data';
import type { Unit } from '../data/types';

export const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, 5 - n)) + '</span>';

export const koku = (n: number) => `${Math.round(n).toLocaleString('de-DE')} <span class="koku">石</span>`;

export const roleName: Record<string, string> = { spear: 'Speer', cavalry: 'Reiterei', ranged: 'Fernkampf', sword: 'Schwert' };

export function unitTooltip(type: string): string {
  const u = UNIT_TYPES[type];
  return `${u.name} (${roleName[u.role]}) – ${u.description}\nAngriff ${u.attack} · Verteidigung ${u.defense}${u.ranged ? ` · Fernkampf ${u.ranged}` : ''} · Ansturm ${u.charge} · Moral ${u.morale}\n${u.men} Mann · Kosten ${u.cost} · Unterhalt ${u.upkeep}/Runde`;
}

/** Erfahrung als Winkel (Veteranenabzeichen). */
export const chevrons = (exp: number) => (exp > 0 ? `<span class="exp" title="Erfahrung ${exp}">${'›'.repeat(Math.min(exp, 5))}${exp > 5 ? '+' : ''}</span>` : '');

export function unitRow(u: Unit, opts: { key?: string; checked?: boolean } = {}): string {
  const def = UNIT_TYPES[u.type];
  const pct = Math.round((u.men / def.men) * 100);
  const box = opts.key ? `<input type="checkbox" data-check="${opts.key}" ${opts.checked ? 'checked' : ''}>` : '';
  return `<label class="unit role-${def.role}" title="${esc(unitTooltip(u.type))}">${box}
    <span class="uicon">${roleGlyph(def.role)}</span>
    <span class="uname">${esc(def.name)} ${chevrons(u.experience)}</span>
    <span class="ubar"><span style="width:${pct}%"></span></span>
    <span class="umen">${u.men}</span></label>`;
}

export const roleGlyph = (role: string) => ({ spear: '槍', cavalry: '騎', ranged: '弓', sword: '刀' })[role] ?? '兵';

export const terrainName = (t: string) => TERRAIN[t as keyof typeof TERRAIN].name;
export const clanColor = (c: string) => CLANS[c].color;
export const buildingLevelName = (b: string, lvl: number) => (lvl > 0 ? BUILDINGS[b].levels[lvl - 1].name : '–');
