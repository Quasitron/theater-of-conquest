import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { airbasePickup } from '../../src/engine/ferry';
import { getPlayerView } from '../../src/engine/view';
import { UNIT_STATS, buildableTypes, fightRatings } from '../../src/engine/units';
import type { Command, GameEvent, GameState, Unit } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const east = 2 as const;

// Player 0's city at (0,1), player 1's far east; open land everywhere.
function game(stacking = false): GameState {
  const row = '#'.repeat(24);
  const s = makeGame([row, '*' + '#'.repeat(22) + '*', row, row], { starts: [0, 1], rules: { advancedUnits: true, stacking } });
  for (const c of s.cities) c.production = null;
  s.fog[0].explored.fill(1);
  s.fog[1].explored.fill(1);
  // A far-off enemy unit keeps the opponent in the game.
  addUnit(s, 'army', 1, 23, 3);
  return s;
}

function run(s: GameState, cmd: Command): { s: GameState; events: GameEvent[] } {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return { s: r.state, events: r.events };
}
const refused = (s: GameState, cmd: Command): string => {
  const r = apply(s, cmd);
  return r.ok ? 'accepted' : r.error;
};
const at = (s: GameState, u: Unit): Unit => s.units.find((x) => x.id === u.id)!;
/** Ends both players' turns, so player 0's standing orders run once. */
function round(s: GameState): GameState {
  return run(run(s, { type: 'endTurn', player: 0 }).s, { type: 'endTurn', player: 1 }).s;
}
/** An aircraft in flight, with fuel to spare. */
const flying = (s: GameState, x: number, y: number): Unit => addUnit(s, 'airCargo', 0, x, y);
const aboard = (s: GameState, plane: Unit, type: 'army' | 'armor' | 'spy' | 'troopTransport'): Unit =>
  addUnit(s, type, 0, plane.x, plane.y, { carriedBy: plane.id, orders: { kind: 'sentry' } });

