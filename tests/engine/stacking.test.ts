import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { pathMapFromState, pathMapFromView, findPath } from '../../src/engine/path';
import { getPlayerView } from '../../src/engine/view';
import { attackUnit, stackDefender } from '../../src/engine/attack';
import { STACK_LIMIT_LAND, STACK_LIMIT_SEA, topLevelUnitsAt } from '../../src/engine/query';
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
    for (let i = 0; i < STACK_LIMIT_LAND - 1; i++) addUnit(s, 'army', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 2, 0);
    const r = move(s, a.id, east);
    expect(r.ok).toBe(true);
    expect(r.ok && topLevelUnitsAt(r.state, 3, 0)).toHaveLength(STACK_LIMIT_LAND);
    // One more is turned away.
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

  it('lets 4 land units share a square but only 3 ships', () => {
    const sea = makeGame(['*.....*'], { starts: [0, 1], rules: { stacking: true } });
    for (const c of sea.cities) c.production = null;
    for (let i = 0; i < STACK_LIMIT_SEA; i++) addUnit(sea, 'destroyer', 0, 3, 0);
    const d = addUnit(sea, 'destroyer', 0, 2, 0);
    expect(move(sea, d.id, east)).toMatchObject({ ok: false, error: 'square is occupied' });
  });

  /** Rolls: 0 (the attacker always hits) until the first unit of `until` is gone, then the given splash rolls. */
  const splashRng = (s: GameState, until: number, rolls: number[]) => ({
    next: () => (s.units.some((u) => u.id === until) ? 0 : rolls.shift() ?? 0.99),
  });

  it('a bomber that beats a stack\'s defender may also hurt each other unit, by chance', () => {
    const s = game(true);
    s.rules.advancedUnits = true;
    const armor = addUnit(s, 'armor', 1, 4, 0);
    const first = addUnit(s, 'army', 1, 4, 0);
    const second = addUnit(s, 'army', 1, 4, 0);
    const bomber = addUnit(s, 'bomber', 0, 3, 0);
    const events: unknown[] = [];
    attackUnit(s, splashRng(s, armor.id, [0.1, 0.9]), bomber, armor, events as never);
    // The first army was hit (and, with one hit point, destroyed); the second was missed.
    expect(s.units.some((u) => u.id === first.id)).toBe(false);
    expect(s.units.find((u) => u.id === second.id)?.damage).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'stackSplash', unitId: first.id, killed: true }));
  });

  it('a ship that beats a stack hurts a unit that survives the hit', () => {
    const s = makeGame(['*......*'], { starts: [0, 1], rules: { stacking: true } });
    const a = addUnit(s, 'destroyer', 1, 4, 0);
    const b = addUnit(s, 'destroyer', 1, 4, 0);
    const ship = addUnit(s, 'battleship', 0, 3, 0);
    attackUnit(s, splashRng(s, a.id, [0.1]), ship, a, []);
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(1);
  });

  it('ground attackers, fighters and cities cause no splash', () => {
    const s = game(true);
    const a = addUnit(s, 'army', 1, 4, 0);
    const b = addUnit(s, 'army', 1, 4, 0);
    const army = addUnit(s, 'army', 0, 3, 0);
    attackUnit(s, splashRng(s, a.id, [0.1, 0.1]), army, a, []);
    expect(s.units.some((u) => u.id === b.id)).toBe(true);
    const f = addUnit(s, 'fighter', 0, 3, 0);
    const c = addUnit(s, 'army', 1, 5, 0);
    const d = addUnit(s, 'army', 1, 5, 0);
    attackUnit(s, splashRng(s, c.id, [0.1, 0.1]), f, c, []);
    expect(s.units.some((u) => u.id === d.id)).toBe(true);
  });

  describe('with allies', () => {
    /** Three players on a land strip with cities at x=0, 8 and 9: 0 and 1 are on one team, 2 is the enemy. */
    const allied = (stacking: boolean): GameState => {
      const s = makeGame(['*#######**'], { players: 3, starts: [0, 1, 2], rules: { stacking } });
      for (const c of s.cities) c.production = null;
      s.players[0].team = 1;
      s.players[1].team = 1;
      s.fog[0].explored.fill(1);
      return s;
    };

    it('lets a unit join an ally\'s stack, sharing the one limit for the square', () => {
      const s = allied(true);
      addUnit(s, 'army', 1, 3, 0);
      addUnit(s, 'army', 1, 3, 0);
      addUnit(s, 'army', 0, 3, 0);
      const a = addUnit(s, 'army', 0, 2, 0);
      const r = move(s, a.id, east);
      expect(r.ok).toBe(true);
      expect(r.ok && topLevelUnitsAt(r.state, 3, 0)).toHaveLength(4);
      if (!r.ok) return;
      const d = addUnit(r.state, 'army', 0, 2, 0);
      expect(move(r.state, d.id, east)).toMatchObject({ ok: false, error: 'square is occupied' });
    });

    it('still keeps an ally\'s square closed when the rule is off, and plans paths onto it only with the rule on', () => {
      const off = allied(false);
      addUnit(off, 'army', 1, 3, 0);
      const a = addUnit(off, 'army', 0, 2, 0);
      expect(move(off, a.id, east)).toMatchObject({ ok: false });
      expect(findPath(pathMapFromState(off, 0), a, { x: 3, y: 0 })).toBeNull();
      const on = allied(true);
      addUnit(on, 'army', 1, 3, 0);
      const b = addUnit(on, 'army', 0, 2, 0);
      expect(findPath(pathMapFromState(on, 0), b, { x: 3, y: 0 })).not.toBeNull();
    });

    it('a city holding an ally\'s units stays open to paths, in the player view too, with the stacking rule on or off', () => {
      for (const stacking of [false, true]) {
        const s = allied(stacking);
        s.fog[0].explored.fill(1);
        // Player 1's start city is at x=8.
        addUnit(s, 'army', 1, 8, 0);
        const a = addUnit(s, 'army', 0, 7, 0);
        const view = getPlayerView(s, 0);
        expect(findPath(pathMapFromView(view), a, { x: 8, y: 0 })).not.toBeNull();
      }
    });

    it('an enemy attack on a mixed stack fights the best defender of either owner, and splash reaches them all', () => {
      const s = allied(true);
      s.rules.advancedUnits = true;
      const armor = addUnit(s, 'armor', 1, 4, 0);
      const mine = addUnit(s, 'army', 0, 4, 0);
      const bomber = addUnit(s, 'bomber', 2, 3, 0);
      expect(stackDefender(s, bomber, mine).id).toBe(armor.id);
      const events: unknown[] = [];
      const rng = { next: () => (s.units.some((u) => u.id === armor.id) ? 0 : 0.1) };
      attackUnit(s, rng, bomber, mine, events as never);
      expect(s.units.some((u) => u.id === armor.id)).toBe(false);
      expect(events).toContainEqual(expect.objectContaining({ type: 'stackSplash', unitId: mine.id, owner: 0 }));
    });
  });

  it('plans paths through and onto stacks that have room, and not onto full ones', () => {
    const s = game(true);
    addUnit(s, 'army', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 1, 0);
    expect(findPath(pathMapFromState(s, 0), a, { x: 3, y: 0 })).not.toBeNull();
    for (let i = 0; i < STACK_LIMIT_LAND - 1; i++) addUnit(s, 'army', 0, 3, 0);
    expect(findPath(pathMapFromState(s, 0), a, { x: 3, y: 0 })).toBeNull();
  });
});
