import type { City, GameEvent, GameState, Orders, OrdersEndReason, PlayerId, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, attackRating, canCarry, canHunt, fightRatings, hitsOf, isCrippled, isVehicle } from './units';
import { combatWinChance } from './combat';
import { chebyshev, index, isCoastal, neighbors, reliefAt } from './map';
import { canJoinStack, cargoOf, cityAt, hasRoomFor, isAtRefuelPoint, topLevelUnitsAt } from './query';
import { areFriendly } from './relations';
import { canPlayerSeeUnit, updateFog } from './fog';
import { moveUnit } from './movement';
import { attackRestriction, attackUnit } from './attack';
import { unloadCargo } from './cargo';
import { aircraftCanReach, dirBetween, findBeside, findFrontier, findPath, pathMapFromState } from './path';
import { pickUpRoute } from './routes';
import { airDrop, airDropApproach, airDropReady, ferryArrive, ferryPickupPlace, ferryRouteOf, pruneFerryRoutes } from './ferry';

const NO_AIR_EXPLORE = 'aircraft cannot explore yet';
const NO_PATROL_BASE = 'patrol must start or end at a city or carrier';

/** True when `p` holds a city of yours or a teammate's, or an own carrier with room for one more aircraft (or u aboard it). */
function isRefuelBase(s: GameState, u: Unit, p: Pos): boolean {
  const city = cityAt(s, p.x, p.y);
  if (city && areFriendly(s, city.owner, u.owner)) return true; // a teammate's city refuels too
  return topLevelUnitsAt(s, p.x, p.y).some(
    (c) =>
      c.owner === u.owner && canCarry(c.type, u.type) &&
      (u.carriedBy === c.id || hasRoomFor(s, c, u.type)),
  );
}

/** Where a patrol is heading now: the corner it is on for a circuit, else b or a. */
export function patrolTarget(o: Extract<Orders, { kind: 'patrol' }>): Pos {
  if (o.loop && o.loop.length > 0) {
    const stops = [...o.loop, o.a];
    return stops[Math.min(Math.max(o.leg ?? 0, 0), stops.length - 1)];
  }
  return o.toB ? o.b : o.a;
}

/** The flying distance along `stops` (straight lines) from stop `from` to the last one. */
export function circuitLength(s: GameState, stops: readonly Pos[], from: number): number {
  let n = 0;
  for (let i = Math.max(from, 0) + 1; i < stops.length; i++) n += chebyshev(s, stops[i - 1], stops[i]);
  return n;
}

/** The most corners a circuit may have. */
export const MAX_PATROL_LEGS = 12;

/** The patrol end an aircraft refuels at: a if it holds an own city or usable own carrier, else b, else null. */
export function patrolBase(s: GameState, u: Unit, o: { a: Pos; b: Pos }): Pos | null {
  if (isRefuelBase(s, u, o.a)) return o.a;
  if (isRefuelBase(s, u, o.b)) return o.b;
  return null;
}

function validSquare(s: GameState, u: Unit, p: unknown): p is Pos {
  if (typeof p !== 'object' || p === null) return false;
  const { x, y } = p as Pos;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= s.width || y < 0 || y >= s.height) return false;
  return s.fog[u.owner].explored[index(s, x, y)] === 1;
}

/** True when `u` stands in a city of its owner (where damage is repaired). */
function inFriendlyCity(s: GameState, u: Unit): boolean {
  const c = cityAt(s, u.x, u.y);
  return c !== null && c !== undefined && areFriendly(s, c.owner, u.owner);
}