describe('Air Transport', () => {
  it('is built only with the Advanced units rule, in 22 turns and then 18', () => {
    expect(buildableTypes({ advancedUnits: true })).toContain('airCargo');
    expect(buildableTypes({ advancedUnits: false })).not.toContain('airCargo');
    expect(UNIT_STATS.airCargo).toMatchObject({ move: 4, range: 16, hits: 1, attack: 0, capacity: 4, build: 22, buildRepeat: 18 });
  });

  it('defends like a Bomber and cannot attack', () => {
    const rules = { advancedUnits: true };
    for (const att of ['army', 'fighter', 'destroyer'] as const) {
      expect(fightRatings(rules, att, 'airCargo').defense).toBe(fightRatings(rules, att, 'bomber').defense);
    }
    const s = game();
    const p = flying(s, 3, 1);
    addUnit(s, 'army', 1, 4, 1);
    expect(refused(s, { type: 'move', player: 0, unitId: p.id, dir: east })).toMatch(/cannot attack/);
  });

  it('loads in a city with at most one vehicle', () => {
    const s = game();
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const a1 = addUnit(s, 'armor', 0, 0, 1);
    const a2 = addUnit(s, 'armor', 0, 0, 1);
    expect(refused(s, { type: 'load', player: 0, transportId: p.id, unitIds: [a1.id, a2.id] })).toMatch(/one vehicle/);
    const army = addUnit(s, 'army', 0, 0, 1);
    const r = run(s, { type: 'load', player: 0, transportId: p.id, unitIds: [a1.id, army.id] });
    expect(at(r.s, army).carriedBy).toBe(p.id);
    expect(refused(r.s, { type: 'load', player: 0, transportId: p.id, unitIds: [a2.id] })).not.toBe('accepted');
  });

  it('empties a loaded APC before taking it aboard', () => {
    const s = game();
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const apc = addUnit(s, 'troopTransport', 0, 0, 1);
    const rider = addUnit(s, 'army', 0, 0, 1, { carriedBy: apc.id });
    const r = run(s, { type: 'load', player: 0, transportId: p.id, unitIds: [apc.id] });
    expect(at(r.s, apc).carriedBy).toBe(p.id);
    expect(at(r.s, rider).carriedBy).toBeNull();
    expect(at(r.s, rider)).toMatchObject({ x: 0, y: 1 });
  });

  it('takes waiting Armies by itself when it leaves a city, but not Armor', () => {
    const s = game();
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const army = addUnit(s, 'army', 0, 0, 1);
    const armor = addUnit(s, 'armor', 0, 0, 1);
    const r = run(s, { type: 'move', player: 0, unitId: p.id, dir: east });
    expect(at(r.s, army).carriedBy).toBe(p.id);
    expect(at(r.s, armor).carriedBy).toBeNull();
  });

  it('cannot be boarded in the open', () => {
    const s = game();
    const p = flying(s, 3, 1);
    const army = addUnit(s, 'army', 0, 2, 1);
    expect(refused(s, { type: 'move', player: 0, unitId: army.id, dir: east })).toMatch(/occupied/);
    expect(at(s, p).carriedBy).toBeNull();
  });

  it('loads at an Airbase from the squares around it', () => {
    const s = game();
    const base = addUnit(s, 'airbase', 0, 5, 1);
    const p = addUnit(s, 'airCargo', 0, 5, 1, { carriedBy: base.id });
    const armor = addUnit(s, 'armor', 0, 4, 1);
    const far = addUnit(s, 'army', 0, 8, 1);
    expect(refused(s, { type: 'load', player: 0, transportId: p.id, unitIds: [far.id] })).toMatch(/cannot board/);
    const r = run(s, { type: 'load', player: 0, transportId: p.id, unitIds: [armor.id] });
    expect(at(r.s, armor)).toMatchObject({ carriedBy: p.id, x: 5, y: 1, movesLeft: 0 });
  });

  it('airdrops an Army beside it, which is then done for the turn', () => {
    const s = game();
    const p = flying(s, 5, 1);
    const army = aboard(s, p, 'army');
    const r = run(s, { type: 'move', player: 0, unitId: army.id, dir: east });
    expect(at(r.s, army)).toMatchObject({ carriedBy: null, x: 6, movesLeft: 0 });
  });

  it('never drops onto an enemy, into a foreign city, or a vehicle from the air', () => {
    const s = game();
    const p = flying(s, 22, 1);
    const army = aboard(s, p, 'army');
    const armor = aboard(s, p, 'armor');
    expect(refused(s, { type: 'move', player: 0, unitId: army.id, dir: east })).toMatch(/city/);
    addUnit(s, 'army', 1, 21, 1);
    expect(refused(s, { type: 'move', player: 0, unitId: army.id, dir: 6 })).toMatch(/enemy/);
    expect(refused(s, { type: 'move', player: 0, unitId: armor.id, dir: 0 })).toMatch(/vehicles/);
    expect(refused(s, { type: 'unload', player: 0, transportId: p.id, unitIds: [armor.id] })).toMatch(/vehicles/);
  });

  it('lets a vehicle drive off at an Airbase onto a free square beside it', () => {
    const s = game();
    const base = addUnit(s, 'airbase', 0, 5, 1);
    const p = addUnit(s, 'airCargo', 0, 5, 1, { carriedBy: base.id });
    const armor = aboard(s, p, 'armor');
    const r = run(s, { type: 'move', player: 0, unitId: armor.id, dir: east });
    expect(at(r.s, armor)).toMatchObject({ carriedBy: null, x: 6, movesLeft: 0 });
  });

  it('loses its cargo when it runs out of fuel', () => {
    const s = game();
    const p = flying(s, 5, 1);
    p.fuel = 1;
    const army = aboard(s, p, 'army');
    const r = run(s, { type: 'endTurn', player: 0 });
    expect(r.s.units.some((u) => u.id === p.id || u.id === army.id)).toBe(false);
  });
});

