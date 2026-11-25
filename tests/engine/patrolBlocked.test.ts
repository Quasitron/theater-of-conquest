import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine';
import { updateFog } from '../../src/engine/fog';
import type { Pos } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const MAP = ['*#########', '##########', '##########', '#########*'];

function fly(enemies: Pos[]) {
  const s = makeGame(MAP);
  s.fog[0].explored.fill(1);
  const b = addUnit(s, 'bomber', 0, 0, 0);
  for (const p of enemies) {
    addUnit(s, 'army', 1, p.x, p.y);
    addUnit(s, 'army', 0, p.x - 1, p.y === 3 ? 2 : p.y + 1); // someone of ours to see it
  }
  updateFog(s, 0);
  const r = apply(s, {
    type: 'setOrders', player: 0, unitId: b.id,
    orders: { kind: 'patrol', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, toB: true, loop: [{ x: 4, y: 0 }, { x: 4, y: 3 }], leg: 0 },
  });
  if (!r.ok) throw new Error(r.error);
  return { unit: r.state.units.find((u) => u.id === b.id)!, ended: r.events.flatMap((e) => (e.type === 'ordersEnded' ? [e.reason] : [])) };
}

describe('a patrol with a blocked waypoint', () => {
  it('passes over it and flies on to the next one', () => {
    const { unit, ended } = fly([{ x: 4, y: 0 }]);
    expect(ended).toEqual([]);
    expect(unit.orders).toMatchObject({ kind: 'patrol', leg: 1 });
    expect(unit.x).toBeGreaterThan(0);
  });

  it('stops as blocked, not as low on fuel, when no waypoint can be reached', () => {
    const { unit, ended } = fly([{ x: 4, y: 0 }, { x: 4, y: 3 }]);
    expect(ended).toEqual(['blocked']);
    expect(unit.orders).toBeNull();
    expect(unit.lastPatrol).toBeDefined();
  });
});