/** Returns an error message, or null when `u` may be given `o`. */
export function validateOrders(s: GameState, u: Unit, o: Orders): string | null {
  const air = UNIT_STATS[u.type].domain === 'air';
  if (typeof o !== 'object' || o === null) return 'unknown orders';
  switch (o.kind) {
    case 'sentry':
      if (air && !isAtRefuelPoint(s, u)) return 'aircraft can only sentry in a city or on a carrier';
      return null;
    case 'explore':
      return air ? NO_AIR_EXPLORE : null;
    case 'hunt':
      return canHunt(u.type) ? null : 'only armies, armor and warships can hunt';
    case 'repair':
      if (u.damage === 0) return 'nothing to repair';
      if (u.carriedBy !== null || !inFriendlyCity(s, u)) return 'repairs need a friendly city';
      return null;
    case 'goto': {
      if (!validSquare(s, u, o.target)) return 'target is not an explored square';
      if (o.ferry && u.ferry === undefined) return 'not on a ferry route';
      if (o.target.x === u.x && o.target.y === u.y) return o.ferry ? null : 'already there';
      const map = pathMapFromState(s, u.owner);
      const drop = o.ferry === 'drop' ? airDrop(s, u) : null;
      if (drop) {
        // An airdrop flies to a square beside the drop and must still get back to the pickup.
        if (airDropReady(s, u, drop)) return null;
        const way = airDropApproach(s, map, u, u, drop);
        const home = ferryPickupPlace(s, ferryRouteOf(s, u)!.pickup);
        if (way === null || !home) return 'no known path';
        return way.steps + chebyshev(s, way.pos, home) > (u.fuel ?? 0) ? 'out of range' : null;
      }
      const path = findPath(map, u, o.target);
      if (path === null) return 'no known path';
      if (air && !aircraftCanReach(map, path.length, u.fuel ?? 0, o.target, u.type)) return 'out of range';
      return null;
    }
    case 'patrol': {
      if (o.loop !== undefined) {
        if (!Array.isArray(o.loop) || o.loop.length < 1 || o.loop.length > MAX_PATROL_LEGS) return `a circuit needs 1 to ${MAX_PATROL_LEGS} corners`;
        if (!validSquare(s, u, o.a) || !o.loop.every((p) => validSquare(s, u, p))) return 'target is not an explored square';
        if (!Number.isInteger(o.leg ?? 0) || (o.leg ?? 0) < 0 || (o.leg ?? 0) > o.loop.length) return 'unknown orders';
        const stops = [o.a, ...o.loop, o.a];
        const lmap = pathMapFromState(s, u.owner);
        if (air) {
          // Aircraft fly straight: the circuit must start and end at a base, fit in one tank, and be flyable from where it is now.
          if (!isRefuelBase(s, u, o.a)) return NO_PATROL_BASE;
          for (let i = 1; i < stops.length; i++) {
            if (stops[i].x === stops[i - 1].x && stops[i].y === stops[i - 1].y) return 'patrol corners must differ from the one before';
          }
          const range = UNIT_STATS[u.type].range ?? 0;
          if (circuitLength(s, stops, 0) > range) return 'out of range';
          const here = patrolTarget(o);
          const toTarget = chebyshev(s, u, here);
          return toTarget + circuitLength(s, stops, (o.leg ?? 0) + 1) > (u.fuel ?? 0) ? 'out of range' : null;
        }
        for (let i = 1; i < stops.length; i++) {
          if (stops[i].x === stops[i - 1].x && stops[i].y === stops[i - 1].y) return 'patrol corners must differ from the one before';
          // The square the unit itself stands on counts as free (the map shows it as held by an own unit).
          const home = stops[i].x === u.x && stops[i].y === u.y;
          if (!home && findPath(lmap, { ...u, x: stops[i - 1].x, y: stops[i - 1].y }, stops[i]) === null) return 'no known path';
        }
        const to = patrolTarget(o);
        return to.x === u.x && to.y === u.y ? null : findPath(lmap, u, to) === null ? 'no known path' : null;
      }
      if (!validSquare(s, u, o.a) || !validSquare(s, u, o.b)) return 'target is not an explored square';
      if (o.a.x === o.b.x && o.a.y === o.b.y) return 'patrol ends must differ';
      const map = pathMapFromState(s, u.owner);
      const target = o.toB ? o.b : o.a;
      const path = findPath(map, u, target);
      if (path === null) return 'no known path';
      if (!air) return null;
      const base = patrolBase(s, u, o);
      if (base === null) return NO_PATROL_BASE;
      const far = base === o.a ? o.b : o.a;
      const leg = findPath(map, { type: u.type, x: base.x, y: base.y }, far);
      if (leg === null || 2 * leg.length > (UNIT_STATS[u.type].range ?? 0)) return 'out of range';
      const need = path.length + (target === far ? leg.length : 0);
      return need > (u.fuel ?? 0) ? 'out of range' : null;
    }
    case 'escort': {
      if (UNIT_STATS[u.type].domain !== 'sea' || u.type === 'transport') return 'only warships can escort';
      const tr = s.units.find((x) => x.id === o.transportId);
      if (!tr || tr.owner !== u.owner || tr.type !== 'transport') return 'an escort needs one of your transports to follow';
      if (s.units.some((x) => x !== u && x.owner === u.owner && x.orders?.kind === 'escort' && x.orders.transportId === tr.id)) {
        return 'that transport already has an escort';
      }
      return null;
    }
    default:
      return 'unknown orders';
  }
}

