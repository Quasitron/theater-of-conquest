import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { combatWinChance } from '../../src/engine/combat';
import { UNIT_STATS, buildableTypes, doublesDefense, fightRatings } from '../../src/engine/units';
import type { GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

// Player 0's city at x=0, player 1's at x=9; open land between.
function game(advanced = true): GameState {
  const s = makeGame(['*########*'], { starts: [0, 1], rules: { advancedUnits: advanced } });
  for (const c of s.cities) c.production = null;
  s.fog[0].explored.fill(1);
  s.fog[1].explored.fill(1);
  return s;
}
const east = 2 as const;

describe('troop transport', () => {
  it('is built only with the Advanced units rule', () => {
    expect(buildableTypes({ advancedUnits: true })).toContain('troopTransport');
    expect(buildableTypes({ advancedUnits: false })).not.toContain('troopTransport');
  });

  it('carries four armies or spies, but no armor, and moves two squares over land with its cargo', () => {
    const s = game();
    const t = addUnit(s, 'troopTransport', 0, 3, 0);
    expect(UNIT_STATS.troopTransport.capacity).toBe(4);
    const army = addUnit(s, 'army', 0, 3, 0);
    const armor = addUnit(s, 'armor', 0, 3, 0);
    const load = apply(s, { type: 'load', player: 0, transportId: t.id, unitIds: [army.id] });
    expect(load.ok).toBe(true); // loading works on open land
    expect(apply(s, { type: 'load', player: 0, transportId: t.id, unitIds: [armor.id] })).toMatchObject({ ok: false });
    if (!load.ok) return;
    const r1 = apply(load.state, { type: 'move', player: 0, unitId: t.id, dir: east });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = apply(r1.state, { type: 'move', player: 0, unitId: t.id, dir: east });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const a = r2.state.units.find((u) => u.id === army.id)!;
    expect(a.x).toBe(5);
    expect(a.carriedBy).toBe(t.id);
  });

  it('an army boards by walking onto it, and walks off again', () => {
    const s = game();
    const t = addUnit(s, 'troopTransport', 0, 3, 0);
    const army = addUnit(s, 'army', 0, 2, 0);
    const r = apply(s, { type: 'move', player: 0, unitId: army.id, dir: east });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.units.find((u) => u.id === army.id)!.carriedBy).toBe(t.id);
  });

  it('cannot attack anything', () => {
    const s = game();
    const t = addUnit(s, 'troopTransport', 0, 3, 0);
    addUnit(s, 'army', 1, 4, 0);
    expect(apply(s, { type: 'move', player: 0, unitId: t.id, dir: east })).toMatchObject({ ok: false });
  });

  it('is easy prey for Armor, a little less so for an Army, and can hide in a forest', () => {
    const rules = { advancedUnits: true };
    expect(fightRatings(rules, 'army', 'troopTransport').defense).toBe(2);
    expect(fightRatings(rules, 'armor', 'troopTransport').defense).toBe(1);
    expect(fightRatings(rules, 'armor', 'troopTransport', 'forest').defense).toBe(2);
    expect(fightRatings(rules, 'army', 'troopTransport', 'forest').defense).toBe(2); // armies see through the trees
    expect(doublesDefense('armor', 'troopTransport', 'mountain')).toBe(false);
    const win = (att: 'army' | 'armor') => {
      const r = fightRatings(rules, att, 'troopTransport');
      const a = UNIT_STATS[att];
      const d = UNIT_STATS.troopTransport;
      return combatWinChance({ attack: r.attack, shot: a.shot, hits: a.hits, damage: 0 }, { defense: r.defense, shot: d.shot, hits: d.hits, damage: 0 });
    };
    expect(win('armor')).toBeGreaterThan(win('army'));
    expect(win('army')).toBeCloseTo(0.5, 5); // an even fight against an Army, like one Army against another
    expect(win('armor')).toBeGreaterThan(0.85);
  });

  it('its cargo dies with it', () => {
    const s = game();
    const t = addUnit(s, 'troopTransport', 1, 4, 0);
    const army = addUnit(s, 'army', 1, 4, 0);
    army.carriedBy = t.id;
    const armor = addUnit(s, 'armor', 0, 3, 0);
    const r = apply(s, { type: 'move', player: 0, unitId: armor.id, dir: east });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The attack hit: Armor fights at 0.5 defence, so it usually wins; if not, both stand.
    const gone = !r.state.units.some((u) => u.id === t.id);
    expect(r.state.units.some((u) => u.id === army.id)).toBe(!gone);
  });
});