describe('Air Transport ferry routes', () => {
  it('flies troops and one Armor from city to Airbase by itself, and comes back', () => {
    let s = game(true);
    const base = addUnit(s, 'airbase', 0, 7, 1);
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const army1 = addUnit(s, 'army', 0, 0, 1);
    const army2 = addUnit(s, 'army', 0, 0, 1);
    const army3 = addUnit(s, 'army', 0, 0, 1);
    const armor = addUnit(s, 'armor', 0, 0, 1);
    const armor2 = addUnit(s, 'armor', 0, 0, 1);
    s = run(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup: s.cities[0].id, drop: { x: 7, y: 1 } } }).s;
    // It set out at once with one Armor and the two Armies that still fit.
    expect(at(s, armor).carriedBy).toBe(p.id);
    expect(at(s, armor2).carriedBy).toBeNull();
    expect([army1, army2, army3].filter((a) => at(s, a).carriedBy === p.id)).toHaveLength(2);
    expect(getPlayerView(s, 0).ferryRoutes[0].air).toBe(true);
    s = round(s); // lands on the Airbase and puts everything on the squares around it
    expect(at(s, armor).carriedBy).toBeNull();
    expect(Math.max(Math.abs(at(s, armor).x - base.x), Math.abs(at(s, armor).y - base.y))).toBe(1);
    expect(at(s, p).orders).toMatchObject({ kind: 'goto', ferry: 'pickup' });
    s = round(round(s));
    expect(at(s, p).orders).toMatchObject({ kind: 'goto' });
    expect(s.units.some((u) => u.id === p.id)).toBe(true);
  });

  it('parachutes troops onto open ground, leaving Armor at home, and flies back', () => {
    let s = game(true);
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const army = addUnit(s, 'army', 0, 0, 1);
    const armor = addUnit(s, 'armor', 0, 0, 1);
    s = run(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup: s.cities[0].id, drop: { x: 7, y: 1 } } }).s;
    expect(at(s, armor).carriedBy).toBeNull();
    expect(at(s, army).carriedBy).toBe(p.id);
    s = round(s);
    expect(at(s, army)).toMatchObject({ carriedBy: null, x: 7, y: 1 });
    expect(at(s, p).orders).toMatchObject({ kind: 'goto', ferry: 'pickup' });
    s = round(round(s));
    expect(at(s, p)).toMatchObject({ x: 0, y: 1 });
  });

  it('picks up from an Airbase, taking the units beside it', () => {
    let s = game(true);
    const base = addUnit(s, 'airbase', 0, 6, 1);
    const p = addUnit(s, 'airCargo', 0, 6, 1, { carriedBy: base.id });
    const army = addUnit(s, 'army', 0, 5, 1);
    const armor = addUnit(s, 'armor', 0, 5, 2);
    s = run(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup: airbasePickup(base.id), drop: { x: 0, y: 1 } } }).s;
    expect(at(s, army).carriedBy).toBe(p.id);
    expect(at(s, armor).carriedBy).toBe(p.id);
    s = round(s);
    expect(at(s, army)).toMatchObject({ carriedBy: null, x: 0, y: 1 });
    expect(at(s, armor)).toMatchObject({ carriedBy: null, x: 0, y: 1 });
    expect(getPlayerView(s, 0).ferryRoutes[0].pickup.name).toBe('Airbase 6,1');
  });

  it('comes back to an Airbase pickup and carries on, trip after trip', () => {
    let s = game(true);
    const base = addUnit(s, 'airbase', 0, 6, 1);
    const p = addUnit(s, 'airCargo', 0, 6, 1, { carriedBy: base.id });
    addUnit(s, 'army', 0, 5, 1);
    s = run(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup: airbasePickup(base.id), drop: { x: 0, y: 1 } } }).s;
    s = round(round(round(s)));
    expect(at(s, p)).toMatchObject({ carriedBy: base.id, orders: { kind: 'goto', ferry: 'pickup' } });
    const next = addUnit(s, 'army', 0, 7, 1);
    s = round(s);
    expect(at(s, next).carriedBy === p.id || at(s, next).x === 0).toBe(true);
  });

  it('drops what fits and flies the rest home rather than circling', () => {
    let s = game(true);
    s.rules.stacking = false;
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const armies = [0, 1, 2, 3].map(() => addUnit(s, 'army', 0, 0, 1));
    // Every square around the plane's side of the drop is open, so all four land on separate squares or come home.
    s = run(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup: s.cities[0].id, drop: { x: 7, y: 1 } } }).s;
    s = round(s);
    const landed = armies.filter((a) => at(s, a).carriedBy === null);
    expect(landed.length).toBeGreaterThan(0);
    expect(landed.some((a) => at(s, a).x === 7 && at(s, a).y === 1)).toBe(true);
    expect(at(s, p).orders).toMatchObject({ kind: 'goto', ferry: 'pickup' });
  });

  it('stops and asks when an airdrop route finds a vehicle aboard', () => {
    let s = game(true);
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const armor = addUnit(s, 'armor', 0, 0, 1);
    s = run(s, { type: 'load', player: 0, transportId: p.id, unitIds: [armor.id] }).s;
    expect(refused(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup: s.cities[0].id, drop: { x: 7, y: 1 } } })).toMatch(/cannot be airdropped/);
  });

  it('refuses routes the tank cannot fly, or a drop right beside the pickup', () => {
    const s = game();
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    const pickup = s.cities[0].id;
    expect(refused(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup, drop: { x: 14, y: 1 } } })).toBe('out of range');
    expect(refused(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { pickup, drop: { x: 1, y: 1 } } })).toMatch(/at least 2/);
  });

  it('keeps air routes apart from ship and APC routes', () => {
    let s = game();
    const apc = addUnit(s, 'troopTransport', 0, 0, 1);
    const p = addUnit(s, 'airCargo', 0, 0, 1);
    s = run(s, { type: 'setFerry', player: 0, unitId: apc.id, ferry: { pickup: s.cities[0].id, drop: { x: 7, y: 1 } } }).s;
    expect(refused(s, { type: 'setFerry', player: 0, unitId: p.id, ferry: { routeId: s.ferryRoutes![0].id } })).toMatch(/different kind/);
  });
});
