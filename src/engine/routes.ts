import type { City, CityRoute, GameState, Orders, PlayerId, Pos, Unit, UnitType } from './types';
import { UNIT_STATS, UNIT_TYPES } from './units';
import { aircraftCanReach, findPath, pathMapFromState, type PathMap } from './path';
import { validateOrders } from './orders';

/** Which unit types could travel a route from one city to another, on the owner's known map. */
export function routeUnitTypes(map: PathMap, from: Pos, to: Pos): Record<UnitType, boolean> {
  const out = {} as Record<UnitType, boolean>;
  for (const type of UNIT_TYPES) {
    const path = findPath(map, { type, x: from.x, y: from.y }, to);
    const range = UNIT_STATS[type].range;
    out[type] = path !== null && path.length > 0 && (range === null || aircraftCanReach(map, path.length, range, to));
  }
  return out;
}

/** Returns an error message, or null when `route` is a valid route for `city` set by `pid`. */
export function validateRoute(s: GameState, pid: PlayerId, city: City, route: Omit<CityRoute, 'by'>): string | null {
  if (typeof route !== 'object' || route === null) return 'invalid route';
  const dest = s.cities.find((c) => c.id === route.destId);
  if (!dest) return 'no such destination city';
  if (dest.owner !== pid) return 'the destination must be your city';
  if (dest.id === city.id) return 'the destination must be a different city';
  if (!Array.isArray(route.types) || route.types.length === 0) return 'pick at least one unit type';
  if (new Set(route.types).size !== route.types.length || !route.types.every((t) => UNIT_TYPES.includes(t))) {
    return 'unknown unit type';
  }
  if (!Number.isInteger(route.blockWait) || route.blockWait < 1 || route.blockWait > 9) return 'invalid blocked wait';
  if (route.arrival !== 'wait' && route.arrival !== 'sentry') return 'invalid arrival mode';
  const can = routeUnitTypes(pathMapFromState(s, pid), city, dest);
  const bad = route.types.find((t) => !can[t]);
  return bad ? `${UNIT_STATS[bad].name} cannot make that trip` : null;
}

/** Returns an error message, or null when `routes` is a valid set of routes for `city`: each valid, no unit type on two of them. */
export function validateRoutes(s: GameState, pid: PlayerId, city: City, routes: Omit<CityRoute, 'by'>[]): string | null {
  const seen = new Set<UnitType>();
  for (const route of routes) {
    const err = validateRoute(s, pid, city, route);
    if (err) return err;
    for (const t of route.types) {
      if (seen.has(t)) return `${UNIT_STATS[t].name} is on two routes`;
      seen.add(t);
    }
  }
  return null;
}

/** Gives a freshly built unit its city's route orders, when its type is on one of the routes and the way is open. */
export function applyRoute(s: GameState, city: City, u: Unit): void {
  const route = city.routes?.find((r) => r.types.includes(u.type));
  if (!route) return;
  const dest = s.cities.find((c) => c.id === route.destId);
  if (!dest || dest.owner !== u.owner) return;
  const orders: Orders = {
    kind: 'goto',
    target: { x: dest.x, y: dest.y },
    routeCity: dest.id,
    wait: route.blockWait,
    ...(route.arrival === 'sentry' ? { arrival: 'sentry' as const } : {}),
  };
  if (validateOrders(s, u, orders) === null) u.orders = orders;
}

/**
 * A unit that has just stopped in an own city, with no orders, takes that city's route when its type is on it.
 * Called for units that arrive by their own orders or by hand. A unit that arrives on sentry keeps it.
 */
export function pickUpRoute(s: GameState, u: Unit): void {
  if (u.orders !== null || u.carriedBy !== null || !s.units.includes(u)) return;
  const city = s.cities.find((c) => c.x === u.x && c.y === u.y);
  if (!city || city.owner !== u.owner) return;
  dropStaleRoute(s, city);
  applyRoute(s, city, u);
}

/** Drops the city's routes that no longer hold: the setter lost the city, or the destination is no longer theirs. */
export function dropStaleRoute(s: GameState, city: City): void {
  if (!city.routes) return;
  const keep = city.routes.filter((route) => {
    const dest = s.cities.find((c) => c.id === route.destId);
    return city.owner === route.by && !!dest && dest.owner === route.by;
  });
  if (keep.length === 0) delete city.routes;
  else if (keep.length !== city.routes.length) city.routes = keep;
}
