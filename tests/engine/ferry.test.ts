import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import type { Command, GameEvent, GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

// Player 0's city A at x=0, open sea to x=5, a shore at x=6 and 7 (land), player 1's city at x=8.
const MAP = ['*.....##*'];

function game(): GameState {
  const s = makeGame(MAP, { starts: [0, 1] });
  for (const c of s.cities) c.production = null;
  s.fog[0].explored.fill(1);
  s.fog[1].explored.fill(1);
  return s;
}

function run(s: GameState, cmd: Command) {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

function round(s: GameState): { state: GameState; events: GameEvent[] } {
  const a = run(s, { type: 'endTurn', player: 0 });
  const b = run(a.state, { type: 'endTurn', player: 1 });
  return { state: b.state, events: [...a.events, ...b.events] };
}

const DROP = { x: 5, y: 0 };
const ferry = (s: GameState, unitId: number, f: { routeId: number } | { pickup: number; drop: { x: number; y: number } } | null) =>
  apply(s, { type: 'setFerry', player: 0, unitId, ferry: f });

describe('ferry routes', () => {
  it('the drop square must be a sea tile (or one of your cities)', () => {
    const s = game();
    const t = addUnit(s, 'transport', 0, 0, 0);
    const r = ferry(s, t.id, { pickup: 0, drop: { x: 6, y: 0 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('the drop square must be a sea tile (or one of your cities)');
    expect(ferry(s, t.id, { pickup: 0, drop: { x: 8, y: 0 } }).ok).toBe(false); // the enemy city
    expect(ferry(s, t.id, { pickup: 0, drop: DROP }).ok).toBe(true);
  });

  it('a transport on a route waits for cargo, takes it to the drop square, puts it ashore, and returns', () => {
    let s = game();
    const t = addUnit(s, 'transport', 0, 0, 0);
    s = run(s, { type: 'setFerry', player: 0, unitId: t.id, ferry: { pickup: 0, drop: DROP } }).state;
    expect(s.ferryRoutes).toHaveLength(1);
    // Nothing to carry: it waits in the city with its orders kept.
    for (let i = 0; i < 2; i++) s = round(s).state;
    let tr = s.units.find((u) => u.id === t.id)!;
    expect(tr).toMatchObject({ x: 0, y: 0, ferry: 1, orders: { kind: 'goto', ferry: 'pickup' } });
    // An army arrives and is taken as the transport leaves.
    const a = addUnit(s, 'army', 0, 0, 0);
    for (let i = 0; i < 4; i++) s = round(s).state;
    const army = s.units.find((u) => u.id === a.id)!;
    expect(army.carriedBy).toBeNull();
    expect(army.x).toBe(6); // put ashore beside the drop square
    tr = s.units.find((u) => u.id === t.id)!;
    expect(tr.orders).toMatchObject({ kind: 'goto', ferry: 'pickup' }); // and it has turned back for more
    expect(tr.ferry).toBe(1);
  });

  it('waits at the drop square while there is no room ashore, then unloads the rest', () => {
    let s = game();
    const t = addUnit(s, 'transport', 0, 5, 0);
    const a = addUnit(s, 'army', 0, 5, 0, { carriedBy: t.id });
    const b = addUnit(s, 'army', 0, 5, 0, { carriedBy: t.id });
    addUnit(s, 'army', 0, 6, 0); // the only shore square is taken (no stacking)
    s = run(s, { type: 'setFerry', player: 0, unitId: t.id, ferry: { pickup: 0, drop: DROP } }).state;
    const aboard = () => s.units.filter((u) => u.carriedBy === t.id).length;
    expect(aboard()).toBe(2);
    expect(s.units.find((u) => u.id === t.id)!.orders).toMatchObject({ ferry: 'drop' });
    s = round(s).state;
    expect(aboard()).toBe(2); // still waiting
    s.units.find((u) => u.x === 6 && u.carriedBy === null)!.x = 7; // room appears (an army walks off)
    s = round(s).state;
    expect(aboard()).toBe(1); // one more fits; the other must wait for the next
    expect(s.units.find((u) => u.id === a.id)!.carriedBy === null || s.units.find((u) => u.id === b.id)!.carriedBy === null).toBe(true);
  });

  it('shares a route between transports, prunes it when nobody is on it, and resumes after an interruption', () => {
    let s = game();
    const t1 = addUnit(s, 'transport', 0, 0, 0);
    const t2 = addUnit(s, 'transport', 0, 0, 0);
    s = run(s, { type: 'setFerry', player: 0, unitId: t1.id, ferry: { pickup: 0, drop: DROP } }).state;
    s = run(s, { type: 'setFerry', player: 0, unitId: t2.id, ferry: { routeId: 1 } }).state;
    expect(s.ferryRoutes).toHaveLength(1);
    expect(s.units.filter((u) => u.ferry === 1)).toHaveLength(2);
    // An interruption: the orders end but the route stays, and Resume sets the transport off again.
    run(s, { type: 'setOrders', player: 0, unitId: t2.id, orders: null });
    s = run(s, { type: 'setOrders', player: 0, unitId: t2.id, orders: null }).state;
    expect(s.units.find((u) => u.id === t2.id)).toMatchObject({ ferry: 1, orders: null });
    s = run(s, { type: 'resumeFerry', player: 0, unitId: t2.id }).state;
    expect(s.units.find((u) => u.id === t2.id)!.orders).toMatchObject({ kind: 'goto', ferry: 'pickup' });
    // Leaving the route: with both gone, the route is dropped at the next turn.
    s = run(s, { type: 'setFerry', player: 0, unitId: t1.id, ferry: null }).state;
    s = run(s, { type: 'setFerry', player: 0, unitId: t2.id, ferry: null }).state;
    s = round(s).state;
    expect(s.ferryRoutes).toBeUndefined();
  });

  it('editing a route changes it for every transport on it', () => {
    let s = game();
    const t = addUnit(s, 'transport', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    s = run(s, { type: 'setFerry', player: 0, unitId: t.id, ferry: { pickup: 0, drop: DROP } }).state;
    s = run(s, { type: 'editFerry', player: 0, routeId: 1, pickup: 0, drop: { x: 4, y: 0 } }).state;
    expect(s.ferryRoutes![0].drop).toEqual({ x: 4, y: 0 });
    expect(s.units.find((u) => u.id === t.id)!.orders).toMatchObject({ ferry: 'drop', target: { x: 4, y: 0 } });
  });

  it('with wait-until-full on, holds at the pickup city until the carrier is full', () => {
    let s = game();
    const t = addUnit(s, 'transport', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    s = run(s, { type: 'setFerry', player: 0, unitId: t.id, ferry: { pickup: 0, drop: DROP, waitFull: true } }).state;
    expect(s.ferryRoutes![0].waitFull).toBe(true);
    for (let i = 0; i < 2; i++) s = round(s).state;
    expect(s.units.find((u) => u.id === t.id)).toMatchObject({ x: 0, orders: { ferry: 'pickup' } });
    for (let i = 0; i < 5; i++) addUnit(s, 'army', 0, 0, 0); // six armies fill a transport
    s = round(s).state;
    expect(s.units.find((u) => u.id === t.id)!.x).toBeGreaterThan(0);
    expect(s.units.filter((u) => u.carriedBy === t.id).length).toBe(6);
  });

  it('refuses bad routes and units that cannot ferry', () => {
    const s = game();
    const t = addUnit(s, 'transport', 0, 0, 0);
    const d = addUnit(s, 'destroyer', 0, 0, 0);
    const c = addUnit(s, 'carrier', 0, 0, 0);
    expect(ferry(s, d.id, { pickup: 0, drop: DROP })).toMatchObject({ ok: false });
    expect(ferry(s, c.id, { pickup: 0, drop: DROP })).toMatchObject({ ok: false, error: 'Carrier cannot run a ferry route' });
    expect(ferry(s, t.id, { pickup: 1, drop: DROP })).toMatchObject({ ok: false, error: 'the pickup must be one of your cities' });
    expect(ferry(s, t.id, { pickup: 0, drop: { x: 0, y: 0 } })).toMatchObject({ ok: false, error: 'the drop square must differ from the pickup city' });
    expect(ferry(s, t.id, { routeId: 9 })).toMatchObject({ ok: false, error: 'no such ferry route' });
  });

  it('pauses when an enemy comes next to the transport, keeping its place on the route', () => {
    let s = game();
    const t = addUnit(s, 'transport', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    s = run(s, { type: 'setFerry', player: 0, unitId: t.id, ferry: { pickup: 0, drop: DROP } }).state;
    const tr = () => s.units.find((u) => u.id === t.id)!;
    // An enemy destroyer sits right in its way.
    addUnit(s, 'destroyer', 1, tr().x + 2, 0);
    s = round(s).state;
    expect(tr()).toMatchObject({ ferry: 1 });
    expect(tr().orders === null || tr().orders!.kind === 'goto').toBe(true);
  });
});