/** The nearest own city by path length (lowest id on ties); ships only use coastal cities. */
export function chooseHome(s: GameState, u: Unit): { city: City; steps: number } | null {
  const map = pathMapFromState(s, u.owner);
  const st = UNIT_STATS[u.type];
  let best: { city: City; steps: number } | null = null;
  for (const city of [...s.cities].sort((a, b) => a.id - b.id)) {
    if (!areFriendly(s, city.owner, u.owner)) continue; // a teammate's city is as good as ours: refuel, repair, shelter
    if (st.domain === 'sea' && !isCoastal(s, city.x, city.y)) continue;
    const path = findPath(map, u, city);
    if (path === null) continue;
    if (st.domain === 'air' && path.length > (u.fuel ?? 0)) continue;
    if (best === null || path.length < best.steps) best = { city, steps: path.length };
  }
  return best;
}

function endOrders(u: Unit, reason: OrdersEndReason, events: GameEvent[]): void {
  // An interrupted patrol is remembered, so the player can resume it.
  if (u.orders?.kind === 'patrol' && (reason === 'enemySighted' || reason === 'blocked')) u.lastPatrol = structuredClone(u.orders);
  u.orders = null;
  u.blockedTurns = 0;
  events.push({ type: 'ordersEnded', unitId: u.id, owner: u.owner, reason });
}

/** Explorers that can capture a city (Army, Armor) also head for known neutral cities, stopping beside them. */
const canTakeCities = (u: Unit): boolean => u.type === 'army' || u.type === 'armor';

/**
 * The squares a hunter is after, as its owner knows them: enemy units of its own element (visible now, or remembered
 * where last seen), and for an Army or Armor also known enemy and neutral cities.
 */
function huntTargets(s: GameState, u: Unit): Set<number> {
  const fog = s.fog[u.owner];
  const domain = UNIT_STATS[u.type].domain;
  const out = new Set<number>();
  for (const e of Object.values(fog.lastSeen)) {
    if (!areFriendly(s, e.owner, u.owner) && (UNIT_STATS[e.type].domain === domain || (domain === 'land' && e.type === 'airbase'))) {
      out.add(index(s, e.x, e.y));
    }
  }
  if (canTakeCities(u)) {
    for (const c of s.cities) {
      const i = index(s, c.x, c.y);
      if (fog.explored[i] && c.owner !== u.owner && !areFriendly(s, fog.knownCityOwner[c.id] ?? null, u.owner)) out.add(i);
    }
  }
  return out;
}

/** Where a hunter heads next: beside the nearest target it can reach, else the nearest unexplored edge. */
function huntGoal(s: GameState, u: Unit, map: ReturnType<typeof pathMapFromState>): Pos | null {
  return findBeside(map, u, huntTargets(s, u)) ?? findFrontier(map, u);
}

/** True when a visible enemy unit stands next to `u`. */
function enemyAdjacent(s: GameState, u: Unit): boolean {
  return s.units.some(
    (e) => !areFriendly(s, e.owner, u.owner) && chebyshev(s, e, u) <= 1 && canPlayerSeeUnit(s, u.owner, e),
  );
}

/** Ids of known cities next to u that are not its own (neutral or enemy), as the owner knows them. */
function adjacentForeignCities(s: GameState, u: Unit): Set<number> {
  const fog = s.fog[u.owner];
  const out = new Set<number>();
  for (const c of s.cities) {
    if (chebyshev(s, u, c) > 1 || !fog.explored[index(s, c.x, c.y)]) continue;
    const owner = c.owner === u.owner ? u.owner : (fog.knownCityOwner[c.id] ?? null);
    if (!areFriendly(s, owner, u.owner)) out.add(c.id);
  }
  return out;
}

/**
 * True when a land or sea unit would have to stop on p: an own unit stands there, it is not a city,
 * and no own host there has room for u. Aircraft may pass over.
 */
function ownBlocks(s: GameState, u: Unit, p: Pos): boolean {
  if (UNIT_STATS[u.type].domain === 'air' || cityAt(s, p.x, p.y)) return false;
  const here = topLevelUnitsAt(s, p.x, p.y).filter((o) => areFriendly(s, o.owner, u.owner) && o !== u);
  if (here.length === 0) return false;
  return !here.some((h) => h.owner === u.owner && hasRoomFor(s, h, u.type)) && !canJoinStack(s, u, p);
}

