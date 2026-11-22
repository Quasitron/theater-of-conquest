import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine';
import { addUnit, makeGame } from '../helpers';

const LAND = ['*#####*', '#######', '#######'];

describe('an aircraft on its last move', () => {
  it('steps to a free square beside the occupied one on its way instead of staying stuck', () => {
    const s = makeGame(LAND);
    s.fog[0].explored.fill(1);
    addUnit(s, 'army', 0, 3, 0); // the fighter shares this square
    addUnit(s, 'army', 0, 2, 0); // and the next square on the way home is taken too
    const f = addUnit(s, 'fighter', 0, 3, 0, { movesLeft: 1, fuel: 12 });
    const r = apply(s, { type: 'setOrders', player: 0, unitId: f.id, orders: { kind: 'goto', target: { x: 0, y: 0 } } });
    expect(r.ok).toBe(true);
    const after = r.ok ? r.state.units.find((u) => u.id === f.id)! : f;
    expect(after.x === 3 && after.y === 0).toBe(false);
    // it ended on a square it has to itself
    const sharing = r.ok ? r.state.units.filter((u) => u.carriedBy === null && u.x === after.x && u.y === after.y) : [];
    expect(sharing.length).toBe(1);
    expect(after.orders?.kind).toBe('goto');
  });
});
