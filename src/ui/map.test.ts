import { describe, expect, it } from 'vitest';
import { PROVINCE_IDS } from '../data';
import { createInitialState, legalMoves } from '../campaign';
import { buildGeometry } from './geometry';
import { renderMap } from './map';

describe('Karten-Renderer', () => {
  const geo = buildGeometry();
  const s = createInitialState('akagane', 1);

  it('zeichnet jede Provinz und jede Armee', () => {
    const svg = renderMap(s, geo, { targets: [] });
    for (const id of PROVINCE_IDS) expect(svg).toContain(`data-pid="${id}"`);
    expect(svg.match(/data-army="/g)?.length).toBe(Object.keys(s.armies).length);
  });

  it('markiert Auswahl und Zugziele (freundlich/feindlich)', () => {
    const army = Object.values(s.armies).find((a) => a.owner === 'akagane')!;
    const svg = renderMap(s, geo, { selectedProvince: 'owari', selectedArmy: army.id, targets: legalMoves(s, army.id) });
    expect(svg).toContain('ring-selected');
    expect(svg).toContain('ring-target');
    expect(svg).toContain('ring-hostile');
  });
});
