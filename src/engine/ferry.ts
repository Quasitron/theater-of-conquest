import type { FerryRoute, GameEvent, GameState, PlayerId, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, armorBlockedBy, canCarry, canFerry, cargoCapacity, cargoUsed, hostHasRoom, isVehicle } from './units';
import { chebyshev, neighbors, reliefAt, terrainAt } from './map';
import { areFriendly } from './relations';
import { airbaseUnder, canJoinStack, cargoOf, cityAt, topLevelUnitsAt } from './query';
import { inFriendlyCity, unloadCargo } from './cargo';
import { findPath, pathMapFromState, type PathMap } from './path';
import { giveOrders } from './orders';
import { leavePlaneError } from './movement';

/** An air route that picks up at an Airbase writes it as -(unit id) - 1, so that it cannot be mistaken for a city id. */
export const airbasePickup = (unitId: number): number => -unitId - 1;

/** Where a route picks up: the city, or the Airbase, with who holds it. Undefined once it is gone. */
export function ferryPickupPlace(s: GameState, pickup: number): { x: number; y: number; owner: PlayerId | null; name: string } | undefined {
  if (pickup >= 0) return s.cities.find((c) => c.id === pickup);
  const base = s.units.find((u) => u.id === -pickup - 1 && u.type === 'airbase');
  return base ? { x: base.x, y: base.y, owner: base.owner, name: `Airbase ${base.x},${base.y}` } : undefined;
}

/** Whether an Air Transport of `owner` can land on the drop square (a friendly city or an own Airbase): else it airdrops there. */
export function dropIsBase(s: GameState, owner: PlayerId, drop: Pos): boolean {
  const city = cityAt(s, drop.x, drop.y);
  if (city) return areFriendly(s, city.owner, owner);
  return topLevelUnitsAt(s, drop.x, drop.y).some((u) => u.type === 'airbase' && u.owner === owner);
}

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

/** Whether an Air Transport on this route takes an Armor along: only when it will land where it is going. */
function takesArmor(s: GameState, u: Unit): boolean {
  const route = ferryRouteOf(s, u);
  return !!route && dropIsBase(s, u.owner, route.drop);
}

/**
 * The units on `from` (a city), or around it when `base` is the Airbase being used, that this carrier would take by
 * itself. An Air Transport takes Armies and Spies, and an Armor first on a route that ends at a city or Airbase.
 */
function waitingUnits(s: GameState, u: Unit, from: Pos, base: boolean, armor: boolean): Unit[] {
  const air = u.type === 'airCargo';
  const out = s.units.filter(
    (a) =>
      canCarry(u.type, a.type) &&
      a.carriedBy === null &&
      a.owner === u.owner &&
      (base
        ? chebyshev(s, a, from) === 1 && !cityAt(s, a.x, a.y) && (a.orders === null || a.orders.kind === 'sentry')
        : a.x === from.x && a.y === from.y) &&
      !(s.rules.sentriedStayAsGarrison && a.orders !== null) &&
      (!air || (isVehicle(a.type) ? armor && a.type === 'armor' : true)),
  );
  return air ? out.sort((a, b) => Number(isVehicle(b.type)) - Number(isVehicle(a.type))) : out;
}

/** The units waiting for a carrier where it stands: in a city, or (an Air Transport on an Airbase route) around that base. */
function waitingHere(s: GameState, u: Unit): Unit[] {
  if (cityAt(s, u.x, u.y)) return waitingUnits(s, u, u, false, takesArmor(s, u));
  const base = airbaseUnder(s, u);
  const route = ferryRouteOf(s, u);
  return base && route && route.pickup === airbasePickup(base.id) ? waitingUnits(s, u, base, true, takesArmor(s, u)) : [];
}

/**
 * A carrier that has just left a friendly city (`leaving`) or taken off from an Airbase (`base`) takes what waits
 * there, up to capacity. Not one on its way back to its pickup: it has just put its cargo down and must not take it again.
 */
export function boardOnDeparture(s: GameState, u: Unit, from: Pos, to: Pos, leaving: { owner: PlayerId | null } | undefined, base: Unit | undefined): void {
  if (UNIT_STATS[u.type].carries.length === 0) return;
  const leg = u.orders?.kind === 'goto' ? u.orders.ferry : undefined;
  if (u.ferry !== undefined && leg === 'pickup') return;
  const armor = leg === 'drop' && takesArmor(s, u);
  let waiting: Unit[] = [];
  if (leaving && areFriendly(s, leaving.owner, u.owner)) waiting = waitingUnits(s, u, from, false, armor);
  else if (base && u.type === 'airCargo' && leg === 'drop' && ferryRouteOf(s, u)?.pickup === airbasePickup(base.id)) waiting = waitingUnits(s, u, from, true, armor);
  for (const a of waiting) {
    if (!hostHasRoom(u, cargoOf(s, u), a.type)) continue;
    a.carriedBy = u.id;
    a.x = to.x;
    a.y = to.y;
    // Armies aboard sleep; fighters aboard a carrier wait for orders until the player sentries them.
    a.orders = UNIT_STATS[a.type].domain === 'air' ? null : { kind: 'sentry' };
  }
}

