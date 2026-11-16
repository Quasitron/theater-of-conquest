import type { FerryRoute, GameEvent, GameState, PlayerId, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, armorBlockedBy, canCarry, canFerry } from './units';
import { neighbors, reliefAt, terrainAt } from './map';
import { areFriendly } from './relations';
import { canJoinStack, cargoOf, cargoRoom, cityAt, topLevelUnitsAt } from './query';
import { inOwnCity, unloadCargo } from './cargo';
import { findPath, pathMapFromState } from './path';
import { giveOrders } from './orders';

/** The route a carrier is on, if it still exists. */
export function ferryRouteOf(s: GameState, u: Unit): FerryRoute | undefined {
  return u.ferry === undefined ? undefined : s.ferryRoutes?.find((r) => r.id === u.ferry);
}

/** Drops routes nobody is on any more. */
export function pruneFerryRoutes(s: GameState): void {
  if (!s.ferryRoutes) return;
  s.ferryRoutes = s.ferryRoutes.filter((r) => s.units.some((u) => u.ferry === r.id));
  if (s.ferryRoutes.length === 0) delete s.ferryRoutes;
}

/** Whether the carrier has cargo aboard, or units waiting in its square that it could take (as it does when leaving a city). */
export function ferryHasCargo(s: GameState, u: Unit): boolean {
  if (cargoOf(s, u).length > 0) return true;
  if (!cityAt(s, u.x, u.y)) return false;
  return s.units.some(
    (a) =>
      a.carriedBy === null && a.owner === u.owner && a.x === u.x && a.y === u.y && canCarry(u.type, a.type) &&
      !(s.rules.sentriedStayAsGarrison && a.orders !== null) && UNIT_STATS[a.type].slots <= cargoRoom(s, u),
  );
}

/** With waiting units taken in order as the carrier leaves, whether no further unit could fit (it would be full). */
export function ferryWouldBeFull(s: GameState, u: Unit): boolean {
  let room = cargoRoom(s, u);
  if (cityAt(s, u.x, u.y)) {
    const waiting = s.units.filter(
      (a) => a.carriedBy === null && a.owner === u.owner && a.x === u.x && a.y === u.y && canCarry(u.type, a.type) && !(s.rules.sentriedStayAsGarrison && a.orders !== null),
    );
    for (const a of waiting) if (UNIT_STATS[a.type].slots <= room) room -= UNIT_STATS[a.type].slots;
  }
  return room < 1;
}

/** Whether `c` could be put ashore on square n (a free square of the right kind, or one it may stack onto). */
function fitsAt(s: GameState, c: Unit, n: Pos): boolean {
  const st = UNIT_STATS[c.type];
  const city = cityAt(s, n.x, n.y);
  const terrain = terrainAt(s, n.x, n.y);
  if (city) {
    if (!areFriendly(s, city.owner, c.owner)) return false;
  } else {
    if (st.domain === 'land' && terrain !== 'land') return false;
    if (st.domain === 'sea' && terrain !== 'water') return false;
  }
  if (c.type === 'armor' && s.rules.advancedUnits && armorBlockedBy(reliefAt(s, n.x, n.y))) return false;
  const here = topLevelUnitsAt(s, n.x, n.y);
  if (city) return here.every((o) => areFriendly(s, o.owner, c.owner));
  return here.length === 0 || canJoinStack(s, c, n);
}

/**
 * Puts the carrier's cargo ashore: in an own city everything leaves the carrier; elsewhere each unit goes to a free
 * square next to the carrier where it can stand (a city first, then the emptiest square). Units with no room stay
 * aboard. Returns true when nothing is left aboard.
 */
