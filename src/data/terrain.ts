import type { Terrain, TerrainDef } from './types';

export const TERRAIN: Record<Terrain, TerrainDef> = {
  plains: {
    id: 'plains',
    name: 'Ebene',
    defenderDefense: 1.0,
    rangedMod: 1.0,
    cavalryChargeMod: 1.15,
    attackerMeleeMod: 1.0,
    flankMod: 1.2,
    description: 'Offenes Feld – ideal für Reiterei und Flankenmanöver.',
  },
  hills: {
    id: 'hills',
    name: 'Hügel',
    defenderDefense: 1.08,
    rangedMod: 1.1,
    cavalryChargeMod: 0.8,
    attackerMeleeMod: 0.97,
    flankMod: 0.9,
    description: 'Der Verteidiger hält die Höhe; Schützen sehen weit.',
  },
  forest: {
    id: 'forest',
    name: 'Wald',
    defenderDefense: 1.05,
    rangedMod: 0.65,
    cavalryChargeMod: 0.55,
    attackerMeleeMod: 1.0,
    flankMod: 1.3,
    description: 'Dichtes Unterholz: Pfeile verfangen sich, Pferde stolpern, Hinterhalte gelingen.',
  },
  river: {
    id: 'river',
    name: 'Fluss',
    defenderDefense: 1.04,
    rangedMod: 1.15,
    cavalryChargeMod: 0.75,
    attackerMeleeMod: 0.9,
    flankMod: 0.7,
    description: 'Der Angreifer muss die Furt queren und wird dabei beschossen.',
  },
};