/** Whether the carrier has cargo aboard, or units waiting that it could take (as it does when leaving). */
export function ferryHasCargo(s: GameState, u: Unit): boolean {
  const aboard = cargoOf(s, u);
  return aboard.length > 0 || waitingHere(s, u).some((a) => hostHasRoom(u, aboard, a.type));
}

/**
 * With waiting units taken in order as the carrier leaves, whether it counts as full: at most one space free, or a waiting unit
 * is left behind because it does not fit (an Armor needs two spaces, so one free space can stay empty for ever).
 */
export function ferryWouldBeFull(s: GameState, u: Unit): boolean {
  const aboard = cargoOf(s, u);
  let leftBehind = false;
  for (const a of waitingHere(s, u)) {
    if (hostHasRoom(u, aboard, a.type)) aboard.push(a);
    // A second vehicle for an Air Transport that already has one does not make it full.
    else if (!(u.type === 'airCargo' && isVehicle(a.type) && aboard.some((c) => isVehicle(c.type)))) leftBehind = true;
  }
  // One free space short of the capacity is close enough: it is not worth waiting for one more Army or Spy.
  return cargoCapacity(u) - cargoUsed(aboard) <= 1 || leftBehind;
}

/** The route's drop square when this Air Transport must parachute its troops there (it cannot land on it). */
export function airDrop(s: GameState, u: Unit): Pos | null {
  const route = u.type === 'airCargo' ? ferryRouteOf(s, u) : undefined;
  return route && !dropIsBase(s, u.owner, route.drop) ? route.drop : null;
}

/** An open square the plane can hold up on: no city, no unit in the way. */
const openSky = (s: GameState, u: Unit, p: Pos): boolean => !cityAt(s, p.x, p.y) && topLevelUnitsAt(s, p.x, p.y).every((o) => o === u);

/** Whether the plane is beside the drop square, in the air, and so can drop now. */
export function airDropReady(s: GameState, u: Unit, drop: Pos): boolean {
  return u.carriedBy === null && chebyshev(s, u, drop) === 1 && openSky(s, u, u);
}

