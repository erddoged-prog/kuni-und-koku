import type { BuildingId, BuildingType } from './types';

export const BUILDINGS: Record<BuildingId, BuildingType> = {
  castle: {
    id: 'castle',
    name: 'Burg',
    description: 'Schützt die Provinz. Feinde müssen sie aushungern oder stürmen.',
    levels: [
      { name: 'Palisade (Toride)', cost: 400, buildTime: 2, siegeDefense: 0.3, supplyTurns: 2 },
      { name: 'Bergburg (Yamashiro)', cost: 900, buildTime: 3, siegeDefense: 0.6, supplyTurns: 4 },
      { name: 'Hauptburg (Tenshu)', cost: 1800, buildTime: 4, siegeDefense: 1.0, supplyTurns: 6 },
    ],
  },
  farm: {
    id: 'farm',
    name: 'Reisfelder',
    description: 'Bewässerte Felder steigern den Koku-Ertrag.',
    levels: [
      { name: 'Reisfelder', cost: 300, buildTime: 1, kokuBonus: 0.2 },
      { name: 'Terrassenfelder', cost: 600, buildTime: 2, kokuBonus: 0.4 },
      { name: 'Kanalsystem', cost: 1100, buildTime: 3, kokuBonus: 0.65 },
    ],
  },
  barracks: {
    id: 'barracks',
    name: 'Kaserne',
    description: 'Bildet Ashigaru aus. Ausbaustufe 2 erlaubt Arkebusiere.',
    levels: [
      { name: 'Kaserne', cost: 250, buildTime: 1 },
      { name: 'Büchsenhaus', cost: 700, buildTime: 2, requires: [{ building: 'castle', level: 1 }] },
    ],
  },
  spear_dojo: {
    id: 'spear_dojo',
    name: 'Speerschule',
    description: 'Schaltet Samurai-Speere frei.',
    levels: [{ name: 'Speerschule', cost: 450, buildTime: 2, requires: [{ building: 'barracks', level: 1 }] }],
  },
  bow_dojo: {
    id: 'bow_dojo',
    name: 'Bogenschule',
    description: 'Schaltet Bogenschützen frei.',
    levels: [{ name: 'Bogenschule', cost: 400, buildTime: 2, requires: [{ building: 'barracks', level: 1 }] }],
  },
  stables: {
    id: 'stables',
    name: 'Stall',
    description: 'Schaltet Reiterei frei.',
    levels: [{ name: 'Stall', cost: 550, buildTime: 2, requires: [{ building: 'castle', level: 1 }] }],
  },
  sword_dojo: {
    id: 'sword_dojo',
    name: 'Dojo',
    description: 'Schwertschule: schaltet Schwertkämpfer frei, neue Einheiten erhalten Erfahrung.',
    levels: [
      { name: 'Dojo', cost: 650, buildTime: 3, recruitExperience: 1, requires: [{ building: 'castle', level: 2 }] },
      { name: 'Großes Dojo', cost: 1200, buildTime: 3, recruitExperience: 2, requires: [{ building: 'castle', level: 2 }] },
    ],
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);
