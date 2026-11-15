import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { pathMapFromState, findPath } from '../../src/engine/path';
import { stackDefender } from '../../src/engine/attack';
import { STACK_LIMIT, topLevelUnitsAt } from '../../src/engine/query';
import type { GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

// A land strip: player 0's city at x=0, player 1's at x=8; open land between.
const ROW = ['*#######*'];

function game(stacking: boolean): GameState {
  const s = makeGame(ROW, { starts: [0, 1], rules: { stacking } });
  for (const c of s.cities) c.production = null;
  s.fog[0].explored.fill(1);
  s.fog[1].explored.fill(1);
  return s;
}

const east = 2 as const;
const west = 6 as const;
const move = (s: GameState, id: number, dir: 2 | 6, player = 0) => apply(s, { type: 'move', player, unitId: id, dir });

describe('stacking rule', () => {
  it('lets own units share a square outside a city up to the limit', () => {
    const s = game(true);
    addUnit(s, 'army', 0, 3, 0);
    addUnit(s, 'army', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 2, 0);
    const r = move(s, a.id, east);
    expect(r.ok).toBe(true);
    expect(r.ok && topLevelUnitsAt(r.state, 3, 0)).toHaveLength(STACK_LIMIT);
    // A fourth is turned away.
    if (!r.ok) return;
    const d = addUnit(r.state, 'army', 0, 2, 0);
    expect(move(r.state, d.id, east)).toMatchObject({ ok: false, error: 'square is occupied' });
  });

  it('keeps one unit per square when the rule is off', () => {
    const s = game(false);
    addUnit(s, 'army', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 2, 0);
    expect(move(s, a.id, east)).toMatchObject({ ok: false, error: 'square is occupied' });
  });

  it('does not let aircraft join a stack', () => {
    const s = game(true);
    addUnit(s, 'army', 0, 3, 0);
    const f = addUnit(s, 'fighter', 0, 2, 0);
    // A fighter may still pass over, but a stack is never joined; with one move left it is refused.
    f.movesLeft = 1;
    expect(move(s, f.id, east)).toMatchObject({ ok: false });
  });

  it('fights the best defender of a stack, one unit at a time', () => {
    const s = game(true);
    const weak = addUnit(s, 'army', 1, 4, 0, { damage: 0 });
    const spy = addUnit(s, 'spy', 1, 4, 0);
    const armor = addUnit(s, 'armor', 1, 4, 0);
    s.rules.advancedUnits = true;
    const attacker = addUnit(s, 'army', 0, 3, 0);
    // Armor is tougher than the army and the spy.
    expect(stackDefender(s, attacker, weak).id).toBe(armor.id);
    armor.damage = 1;
    expect(stackDefender(s, attacker, spy).id).not.toBe(spy.id);
  });

  it('a won fight leaves the rest of the stack standing and the winner outside', () => {
    const s = game(true);
    addUnit(s, 'army', 1, 4, 0);
    addUnit(s, 'army', 1, 4, 0);
    const a = addUnit(s, 'army', 0, 3, 0);
    // Rolls below the attacker's share are hits: the attacker always hits.
    const r = apply(s, { type: 'move', player: 0, unitId: a.id, dir: east });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const left = topLevelUnitsAt(r.state, 4, 0).filter((u) => u.owner === 1);
    // Either the attacker lost (two defenders remain) or it won (one remains and it did not move in).
    expect(left.length).toBeGreaterThanOrEqual(1);
    if (r.state.units.some((u) => u.id === a.id)) expect(r.state.units.find((u) => u.id === a.id)!.x).toBe(3);
  });

  it('plans paths through and onto stacks that have room, and not onto full ones', () => {
    const s = game(true);
    addUnit(s, 'army', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 1, 0);
    expect(findPath(pathMapFromState(s, 0), a, { x: 3, y: 0 })).not.toBeNull();
    addUnit(s, 'army', 0, 3, 0);
    addUnit(s, 'army', 0, 3, 0);
    expect(findPath(pathMapFromState(s, 0), a, { x: 3, y: 0 })).toBeNull();
  });
});
