import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/engine';
import type { LogEntry } from '../../src/app/session';
import { SKIP_OPENING_KEY, getSkipOpening, resetSkipOpening, setSkipOpening, turnWasQuiet } from '../../src/ui/fastForward';

const entry = (turn: number, event: GameEvent): LogEntry => ({ turn, event });
const start = (turn: number, player = 0) => entry(turn, { type: 'turnStarted', player, turn });
const mine = new Set([1, 2]);
const allies = new Set([7]);
const quiet = (entries: LogEntry[]) => turnWasQuiet(entries, 0, mine, allies);

describe('turnWasQuiet', () => {
  it('a turn with nothing in it is quiet', () => {
    expect(quiet([start(1), start(2)])).toBe(true);
    expect(quiet([])).toBe(true);
  });

  it('my own and my teammates\' moves are quiet', () => {
    expect(quiet([start(1), entry(1, { type: 'unitMoved', unitId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }), entry(1, { type: 'unitMoved', unitId: 7, from: { x: 5, y: 5 }, to: { x: 6, y: 5 } }), start(2)])).toBe(true);
  });

  it('an enemy unit moving in sight is not quiet', () => {
    expect(quiet([start(1), entry(1, { type: 'unitMoved', unitId: 99, from: { x: 5, y: 5 }, to: { x: 6, y: 5 } }), start(2)])).toBe(false);
  });

  it('a unit produced, mine or a teammate\'s, is not quiet', () => {
    expect(quiet([start(1), entry(2, { type: 'unitProduced', unitId: 3, cityId: 0, unitType: 'army' }), start(2)])).toBe(false);
    expect(quiet([start(1), entry(2, { type: 'unitProduced', unitId: 8, cityId: 5, unitType: 'armor' }), start(2)])).toBe(false);
  });

  it('a fight or orders ending are not quiet', () => {
    expect(quiet([start(1), entry(1, { type: 'ordersEnded', unitId: 1, owner: 0, reason: 'enemySighted' }), start(2)])).toBe(false);
  });

  it('only looks since my previous turn started (older events do not count)', () => {
    const old = entry(1, { type: 'unitProduced', unitId: 3, cityId: 0, unitType: 'army' });
    expect(quiet([old, start(2), start(3)])).toBe(true);
    expect(quiet([start(1), old, start(2), start(3)])).toBe(true);
    expect(quiet([start(1), start(2), old, start(3)])).toBe(false);
  });

  it('other players\' turn starts are ignored when finding my previous turn', () => {
    // Player 1's turn starts sit between mine; the span still opens at my previous start.
    expect(quiet([start(1, 0), start(1, 1), start(2, 0)])).toBe(true);
  });
});

describe('opening skip preference', () => {
  beforeEach(() => {
    resetSkipOpening();
    globalThis.localStorage?.removeItem(SKIP_OPENING_KEY);
  });

  it('is on by default and a change lasts', () => {
    expect(getSkipOpening()).toBe(true);
    setSkipOpening(false);
    expect(getSkipOpening()).toBe(false);
    setSkipOpening(true);
    expect(getSkipOpening()).toBe(true);
  });
});