/** True when an aircraft of ours would have to stay on p: own units stand there (not a city), none can host it or take it into a stack. */
function airWouldStick(s: GameState, u: Unit, p: Pos): boolean {
  if (cityAt(s, p.x, p.y)) return false;
  const here = topLevelUnitsAt(s, p.x, p.y).filter((o) => o !== u);
  if (here.length === 0) return false;
  return !here.some((h) => h.owner === u.owner && hasRoomFor(s, h, u.type)) && !canJoinStack(s, u, p);
}

/**
 * An aircraft with its last move left must end the turn on a free square (or a base). When the next step of its way
 * is an occupied square, this picks the free neighbouring square from which the target is nearest (fuel permitting).
 */
function freeSquareToward(s: GameState, u: Unit, map: ReturnType<typeof pathMapFromState>, target: Pos): Pos | null {
  let best: Pos | null = null;
  let bestLen = Infinity;
  for (const q of neighbors(s, u.x, u.y)) {
    if (map.terrain[index(s, q.x, q.y)] === null) continue;
    const city = cityAt(s, q.x, q.y);
    if (city && !areFriendly(s, city.owner, u.owner)) continue;
    const here = topLevelUnitsAt(s, q.x, q.y);
    if (here.some((o) => !areFriendly(s, o.owner, u.owner))) continue;
    if (airWouldStick(s, u, q)) continue;
    const rest = q.x === target.x && q.y === target.y ? [] : findPath(map, { type: u.type, x: q.x, y: q.y }, target);
    if (rest === null) continue;
    if (u.fuel !== null && !aircraftCanReach(map, rest.length + 1, u.fuel, target, u.type)) continue;
    if (rest.length < bestLen) {
      best = q;
      bestLen = rest.length;
    }
  }
  return best;
}

/**
 * Runs a unit's moving orders (goto, patrol, explore) until it is out of moves or they end. Never attacks.
 * turnStart is true when called from the start-of-turn run: only then does a blocked wait count.
 */
