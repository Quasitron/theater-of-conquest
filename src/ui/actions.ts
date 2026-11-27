import { UNIT_STATS, canBecomeAirbase, canFerry, canHunt, chebyshev, hostHasRoom, isVehicle, rankOf, unitDisplayName, type MapLike, type Orders, type PlayerView, type Pos, type Unit } from '../engine';
import type { ActionId } from './keys';

const inOwnCity = (v: PlayerView, u: Pick<Unit, 'x' | 'y'>) => v.myCities.some((c) => c.x === u.x && c.y === u.y);
const inAllyCity = (v: PlayerView, u: Pick<Unit, 'x' | 'y'>) => v.knownCities.some((c) => c.x === u.x && c.y === u.y && c.owner !== null && v.allies.includes(c.owner));

/** The cities routes may use: your own, then your teammates'. */
export const friendlyCities = (v: PlayerView): PlayerView['knownCities'] => [
  ...v.knownCities.filter((c) => c.owner === v.me),
  ...v.knownCities.filter((c) => c.owner !== null && c.owner !== v.me && v.allies.includes(c.owner)),
];

/** The own Airbase an aircraft is parked at, if it is at one. */
export const airbaseUnder = (view: PlayerView, u: Unit): Unit | undefined =>
  u.carriedBy === null ? undefined : view.myUnits.find((h) => h.id === u.carriedBy && h.type === 'airbase');

/** Whether an Air Transport is in a city of yours or a teammate's, or at an Airbase: where vehicles can get out. */
export const planeOnGround = (view: PlayerView, plane: Unit): boolean =>
  inOwnCity(view, plane) || inAllyCity(view, plane) || airbaseUnder(view, plane) !== undefined;

/** Own units on the transport's square (or, for an Air Transport at an Airbase, beside it) that could board it, by id. */
export function loadCandidates(view: PlayerView, t: Unit): Unit[] {
  if (UNIT_STATS[t.type].carries.length === 0) return [];
  const aboard = view.myUnits.filter((c) => c.carriedBy === t.id);
  const base = t.type === 'airCargo' && airbaseUnder(view, t) !== undefined;
  // Only units that still fit: a full transport has nothing to pick (so Load is not offered).
  return view.myUnits
    .filter((u) => u.id !== t.id && u.carriedBy === null && hostHasRoom(t, aboard, u.type) && (base
      ? u.movesLeft > 0 && !inOwnCity(view, u) && chebyshev(view as unknown as MapLike, u, t) === 1
      : u.x === t.x && u.y === t.y))
    .sort((a, b) => a.id - b.id);
}

/** Own transports an escort could be sent to: not carried, with no escort of their own yet (apart from u itself). */
export function escortable(view: PlayerView, u: Unit): Unit[] {
  return view.myUnits.filter((t) => t.type === 'transport' && t.carriedBy === null
    && !view.myUnits.some((e) => e.id !== u.id && e.orders?.kind === 'escort' && e.orders.transportId === t.id));
}

export const UNIT_BUTTONS: ActionId[] = [
  'next', 'skip', 'hold', 'sentry', 'repair', 'moveTo', 'explore', 'hunt', 'load', 'unload', 'patrol', 'escort', 'ferry', 'resumeFerry', 'resumePatrol', 'airbase', 'sabotage', 'hurt', 'incite', 'goHome', 'clearOrders', 'center', 'info', 'disband',
];

/** True when a spy's own report on the city it stands in shows no garrison at all. */
function emptyGarrison(view: PlayerView, u: Unit): boolean {
  const city = view.knownCities.find((c) => c.x === u.x && c.y === u.y);
  return !!city?.intel && city.intel.garrison.length === 0;
}