/** The open square beside the drop that the plane reaches soonest, with the length of the way there. */
export function airDropApproach(s: GameState, map: PathMap, from: Pick<Unit, 'type' | 'x' | 'y'>, u: Unit, drop: Pos): { pos: Pos; steps: number } | null {
  let best: { pos: Pos; steps: number } | null = null;
  for (const n of neighbors(s, drop.x, drop.y)) {
    if (!openSky(s, u, n)) continue;
    const path = findPath(map, from, n);
    if (path !== null && (best === null || path.length < best.steps)) best = { pos: n, steps: path.length };
  }
  return best;
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
  if (inFriendlyCity(s, t)) return unloadCargo(s, t, null, events) === null && cargoOf(s, t).length === 0;
  const plane = t.type === 'airCargo';
  const drop = airDrop(s, t);
  const landed: number[] = [];
  for (const c of cargo) {
    let best: Pos | null = null;
    let bestScore = Infinity;
    for (const n of neighbors(s, t.x, t.y)) {
      if (plane ? leavePlaneError(s, c, t, n) !== null : !fitsAt(s, c, n)) continue;
      const count = topLevelUnitsAt(s, n.x, n.y).length;
      // Stacking rule: pile onto one square (the fullest with room) so the weaker units are covered; otherwise spread out.
      // An airdrop lands on the chosen square when it can, else as near to it as possible.
      const score = (drop ? 100 * chebyshev(s, n, drop) : 0) + (cityAt(s, n.x, n.y) ? 0 : 10) + (s.rules.stacking ? -count : count);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (!best) continue;
    const from = { x: c.x, y: c.y };
    c.carriedBy = null;
    c.x = best.x;
    c.y = best.y;
    c.orders = null;
    if (plane) c.movesLeft = 0; // getting out is its turn
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
  const airborne = airDrop(s, u) !== null;
  // An airdrop that cannot land everyone flies home with the rest: waiting in the air would run it out of fuel.
  return disembark(s, u, events) || airborne ? 'pickup' : null;
}

/** Whether player `pid` sees an enemy on square p this turn. */
export function enemyOnSquare(s: GameState, pid: PlayerId, p: Pos): boolean {
  return Object.values(s.fog[pid].lastSeen).some((e) => e.turnSeen === s.turn && e.x === p.x && e.y === p.y && !areFriendly(s, e.owner, pid));
}

function validateFerry(s: GameState, u: Unit, pickup: number, drop: Pos): string | null {
  const air = u.type === 'airCargo';
  const city = ferryPickupPlace(s, pickup);
  // A city may be a teammate's; an Airbase must be our own.
  const usable = !!city && (pickup >= 0 ? areFriendly(s, city.owner, u.owner) : air && city.owner === u.owner);
  if (!city || !usable) return air ? 'the pickup must be your city or Airbase, or an ally\'s city' : 'the pickup must be your city or an ally\'s';
  if (!Number.isInteger(drop?.x) || !Number.isInteger(drop?.y) || drop.x < 0 || drop.x >= s.width || drop.y < 0 || drop.y >= s.height) return 'invalid drop square';
  if (s.fog[u.owner].explored[drop.y * s.width + drop.x] !== 1) return 'the drop square is not explored';
  if (drop.x === city.x && drop.y === city.y) return 'the drop square must differ from the pickup city';
  if (air) return validateAirDrop(s, u, city, drop);
  const dropCity = cityAt(s, drop.x, drop.y);
  const land = UNIT_STATS[u.type].domain === 'land'; // an APC runs routes over land
  if (terrainAt(s, drop.x, drop.y) !== (land ? 'land' : 'water') && !(dropCity && areFriendly(s, dropCity.owner, u.owner))) return land ? 'the drop square must be a land tile (or a friendly city)' : 'the drop square must be a sea tile (or a friendly city)';
  if (enemyOnSquare(s, u.owner, drop)) return 'an enemy is on the drop square';
  // Own units standing about (even the carrier itself on the drop square) do not count: the route is about the sea or land between.
  if (findPath({ ...pathMapFromState(s, u.owner), own: new Map() }, { type: u.type, x: city.x, y: city.y }, drop) === null) return 'no known path between the pickup city and the drop square';
  return null;
}

/** An air route: each flight must fit the tank, and an airdrop must get there and back. */
function validateAirDrop(s: GameState, u: Unit, pickup: Pos, drop: Pos): string | null {
  const map = { ...pathMapFromState(s, u.owner), own: new Map() };
  const range = UNIT_STATS[u.type].range ?? 0;
  const from = { type: u.type, x: pickup.x, y: pickup.y };
  if (dropIsBase(s, u.owner, drop)) {
    const path = findPath(map, from, drop);
    if (path === null) return 'no known way to fly to the drop square';
    return path.length > range ? 'out of range' : null;
  }
  if (terrainAt(s, drop.x, drop.y) !== 'land') return 'the drop square must be land (to parachute onto), a friendly city or an Airbase';
  if (chebyshev(s, pickup, drop) < 2) return 'an airdrop must be at least 2 squares from the pickup';
  const way = airDropApproach(s, map, from, u, drop);
  if (way === null) return 'no known way to fly to the drop square';
  return way.steps + chebyshev(s, way.pos, pickup) > range ? 'out of range' : null;
}

/** Sends the carrier on its route: to the pickup city, or to the drop square if it already has cargo. */
function startFerry(s: GameState, rng: RandomSource, u: Unit, route: FerryRoute, events: GameEvent[]): string | null {
  const city = ferryPickupPlace(s, route.pickup);
  if (!city || !areFriendly(s, city.owner, u.owner)) return 'the pickup is no longer yours or an ally\'s';
  if (airDrop(s, u) && cargoOf(s, u).some((c) => isVehicle(c.type))) return 'a vehicle cannot be airdropped: unload it first';
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
    if (!!route.air !== (u.type === 'airCargo')) return 'that route is for a different kind of carrier';
  } else {
    const err = validateFerry(s, u, spec.pickup, spec.drop);
    if (err) return err;
    route = s.ferryRoutes?.find((r) => r.by === actor && !!r.air === (u.type === 'airCargo') && r.pickup === spec.pickup && r.drop.x === spec.drop.x && r.drop.y === spec.drop.y);
    if (!route) {
      route = { id: Math.max(0, ...(s.ferryRoutes ?? []).map((r) => r.id)) + 1, pickup: spec.pickup, drop: { x: spec.drop.x, y: spec.drop.y }, by: actor, ...(spec.waitFull ? { waitFull: true } : {}), ...(u.type === 'airCargo' ? { air: true as const } : {}) };
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
  const city = ferryPickupPlace(s, pickup)!;
  for (const u of s.units) {
    if (u.ferry !== routeId || u.orders?.kind !== 'goto' || !u.orders.ferry) continue;
    u.orders.target = u.orders.ferry === 'pickup' ? { x: city.x, y: city.y } : { x: drop.x, y: drop.y };
  }
  return null;
}