export function executeOrders(
  s: GameState, rng: RandomSource, u: Unit, events: GameEvent[], turnStart = false,
): void {
  let ferryLegChanged = false;
  const arrive = (): void => {
    if (u.orders?.kind === 'goto' && u.orders.ferry) {
      // A ferry carrier: switch legs, or wait (orders kept) for cargo at the pickup or for room ashore at the drop.
      const next = ferryArrive(s, u, u.orders.ferry, events);
      if (next) {
        u.orders.ferry = next;
        ferryLegChanged = true;
      }
      return;
    }
    if (UNIT_STATS[u.type].carries.includes('army') && cityAt(s, u.x, u.y)?.owner === u.owner) {
      unloadCargo(s, u, null, events); // 'nothing to unload' is fine
    }
    if (u.carriedBy !== null) {
      // Boarding already settled the unit's orders: armies sleep, fighters wait for new orders.
      events.push({ type: 'ordersEnded', unitId: u.id, owner: u.owner, reason: 'arrived' });
      return;
    }
    const arrival = u.orders?.kind === 'goto' ? u.orders.arrival : undefined;
    endOrders(u, 'arrived', events);
    if (arrival === 'sentry') u.orders = { kind: 'sentry' };
    else if (arrival === 'repair' && u.damage > 0 && inFriendlyCity(s, u)) u.orders = { kind: 'repair' };
    else if (arrival === 'explore' && validateOrders(s, u, { kind: 'explore' }) === null) u.orders = { kind: 'explore' };
    else pickUpRoute(s, u);
  };

  /**
   * The way is blocked. An aircraft that is not low on fuel waits one turn for it to clear, keeping its orders;
   * anything else asks for new orders at once.
   */
  const blocked = (): void => {
    const range = UNIT_STATS[u.type].range;
    const roomToWait = u.fuel !== null && range !== null && u.fuel > Math.ceil(range / 4);
    if (!roomToWait) return endOrders(u, 'blocked', events);
    if (turnStart) {
      u.blockedTurns += 1;
      if (u.blockedTurns >= 1) return endOrders(u, 'blocked', events);
    }
  };

  for (;;) {
    const o = u.orders;
    if (!s.units.includes(u) || o === null || o.kind === 'sentry' || o.kind === 'repair' || o.kind === 'escort' || u.movesLeft <= 0) return;
    if (o.kind === 'goto' && o.ferry) {
      // The target follows the route (it may have been edited); a lost pickup city or a vanished route ends the orders.
      const route = ferryRouteOf(s, u);
      const pick = route && ferryPickupPlace(s, route.pickup);
      if (!route) delete u.ferry;
      if (!route || !pick || pick.owner !== u.owner) return endOrders(u, 'destinationLost', events);
      o.target = o.ferry === 'pickup' ? { x: pick.x, y: pick.y } : { x: route.drop.x, y: route.drop.y };
    }
    if (o.kind === 'goto' && o.routeCity !== undefined) {
      const dest = s.cities.find((c) => c.id === o.routeCity);
      if (!dest || dest.owner !== u.owner) return endOrders(u, 'destinationLost', events);
    }
    // A hunter already beside its quarry asks for orders before it wanders off elsewhere.
    if (o.kind === 'hunt' && u.carriedBy === null && s.units.some((e) => !areFriendly(s, e.owner, u.owner)
      && UNIT_STATS[e.type].domain === UNIT_STATS[u.type].domain && chebyshev(s, e, u) <= 1 && canPlayerSeeUnit(s, u.owner, e))) {
      return endOrders(u, 'enemySighted', events);
    }
    const map = pathMapFromState(s, u.owner);
    if (o.kind === 'patrol' && o.loop && o.loop.length > 0 && u.fuel !== null) {
      // A waypoint that cannot be flown to (an enemy on it, say) is passed over for this lap.
      const reachable = (p: Pos): boolean => findPath(map, u, p) !== null;
      if (!o.loop.some((p) => (p.x !== o.a.x || p.y !== o.a.y) && reachable(p))) return endOrders(u, 'blocked', events);
      while ((o.leg ?? 0) < o.loop.length && !reachable(patrolTarget(o))) o.leg = (o.leg ?? 0) + 1;
    }
    // An Air Transport bound for open ground drops from beside the square, then flies back with its moves to spare.
    const drop = o.kind === 'goto' && o.ferry === 'drop' ? airDrop(s, u) : null;
    let approach: Pos | null = null;
    if (drop) {
      if (cargoOf(s, u).some((c) => isVehicle(c.type))) return endOrders(u, 'vehicleAboard', events);
      if (airDropReady(s, u, drop)) {
        arrive();
        ferryLegChanged = false;
        continue;
      }
      const way = airDropApproach(s, map, u, u, drop);
      if (way === null) return blocked();
      const home = ferryPickupPlace(s, ferryRouteOf(s, u)!.pickup)!;
      if (way.steps + chebyshev(s, way.pos, home) > (u.fuel ?? 0)) return endOrders(u, 'lowFuel', events);
      approach = way.pos;
    }
    const target = approach ?? (o.kind === 'goto' ? o.target : o.kind === 'patrol' ? patrolTarget(o)
      : o.kind === 'hunt' ? huntGoal(s, u, map) : findFrontier(map, u, canTakeCities(u)));
    if (target === null) return endOrders(u, o.kind === 'hunt' ? 'nothingToHunt' : 'nothingToExplore', events);
    if (u.x === target.x && u.y === target.y) {
      if (o.kind === 'goto') {
        arrive();
        if (u.orders?.kind === 'explore') continue; // it sets out to explore with the moves it has left
        if (ferryLegChanged) {
          ferryLegChanged = false;
          continue; // a ferry carrier sets out on its next leg with the moves it has left
        }
        return;
      }
      if (o.kind === 'patrol') {
        if (o.loop && o.loop.length > 0) o.leg = ((o.leg ?? 0) + 1) % (o.loop.length + 1); // on to the next corner, then home
        else o.toB = !o.toB;
      }
      continue;
    }
    if (o.kind === 'patrol' && u.fuel !== null) {
      // Aircraft: the base may be gone, or the fuel too low for the next leg plus the way back.
      const circuit = o.loop !== undefined && o.loop.length > 0;
      const base = circuit ? (isRefuelBase(s, u, o.a) ? o.a : null) : patrolBase(s, u, o);
      const toTarget = findPath(map, u, target);
      // With its base fine but no way to where it is going, the patrol is blocked, not short of fuel.
      if (base !== null && toTarget === null) return endOrders(u, 'blocked', events);
      let need = Infinity;
      if (circuit) {
        // The rest of the circuit from the corner it is heading for, back to the base.
        if (base !== null && toTarget !== null) need = toTarget.length + circuitLength(s, [o.a, ...o.loop!, o.a], (o.leg ?? 0) + 1);
      } else if (base !== null && toTarget !== null) {
        const far = base === o.a ? o.b : o.a;
        const leg = target === far ? findPath(map, { type: u.type, x: base.x, y: base.y }, far) : [];
        if (leg !== null) need = toTarget.length + leg.length;
      }
      if (need > u.fuel) {
        const home = chooseHome(s, u);
        if (home === null) return endOrders(u, 'lowFuel', events);
        u.lastPatrol = structuredClone(o); // low on fuel: it goes home, and the patrol can be resumed from there
        u.orders = { kind: 'goto', target: { x: home.city.x, y: home.city.y } };
        u.blockedTurns = 0;
        // A patrol tied to a carrier says why it gave up: the carrier is gone or full, or it sailed out of range.
        const why = o.carrier ? (base === null ? 'baseLost' : 'baseOutOfRange') : 'returning';
        events.push({ type: 'ordersEnded', unitId: u.id, owner: u.owner, reason: why });
        continue;
      }
    }
    const path = findPath(map, u, target);
    if (path === null || path.length === 0) return blocked();
    if (u.fuel !== null && o.kind === 'goto' && !drop && !aircraftCanReach(map, path.length, u.fuel, target, u.type)) {
      return endOrders(u, 'lowFuel', events);
    }
    if (u.fuel !== null && o.kind !== 'goto' && path.length > u.fuel) return endOrders(u, 'lowFuel', events);
    let next = path[0];
    // An aircraft on its last move cannot pass over an occupied square (it would be stuck there): it takes a free one instead.
    if (UNIT_STATS[u.type].domain === 'air' && u.movesLeft <= 1 && airWouldStick(s, u, next)) {
      const free = freeSquareToward(s, u, map, target);
      if (free) next = free;
    }
    if (ownBlocks(s, u, next)) {
      const freeMap = pathMapFromState(s, u.owner, { blockOwn: true });
      let detour = findPath(freeMap, u, target);
      if (detour === null && (o.kind === 'explore' || o.kind === 'hunt')) {
        // No free way to that frontier: an explorer heads for the nearest frontier it can still reach round the stack.
        const other = o.kind === 'hunt' ? huntGoal(s, u, freeMap) : findFrontier(freeMap, u, canTakeCities(u));
        if (other) detour = findPath(freeMap, u, other);
      }
      if (detour && detour.length > 0 && !ownBlocks(s, u, detour[0])) next = detour[0];
      else {
        if (turnStart) {
          u.blockedTurns += 1;
          if (u.blockedTurns >= (o.kind === 'goto' && o.wait ? o.wait : 3)) return endOrders(u, 'blocked', events);
        }
        return; // wait: orders kept
      }
    }
    const city = cityAt(s, next.x, next.y);
    if (
      (city && !areFriendly(s, city.owner, u.owner)) ||
      topLevelUnitsAt(s, next.x, next.y).some((x) => !areFriendly(s, x.owner, u.owner))
    ) {
      return blocked();
    }
    const dir = dirBetween(s, u, next);
    const cityBefore = o.kind === 'explore' || o.kind === 'hunt' ? adjacentForeignCities(s, u) : null;
    if (dir === null || moveUnit(s, rng, u, dir, events) !== null) return blocked();
    if (!s.units.includes(u)) return;
    // Boarding (an Airbase or carrier) cleared its orders: a patrol keeps flying, and a ferry flight carries on with its route.
    if ((o.kind === 'patrol' || (o.kind === 'goto' && o.ferry)) && u.carriedBy !== null) u.orders = o;
    u.blockedTurns = 0;
    updateFog(s, u.owner);
    if (drop) {
      if (airDropReady(s, u, drop)) {
        arrive();
        ferryLegChanged = false;
        continue;
      }
    } else if (o.kind === 'goto' && u.x === o.target.x && u.y === o.target.y) return arrive();
    if (u.carriedBy === null && enemyAdjacent(s, u)) return endOrders(u, 'enemySighted', events);
    if (cityBefore && [...adjacentForeignCities(s, u)].some((id) => !cityBefore.has(id))) {
      return endOrders(u, 'cityFound', events);
    }
  }
}

