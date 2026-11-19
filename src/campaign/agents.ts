// Agenten – im Prototyp nur Datenmodell + Platzhalter.
import type { AgentKind, ClanId, GameState, ProvinceId } from '../data/types';
import { fail, type ActionResult } from './state';

export interface AgentTypeDef {
  kind: AgentKind;
  name: string;
  kanji: string;
  cost: number;
  description: string;
  /** Geplante Aktionen (noch nicht umgesetzt). */
  actions: string[];
}

export const AGENT_TYPES: Record<AgentKind, AgentTypeDef> = {
  ninja: {
    kind: 'ninja',
    name: 'Ninja',
    kanji: '忍',
    cost: 300,
    description: 'Lautlose Klinge in der Nacht. Kann feindliche Generäle ermorden.',
    actions: ['Attentat auf einen General', 'Sabotage einer Burg'],
  },
  shinobi: {
    kind: 'shinobi',
    name: 'Shinobi',
    kanji: '間',
    cost: 200,
    description: 'Späher und Kundschafter. Enthüllt Armeen und Garnisonen.',
    actions: ['Provinz ausspähen', 'Feindliche Agenten enttarnen'],
  },
};

export function recruitAgent(state: GameState, _clan: ClanId, _pid: ProvinceId, kind: AgentKind): ActionResult {
  return fail(state, `${AGENT_TYPES[kind].name} sind im Prototyp noch nicht einsetzbar.`);
}
