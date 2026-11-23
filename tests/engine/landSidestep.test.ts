import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine';
import { index } from '../../src/engine/map';
import { addUnit, makeGame } from '../helpers';

// A one-square-wide strip of land with the nearest unexplored ground at the north end, behind a full stack,
// and more of it at the south end.
const STRIP = ['*....', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '....*'];

describe('a land explorer blocked by a full friendly stack', () => {
  it('heads for another frontier instead of waiting behind it', () => {
    const s = makeGame(STRIP);
    s.rules.stacking = true;
    s.fog[0].explored.fill(1);
    s.fog[0].explored[index(s, 1, 0)] = 0;
    s.fog[0].explored[index(s, 3, 7)] = 0;
    for (let i = 0; i < 4; i++) addUnit(s, 'army', 0, 2, 2, { orders: { kind: 'sentry' } });
    const tank = addUnit(s, 'armor', 0, 2, 3);
    const r = apply(s, { type: 'setOrders', player: 0, unitId: tank.id, orders: { kind: 'explore' } });
    expect(r.ok).toBe(true);
    const after = r.ok ? r.state.units.find((u) => u.id === tank.id)! : tank;
    expect(after.y).toBeGreaterThan(3);
  });
});