/** An escort attacks an enemy ship beside it only when it is at least this likely to win; otherwise it asks for orders. */
const ESCORT_MIN_WIN = 0.45;

/**
 * Runs an escort's orders: fight a visible enemy ship that is next to it (when the odds are fair), then close up on its
 * transport until it is beside it. It keeps its orders through a won fight; poor odds, a crippling hit or a lost
 * transport end them so that the player decides.
 */
export function executeEscort(s: GameState, rng: RandomSource, u: Unit, events: GameEvent[]): void {
  for (;;) {
    const o = u.orders;
    if (!s.units.includes(u) || o === null || o.kind !== 'escort' || u.movesLeft <= 0) return;
    const tr = s.units.find((x) => x.id === o.transportId && x.owner === u.owner && x.type === 'transport');
    if (!tr) return endOrders(u, 'escortLost', events);
    const foe = s.units.find(
      (e) => e.carriedBy === null && !areFriendly(s, e.owner, u.owner) && chebyshev(s, e, u) <= 1
        && canPlayerSeeUnit(s, u.owner, e) && attackRestriction(s, u, e) === null,
    );
    if (foe) {
      const a = UNIT_STATS[u.type];
      const d = UNIT_STATS[foe.type];
      const rating = fightRatings(s.rules, u.type, foe.type, reliefAt(s, foe.x, foe.y));
      const chance = combatWinChance(
        { attack: attackRating(s.rules, u, rating.attack), shot: a.shot, hits: hitsOf(u), damage: u.damage },
        { defense: rating.defense, shot: d.shot, hits: hitsOf(foe), damage: foe.damage },
      );
      if (chance < ESCORT_MIN_WIN || attackUnit(s, rng, u, foe, events) !== null) return endOrders(u, 'enemySighted', events);
      if (!s.units.includes(u)) return;
      updateFog(s, u.owner);
      if (isCrippled(u)) return endOrders(u, 'crippled', events);
      continue;
    }
    if (chebyshev(s, u, tr) <= 1) return;
    // The shortest way to a free square beside the transport.
    const map = pathMapFromState(s, u.owner);
    let path: Pos[] | null = null;
    for (const n of neighbors(s, tr.x, tr.y)) {
      if (n.x === u.x && n.y === u.y) continue;
      const p = findPath(map, u, n);
      if (p !== null && p.length > 0 && (path === null || p.length < path.length)) path = p;
    }
    if (path === null) return endOrders(u, 'blocked', events);
    const next = path[0];
    if (ownBlocks(s, u, next) || topLevelUnitsAt(s, next.x, next.y).some((x) => !areFriendly(s, x.owner, u.owner))) return;
    const dir = dirBetween(s, u, next);
    if (dir === null || moveUnit(s, rng, u, dir, events) !== null) return;
    if (!s.units.includes(u)) return;
    updateFog(s, u.owner);
  }
}

