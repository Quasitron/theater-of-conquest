import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine';
import { index } from '../../src/engine/map';
import type { GameState, Unit } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const LAND = ['*##########*', '############'];

function hunt(s: GameState, u: Unit) {
  const r = apply(s, { type: 'setOrders', player: u.owner, unitId: u.id, orders: { kind: 'hunt' } });
  if (!r.ok) throw new Error(r.error);
  return {
    unit: r.state.units.find((x) => x.id === u.id)!,
    ended: r.events.flatMap((e) => (e.type === 'ordersEnded' ? [e.reason] : [])),
  };
}

/** Marks an enemy as remembered at a square, as the fog does for one seen a turn ago. */
function remember(s: GameState, e: Unit) {
  s.fog[0].lastSeen[e.id] = { unitId: e.id, type: e.type, owner: e.owner, x: e.x, y: e.y, turnSeen: s.turn - 1 };
}

describe('the Hunt order', () => {
  it('marches on a known enemy city and stops beside it without attacking', () => {
    const s = makeGame(LAND);
    s.fog[0].explored.fill(1);
    const a = addUnit(s, 'armor', 0, 8, 1);
    const { unit, ended } = hunt(s, a);
    expect(Math.max(Math.abs(unit.x - 11), unit.y)).toBe(1);
    expect(ended).toEqual(['cityFound']);
    expect(unit.orders).toBeNull();
  });

  it('prefers a nearer remembered enemy to a farther city', () => {
    const s = makeGame(LAND);
    s.fog[0].explored.fill(1);
    const a = addUnit(s, 'army', 0, 5, 1);
    remember(s, addUnit(s, 'army', 1, 1, 1));
    const { unit } = hunt(s, a);
    expect(unit.x).toBeLessThan(5);
  });

  it('explores when no enemy or city is known', () => {
    const s = makeGame(LAND);
    s.fog[0].explored.fill(1);
    s.fog[0].explored[index(s, 11, 0)] = 0;
    s.fog[0].explored[index(s, 11, 1)] = 0;
    const a = addUnit(s, 'army', 0, 5, 1);
    const { unit } = hunt(s, a);
    expect(unit.x).toBe(6);
    expect(unit.orders?.kind).toBe('hunt');
  });

  it('says there is nothing to hunt on a fully known map with no quarry', () => {
    const s = makeGame(['*##########*', '############', '............']);
    s.fog[0].explored.fill(1);
    const ship = addUnit(s, 'destroyer', 0, 2, 2);
    expect(hunt(s, ship).ended).toEqual(['nothingToHunt']);
  });

  it('sends a warship after enemy ships, not cities', () => {
    const s = makeGame(['*##########*', '............']);
    s.fog[0].explored.fill(1);
    const ship = addUnit(s, 'destroyer', 0, 8, 1);
    remember(s, addUnit(s, 'destroyer', 1, 0, 1));
    expect(hunt(s, ship).unit.x).toBeLessThan(8);
  });

  it('is refused for aircraft and transports', () => {
    const s = makeGame(['*##########*', '............']);
    for (const u of [addUnit(s, 'fighter', 0, 2, 0), addUnit(s, 'transport', 0, 2, 1)]) {
      const r = apply(s, { type: 'setOrders', player: 0, unitId: u.id, orders: { kind: 'hunt' } });
      expect(r.ok).toBe(false);
    }
  });
});
