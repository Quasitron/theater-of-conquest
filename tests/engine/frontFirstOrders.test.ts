import { describe, it, expect } from 'vitest';
import type { GameEvent } from '../../src/engine';
import { runPlayerOrders } from '../../src/engine/orders';
import { addUnit, fixedRng, makeGame } from '../helpers';

describe('start-of-turn orders', () => {
  it('run for the units nearest a known enemy city first', () => {
    const s = makeGame(['*###*###', '########']); // player 1 holds the city at x=4
    s.fog[0].explored.fill(1);
    const back = addUnit(s, 'army', 0, 1, 1, { orders: { kind: 'goto', target: { x: 3, y: 1 } } });
    const front = addUnit(s, 'army', 0, 3, 1, { orders: { kind: 'goto', target: { x: 3, y: 0 } } });
    expect(back.id).toBeLessThan(front.id);
    const events: GameEvent[] = [];
    runPlayerOrders(s, fixedRng(0.5), 0, events);
    const moved = events.filter((e) => e.type === 'unitMoved').map((e) => (e as { unitId: number }).unitId);
    expect(moved[0]).toBe(front.id);
    expect(moved).toContain(back.id);
  });
});