/** Lets every escort of player `pid` catch up with its transport (after the transport has moved, in id order). */
export function runEscorts(s: GameState, rng: RandomSource, pid: PlayerId, events: GameEvent[]): void {
  const ids = s.units.filter((u) => u.owner === pid && u.orders?.kind === 'escort').map((u) => u.id).sort((a, b) => a - b);
  for (const id of ids) {
    const u = s.units.find((x) => x.id === id);
    if (u) executeEscort(s, rng, u, events);
  }
}
/** Wakes sentries (not cargo) that have a visible enemy next to them. */
export function wakeSentries(s: GameState, pid: PlayerId, events: GameEvent[]): void {
  for (const u of [...s.units]) {
    if (u.owner !== pid || u.orders?.kind !== 'sentry' || u.carriedBy !== null) continue;
    if (enemyAdjacent(s, u)) endOrders(u, 'enemySighted', events);
  }
}

/**
 * True when a visible enemy could take the city `u` is in on its next turn: an Army next to it, an Armor within 2
 * squares, or a Transport within 2 (it may carry them). Aircraft and warships cannot take a city, so they do not count.
 */
export function cityThreatened(s: GameState, u: Unit): boolean {
  return s.units.some((e) => {
    if (areFriendly(s, e.owner, u.owner)) return false;
    const reach = e.type === 'army' ? 1 : e.type === 'armor' || e.type === 'transport' ? 2 : 0;
    return reach > 0 && chebyshev(s, e, u) <= reach && canPlayerSeeUnit(s, u.owner, e);
  });
}

