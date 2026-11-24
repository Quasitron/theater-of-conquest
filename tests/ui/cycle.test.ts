import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../src/app/session';
import { builtThisTurn, nextReadyAfter, readyUnits, reportQueue, threatOf } from '../../src/ui/cycle';
import { addUnit, makeGame } from '../helpers';

const M = ['*##', '###', '##*'];

describe('readyUnits', () => {
  it('offers only units with moves left, no orders and not held', () => {
    const s = makeGame(M);
    const ready = addUnit(s, 'army', 0, 0, 1);
    const sleeping = addUnit(s, 'army', 0, 1, 1, { orders: { kind: 'sentry' } });
    const spent = addUnit(s, 'army', 0, 1, 0, { movesLeft: 0 });
    const held = addUnit(s, 'army', 0, 2, 1);
    const ids = readyUnits(s.units, new Set(), new Set([held.id]), []).map((u) => u.id);
    expect(ids).toEqual([ready.id]);
    expect(ids).not.toContain(sleeping.id);
    expect(ids).not.toContain(spent.id);
  });

  it('puts new units first, then the rest, both in ascending id order', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 1);
    const b = addUnit(s, 'army', 0, 1, 1);
    const c = addUnit(s, 'army', 0, 1, 0);
    const d = addUnit(s, 'army', 0, 2, 1);
    const ids = readyUnits(s.units, new Set([d.id, b.id]), new Set(), []).map((u) => u.id);
    expect(ids).toEqual([b.id, d.id, a.id, c.id]);
  });

  it('moves skipped units to the end in skipped order', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 1);
    const b = addUnit(s, 'army', 0, 1, 1);
    const c = addUnit(s, 'army', 0, 1, 0);
    const d = addUnit(s, 'army', 0, 2, 1);
    const ids = readyUnits(s.units, new Set([b.id]), new Set(), [d.id, b.id, a.id]).map((u) => u.id);
    expect(ids).toEqual([c.id, d.id, b.id, a.id]);
  });

  it('offers the units nearest the enemy first when it knows where they are', () => {
    const s = makeGame(['*######', '#######', '######*']);
    const back = addUnit(s, 'army', 0, 1, 1);
    const front = addUnit(s, 'army', 0, 5, 1);
    const middle = addUnit(s, 'army', 0, 3, 1);
    const threat = { points: [{ x: 7, y: 1 }], width: 7, wrap: false };
    expect(readyUnits(s.units, new Set(), new Set(), [], threat).map((u) => u.id)).toEqual([front.id, middle.id, back.id]);
    expect(readyUnits(s.units, new Set(), new Set(), []).map((u) => u.id)).toEqual([back.id, front.id, middle.id]);
  });

  it('builds the threat from known enemy units and enemy or neutral cities, not own or allied ones', () => {
    const t = threatOf({
      me: 0, width: 9, wrap: false, allies: [2],
      enemies: [{ markerId: 1, type: 'army', owner: 1, x: 4, y: 1, turnSeen: 1, visibleNow: true }],
      knownCities: [
        { id: 1, name: 'A', x: 0, y: 0, owner: 0, damage: 0 },
        { id: 2, name: 'B', x: 1, y: 0, owner: 2, damage: 0 },
        { id: 3, name: 'C', x: 2, y: 0, owner: 1, damage: 0 },
        { id: 4, name: 'D', x: 3, y: 0, owner: null, damage: 0 },
      ],
    });
    expect(t.points).toEqual([{ x: 4, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  it('ignores skipped ids that are not ready', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 1);
    const ids = readyUnits(s.units, new Set(), new Set(), [999, a.id]).map((u) => u.id);
    expect(ids).toEqual([a.id]);
  });
});

describe('builtThisTurn', () => {
  it('collects the units produced on the given turn only', () => {
    const entries: LogEntry[] = [
      { turn: 3, event: { type: 'unitProduced', unitId: 7, cityId: 0, unitType: 'army' } },
      { turn: 3, event: { type: 'turnStarted', player: 0, turn: 3 } },
      { turn: 2, event: { type: 'unitProduced', unitId: 5, cityId: 0, unitType: 'army' } },
      { turn: 3, event: { type: 'unitProduced', unitId: 9, cityId: 1, unitType: 'fighter' } },
    ];
    expect([...builtThisTurn(entries, 3)].sort((a, b) => a - b)).toEqual([7, 9]);
    expect(builtThisTurn(entries, 4).size).toBe(0);
  });
});

describe('nextReadyAfter', () => {
  const mk = (...ids: number[]) => {
    const s = makeGame(M);
    return ids.map((id) => addUnit(s, 'army', 0, 0, 1, { id }));
  };

  it('gives the next unit, wrapping at the end', () => {
    const r = mk(3, 5, 8);
    expect(nextReadyAfter(r, 3)?.id).toBe(5);
    expect(nextReadyAfter(r, 8)?.id).toBe(3);
  });

  it('gives the unit itself when it is the only one ready', () => {
    expect(nextReadyAfter(mk(4), 4)?.id).toBe(4);
  });

  it('for an id that is not ready, gives the first greater id, else the first', () => {
    const r = mk(3, 5, 8);
    expect(nextReadyAfter(r, 4)?.id).toBe(5);
    expect(nextReadyAfter(r, 9)?.id).toBe(3);
  });

  it('starts at the first unit for null and gives null for an empty list', () => {
    expect(nextReadyAfter(mk(3, 5), null)?.id).toBe(3);
    expect(nextReadyAfter([], 3)).toBeNull();
    expect(nextReadyAfter([], null)).toBeNull();
  });

  it('with a hint, gives the closest unit, leaving skipped ones until last', () => {
    const s = makeGame(['*#########*']);
    const far = addUnit(s, 'army', 0, 9, 0, { id: 2 });
    const near = addUnit(s, 'army', 0, 2, 0, { id: 7 });
    const skipped = addUnit(s, 'army', 0, 1, 0, { id: 9 });
    const hint = { from: { x: 0, y: 0 }, width: 11, wrap: false, skipped: [9] };
    expect(nextReadyAfter([far, near, skipped], 5, hint)?.id).toBe(7);
    expect(nextReadyAfter([far, skipped], 5, hint)?.id).toBe(2);
    expect(nextReadyAfter([skipped], 5, hint)?.id).toBe(9);
    expect(nextReadyAfter([far, near], 5, { ...hint, wrap: true, from: { x: 10, y: 0 } })?.id).toBe(2);
  });
});

describe('reportQueue', () => {
  const produced = (turn: number, unitId: number, cityId: number): LogEntry => (
    { turn, event: { type: 'unitProduced', unitId, cityId, unitType: 'army' } }
  );

  it('lists this turn\'s productions for my cities, by city then unit', () => {
    const s = makeGame(['*#*#', '####']);
    const entries: LogEntry[] = [produced(5, 30, 1), produced(5, 12, 0), produced(5, 11, 1)];
    const q = reportQueue(entries, 5, 0, s.cities.map((c) => ({ ...c, owner: 0 })));
    expect(q.map((r) => [r.cityId, r.unitId])).toEqual([[0, 12], [1, 11], [1, 30]]);
    expect(q[0].unitType).toBe('army');
  });

  it('leaves out other turns and cities the viewer does not own', () => {
    const s = makeGame(['*#*#', '####']);
    const cities = s.cities.map((c, i) => ({ ...c, owner: i === 0 ? 0 : 1 }));
    const entries: LogEntry[] = [produced(4, 7, 0), produced(5, 8, 0), produced(5, 9, 1)];
    expect(reportQueue(entries, 5, 0, cities).map((r) => r.unitId)).toEqual([8]);
    expect(reportQueue(entries, 5, 1, cities).map((r) => r.unitId)).toEqual([9]);
  });
});