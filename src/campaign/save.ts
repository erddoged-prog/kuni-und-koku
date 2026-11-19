// Spielstand als JSON (de)serialisieren. localStorage-Zugriff liegt im UI.
import { CLANS, PROVINCES, UNIT_TYPES } from '../data';
import type { GameState } from '../data/types';
import { SAVE_VERSION } from './setup';

export function serialize(state: GameState): string {
  return JSON.stringify({ format: 'kuni-koku-save', ...state });
}

/** Liest einen Spielstand und prüft ihn grob; wirft bei ungültigen Daten. */
export function deserialize(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Kein gültiges JSON.');
  }
  const o = raw as Record<string, unknown> & Partial<GameState>;
  if (!o || typeof o !== 'object' || o.format !== 'kuni-koku-save') throw new Error('Kein Spielstand von Kuni & Koku.');
  if (o.version !== SAVE_VERSION) throw new Error(`Spielstand-Version ${o.version} wird nicht unterstützt.`);
  if (typeof o.turn !== 'number' || !o.provinces || !o.clans || !o.armies) throw new Error('Spielstand unvollständig.');
  if (!CLANS[o.playerClan as string]) throw new Error('Unbekannter Spieler-Clan.');
  for (const [pid, p] of Object.entries(o.provinces)) {
    if (!PROVINCES[pid] || !CLANS[p.owner]) throw new Error(`Ungültige Provinz: ${pid}`);
    for (const u of p.garrison) if (!UNIT_TYPES[u.type]) throw new Error(`Ungültige Einheit: ${u.type}`);
  }
  for (const a of Object.values(o.armies)) {
    if (!PROVINCES[a.location] || !CLANS[a.owner]) throw new Error(`Ungültige Armee: ${a.id}`);
    for (const u of a.units) if (!UNIT_TYPES[u.type]) throw new Error(`Ungültige Einheit: ${u.type}`);
  }
  const { format: _f, ...state } = o;
  return state as GameState;
}