export function availableActions(view: PlayerView, u: Unit): Record<ActionId, boolean> {
  const st = UNIT_STATS[u.type];
  const air = st.domain === 'air';
  const inCity = inOwnCity(view, u);
  const hasCargo = view.myUnits.some((c) => c.carriedBy === u.id);
  const fixed = u.type === 'airbase'; // an Airbase never moves
  // A spy inside an enemy city (not a neutral one) can sabotage it, and an Elite one can try to turn it.
  const inEnemyCity = u.type === 'spy' && u.carriedBy === null && u.movesLeft > 0 && view.knownCities.some((c) => c.x === u.x && c.y === u.y && c.owner !== null && c.owner !== view.me && !view.allies.includes(c.owner));
  return {
    next: true,
    skip: !fixed,
    hold: !fixed,
    moveTo: !fixed,
    center: true,
    endTurn: true,
    disband: true,
    load: st.carries.length > 0 && (inCity || inAllyCity(view, u) || u.type === 'troopTransport' || (u.type === 'airCargo' && airbaseUnder(view, u) !== undefined)) && loadCandidates(view, u).length > 0,
    // In flight an Air Transport can only put out troops.
    unload: hasCargo && (u.type !== 'airCargo' || planeOnGround(view, u) || view.myUnits.some((c) => c.carriedBy === u.id && !isVehicle(c.type))),
    // Home is any city of yours or a teammate's (an ally's city refuels and repairs too).
    goHome: !fixed && !inCity && !inAllyCity(view, u) && (view.myCities.length > 0 || view.knownCities.some((c) => c.owner !== null && view.allies.includes(c.owner))),
    patrol: !fixed,
    // A warship (not a transport) can escort when a transport of ours at sea has no escort yet.
    escort: st.domain === 'sea' && u.type !== 'transport' && u.carriedBy === null && escortable(view, u).length > 0,
    ferry: canFerry(u.type) && (u.carriedBy === null || airbaseUnder(view, u) !== undefined),
    // A carrier whose route was interrupted (an enemy came near, say) carries on with it.
    resumeFerry: u.ferry !== undefined && u.orders === null && view.ferryRoutes.some((r) => r.id === u.ferry),
    // A patrol that was interrupted (an enemy sighted, a block, low fuel) can be picked up again.
    resumePatrol: u.orders === null && u.lastPatrol !== undefined && !fixed,
    info: true,
    fit: true,
    explore: !air && !fixed,
    hunt: canHunt(u.type),
    sentry: !fixed && (!air || inCity || u.carriedBy !== null),
    // An Army or Armor on open land with a move left can turn itself into an Airbase (Advanced units rule); it is for good.
    airbase: view.rules.advancedUnits && canBecomeAirbase(u.type) && u.movesLeft > 0 && u.carriedBy === null && !inCity
      && view.terrain[u.y * view.width + u.x] === 'land',
    sabotage: view.rules.advancedUnits && inEnemyCity,
    // Nothing to damage in an empty city (its spy-eyed garrison list is empty).
    hurt: view.rules.advancedUnits && inEnemyCity && !emptyGarrison(view, u),
    incite: view.rules.advancedUnits && inEnemyCity && rankOf(u.wins, u.type) === 3,
    clearOrders: u.orders !== null,
    // Damaged: in a city of ours it sits there until repaired, elsewhere it first goes to the nearest suitable city.
    repair: !fixed && u.damage > 0 && u.carriedBy === null && u.orders?.kind !== 'repair' && (inCity || view.myCities.length > 0),
  };
}

/** The unit-panel buttons that apply to u, in UNIT_BUTTONS order. */
export function visibleButtons(view: PlayerView, u: Unit): ActionId[] {
  const avail = availableActions(view, u);
  return UNIT_BUTTONS.filter((id) => avail[id]);
}

/** "Boston → Brest": a ferry route as the player reads it (the drop square is named by the city on it, else its coordinates). */
export function ferryLabel(view: PlayerView, r: { pickup: { name: string }; drop: { x: number; y: number } }): string {
  const city = view.knownCities.find((c) => c.x === r.drop.x && c.y === r.drop.y);
  return `${r.pickup.name} → ${city ? city.name : `${r.drop.x},${r.drop.y}`}`;
}

/** The orders of u in words, naming the transport an escort follows. */
export function ordersText(view: PlayerView, u: Unit): string {
  const route = u.ferry === undefined ? undefined : view.ferryRoutes.find((r) => r.id === u.ferry);
  const kind = route?.air ? 'Air route' : 'Ferry';
  if (route && u.orders === null) return `${kind} paused: ${ferryLabel(view, route)}`;
  if (route && u.orders?.kind === 'goto' && u.orders.ferry) {
    const here = u.x === route.pickup.x && u.y === route.pickup.y;
    const leg = u.orders.ferry === 'drop' ? 'to drop' : here ? `waiting at ${route.pickup.name}${route.waitFull ? ' for a full load' : ' for cargo'}` : `to ${route.pickup.name}`;
    return `${kind}: ${ferryLabel(view, route)} (${leg})`;
  }
  if (u.orders === null && u.lastPatrol) return 'None (patrol interrupted: Resume Patrol)';
  return describeOrders(u.orders, (id) => {
    const t = view.myUnits.find((x) => x.id === id);
    return t ? unitDisplayName(t) : undefined;
  }, (p) => view.knownCities.find((c) => c.x === p.x && c.y === p.y)?.name);
}

export function describeOrders(
  o: Orders | null,
  nameOf?: (id: number) => string | undefined,
  /** A city's name when the square is one, so orders read "Go-to Darnah" rather than coordinates. */
  cityAt?: (p: Pos) => string | undefined,
): string {
  if (o === null) return 'None';
  const where = (p: Pos) => cityAt?.(p) ?? `${p.x},${p.y}`;
  switch (o.kind) {
    case 'sentry': return 'Sentry';
    case 'goto': return `Go-to ${where(o.target)}`;
    case 'patrol':
      if (o.loop && o.loop.length > 0) return `Patrol circuit of ${o.loop.length + 1} legs from ${where(o.a)}`;
      return `Patrol ${where(o.a)} ↔ ${where(o.b)}`;
    case 'explore': return 'Explore';
    case 'hunt': return 'Hunt';
    case 'repair': return 'Repair';
    case 'escort': { const n = nameOf?.(o.transportId); return n ? `Escort ${n}` : 'Escort'; }
  }
}