export function disembark(s: GameState, t: Unit, events: GameEvent[]): boolean {
  const cargo = cargoOf(s, t).sort((a, b) => a.id - b.id);
  if (cargo.length === 0) return true;
  if (inOwnCity(s, t)) return unloadCargo(s, t, null, events) === null && cargoOf(s, t).length === 0;
  const landed: number[] = [];
  for (const c of cargo) {
    let best: Pos | null = null;
    let bestScore = Infinity;
    for (const n of neighbors(s, t.x, t.y)) {
      if (!fitsAt(s, c, n)) continue;
      const score = (cityAt(s, n.x, n.y) ? 0 : 10) + topLevelUnitsAt(s, n.x, n.y).length;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (!best) continue;
    const from = { x: c.x, y: c.y };
    c.carriedBy = null;
    c.x = best.x;
    c.y = best.y;
    c.orders = null;
    events.push({ type: 'unitMoved', unitId: c.id, from, to: { x: best.x, y: best.y } });
    landed.push(c.id);
  }
  if (landed.length > 0) events.push({ type: 'cargoUnloaded', transportId: t.id, owner: t.owner, unitIds: landed });
  return cargoOf(s, t).length === 0;
}

/**
 * A carrier on a ferry route has reached the square it was heading for. At the pickup city it sets out once it has
 * cargo (it takes what is waiting as it leaves); at the drop square it puts everything ashore and heads back. Returns
 * true when the leg changed (it carries on at once), false when it must wait (nothing to carry yet, or no room ashore).
 */
export function ferryArrive(s: GameState, u: Unit, leg: 'pickup' | 'drop', events: GameEvent[]): 'pickup' | 'drop' | null {
  if (leg === 'pickup') {
    if (!ferryHasCargo(s, u)) return null;
    return ferryRouteOf(s, u)?.waitFull && !ferryWouldBeFull(s, u) ? null : 'drop';
  }
  return disembark(s, u, events) ? 'pickup' : null;
}

function validateFerry(s: GameState, u: Unit, pickup: number, drop: Pos): string | null {
  const city = s.cities.find((c) => c.id === pickup);
  if (!city || city.owner !== u.owner) return 'the pickup must be one of your cities';
  if (!Number.isInteger(drop?.x) || !Number.isInteger(drop?.y) || drop.x < 0 || drop.x >= s.width || drop.y < 0 || drop.y >= s.height) return 'invalid drop square';
  if (s.fog[u.owner].explored[drop.y * s.width + drop.x] !== 1) return 'the drop square is not explored';
  if (drop.x === city.x && drop.y === city.y) return 'the drop square must differ from the pickup city';
  const dropCity = cityAt(s, drop.x, drop.y);
  if (terrainAt(s, drop.x, drop.y) !== 'water' && !(dropCity && dropCity.owner === u.owner)) return 'the drop square must be a sea tile (or one of your cities)';
  // Own units standing about (even the carrier itself on the drop square) do not count: the route is about the sea or land between.
  if (findPath({ ...pathMapFromState(s, u.owner), own: new Map() }, { type: u.type, x: city.x, y: city.y }, drop) === null) return 'no known path between the pickup city and the drop square';
  return null;
}

/** Sends the carrier on its route: to the pickup city, or to the drop square if it already has cargo. */
function startFerry(s: GameState, rng: RandomSource, u: Unit, route: FerryRoute, events: GameEvent[]): string | null {
  const city = s.cities.find((c) => c.id === route.pickup);
  if (!city || city.owner !== u.owner) return 'the pickup city is no longer yours';
  const leg = cargoOf(s, u).length > 0 ? 'drop' : 'pickup';
  const target = leg === 'pickup' ? { x: city.x, y: city.y } : { ...route.drop };
  return giveOrders(s, rng, u, { kind: 'goto', target, ferry: leg }, events);
}

/** Puts a carrier on a ferry route (existing or new), or takes it off with null. */
export function setFerry(
  s: GameState, rng: RandomSource, actor: PlayerId, u: Unit,
  spec: { routeId: number } | { pickup: number; drop: Pos; waitFull?: boolean } | null, events: GameEvent[],
): string | null {
  if (u.owner !== actor) return 'not your unit';
  if (spec === null) {
    if (u.orders?.kind === 'goto' && u.orders.ferry) u.orders = null;
    delete u.ferry;
    return null;
  }
  if (!canFerry(u.type)) return `${UNIT_STATS[u.type].name} cannot run a ferry route`;
  let route: FerryRoute | undefined;
  let created = false;
  if ('routeId' in spec) {
    route = s.ferryRoutes?.find((r) => r.id === spec.routeId && r.by === actor);
    if (!route) return 'no such ferry route';
  } else {
    const err = validateFerry(s, u, spec.pickup, spec.drop);
    if (err) return err;
    route = s.ferryRoutes?.find((r) => r.by === actor && r.pickup === spec.pickup && r.drop.x === spec.drop.x && r.drop.y === spec.drop.y);
    if (!route) {
      route = { id: Math.max(0, ...(s.ferryRoutes ?? []).map((r) => r.id)) + 1, pickup: spec.pickup, drop: { x: spec.drop.x, y: spec.drop.y }, by: actor, ...(spec.waitFull ? { waitFull: true } : {}) };
      (s.ferryRoutes ??= []).push(route);
      created = true;
    }
  }
  const before = u.ferry;
  u.ferry = route.id;
  const err = startFerry(s, rng, u, route, events);
  if (err) {
    if (before === undefined) delete u.ferry; else u.ferry = before;
    if (created) s.ferryRoutes = s.ferryRoutes!.filter((r) => r !== route);
    return err;
  }
  return null;
}

/** "Resume route": a paused carrier carries on with its ferry route. */
export function resumeFerry(s: GameState, rng: RandomSource, actor: PlayerId, u: Unit, events: GameEvent[]): string | null {
  if (u.owner !== actor) return 'not your unit';
  const route = ferryRouteOf(s, u);
  if (!route) { delete u.ferry; return 'this unit is not on a ferry route'; }
  return startFerry(s, rng, u, route, events);
}

/** Changes a route's pickup city and drop square, for every carrier on it. */
export function editFerry(s: GameState, actor: PlayerId, routeId: number, pickup: number, drop: Pos, waitFull?: boolean): string | null {
  const route = s.ferryRoutes?.find((r) => r.id === routeId && r.by === actor);
  if (!route) return 'no such ferry route';
  const member = s.units.find((u) => u.ferry === routeId);
  if (!member) return 'no such ferry route';
  const err = validateFerry(s, member, pickup, drop);
  if (err) return err;
  route.pickup = pickup;
  route.drop = { x: drop.x, y: drop.y };
  if (waitFull) route.waitFull = true; else delete route.waitFull;
  const city = s.cities.find((c) => c.id === pickup)!;
  for (const u of s.units) {
    if (u.ferry !== routeId || u.orders?.kind !== 'goto' || !u.orders.ferry) continue;
    u.orders.target = u.orders.ferry === 'pickup' ? { x: city.x, y: city.y } : { x: drop.x, y: drop.y };
  }
  return null;
}