/**
 * Wakes units under repair orders once they are fully repaired, when their city is gone, or when an enemy that could take
 * the city comes near (so the player can act before it falls with the unit inside).
 */
export function wakeRepaired(s: GameState, pid: PlayerId, events: GameEvent[]): void {
  for (const u of [...s.units]) {
    if (u.owner !== pid || u.orders?.kind !== 'repair') continue;
    if (!inFriendlyCity(s, u)) endOrders(u, 'cityLost', events);
    else if (u.damage === 0) endOrders(u, 'repaired', events);
    else if (cityThreatened(s, u)) endOrders(u, 'enemySighted', events);
  }
}

/** Start-of-turn orders for one player: wake sentries and repaired units, then run moving orders in unit-id order. */
export function runPlayerOrders(s: GameState, rng: RandomSource, pid: PlayerId, events: GameEvent[]): void {
  wakeSentries(s, pid, events);
  wakeRepaired(s, pid, events);
  pruneFerryRoutes(s);
  const ids = s.units
    .filter((u) => u.owner === pid && u.orders !== null && u.orders.kind !== 'sentry' && u.orders.kind !== 'repair' && u.orders.kind !== 'escort')
    .sort(frontFirst(s, pid))
    .map((u) => u.id);
  for (const id of ids) {
    const u = s.units.find((x) => x.id === id);
    if (u) executeOrders(s, rng, u, events, true);
  }
  runEscorts(s, rng, pid, events); // after their transports have moved
  updateFog(s, pid);
}

/**
 * Orders the player's units nearest a known enemy (a visible enemy unit, or a known enemy or neutral city) first, then
 * back from there, ties by id; so the front of a column moves before the units behind it and full stacks do not
 * block them. Without any known enemy it is plain id order.
 */
function frontFirst(s: GameState, pid: PlayerId): (a: Unit, b: Unit) => number {
  const fog = s.fog[pid];
  const points: Pos[] = s.units.filter((e) => !areFriendly(s, e.owner, pid) && canPlayerSeeUnit(s, pid, e));
  for (const c of s.cities) {
    if (c.owner === pid || !fog.explored[index(s, c.x, c.y)]) continue;
    if (!areFriendly(s, fog.knownCityOwner[c.id] ?? null, pid)) points.push(c);
  }
  const near = new Map<number, number>();
  const dist = (u: Unit): number => {
    let d = near.get(u.id);
    if (d === undefined) {
      d = points.length === 0 ? 0 : Math.min(...points.map((p) => chebyshev(s, u, p)));
      near.set(u.id, d);
    }
    return d;
  };
  return (a, b) => dist(a) - dist(b) || a.id - b.id;
}

/**
 * An aircraft patrol that starts or ends on an own carrier (not in a city) is tied to that carrier, so the patrol
 * end sails with it, as in the original ("the path will move with the Carrier").
 */
function tieToCarrier(s: GameState, u: Unit, o: Extract<Orders, { kind: 'patrol' }>): void {
  if (UNIT_STATS[u.type].domain !== 'air') return;
  const hostAt = (p: Pos): Unit | undefined =>
    cityAt(s, p.x, p.y) ? undefined
      : topLevelUnitsAt(s, p.x, p.y).find((c) => c.owner === u.owner && canCarry(c.type, u.type));
  const hostA = hostAt(o.a);
  const hostB = o.loop ? undefined : hostAt(o.b); // a circuit's last corner is not a base
  if (hostA) o.carrier = { id: hostA.id, end: 'a' };
  else if (hostB) o.carrier = { id: hostB.id, end: 'b' };
}

/** Validates, stores and (with moves left) immediately runs new orders. Shared by setOrders and goHome. */
export function giveOrders(
  s: GameState, rng: RandomSource, u: Unit, orders: Orders, events: GameEvent[],
): string | null {
  const error = validateOrders(s, u, orders);
  if (error) return error;
  u.orders = structuredClone(orders);
  delete u.lastPatrol;
  if (u.orders.kind === 'patrol') tieToCarrier(s, u, u.orders);
  u.blockedTurns = 0;
  u.unloadNextTurn = false;
  if (u.movesLeft > 0) {
    if (u.orders.kind === 'escort') executeEscort(s, rng, u, events);
    else executeOrders(s, rng, u, events);
  }
  return null;
}
