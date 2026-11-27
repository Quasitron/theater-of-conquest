import type { GameEvent, GameState, Unit } from './types';
import { UNIT_STATS, canCarry, cargoUsed, isVehicle } from './units';
import { airbaseUnder, cargoOf, cargoRoom, cityAt, stackLimitOf, topLevelUnitsAt } from './query';
import { chebyshev } from './map';
import { pickUpRoute } from './routes';
import { areFriendly } from './relations';

export function inOwnCity(s: GameState, t: Unit): boolean {
  return cityAt(s, t.x, t.y)?.owner === t.owner;
}

/** In a city of the carrier's owner or a teammate's: cargo can walk out there. */
export function inFriendlyCity(s: GameState, t: Unit): boolean {
  const city = cityAt(s, t.x, t.y);
  return !!city && areFriendly(s, city.owner, t.owner);
}

/** Whether `troops` can all stand on the square `carrier` is about to leave (a city always has room). */
function roomWhenLeft(s: GameState, carrier: Unit, troops: Unit[]): boolean {
  if (cityAt(s, carrier.x, carrier.y)) return true;
  const others = topLevelUnitsAt(s, carrier.x, carrier.y).filter((o) => o !== carrier);
  if (others.length === 0 && troops.length === 1) return true;
  return s.rules.stacking && others.length + troops.length <= stackLimitOf('land') && others.every((o) => UNIT_STATS[o.type].domain !== 'air');
}

/** Boards the given own armies (or fighters) onto a carrier standing in its owner's city or an ally's. */
export function loadUnits(s: GameState, t: Unit, unitIds: number[]): string | null {
  if (UNIT_STATS[t.type].carries.length === 0) return 'this unit cannot carry cargo';
  // An APC (Armored Personnel Carrier) loads on any land square; ships and carriers only in a friendly city. An Air
  // Transport also loads at an Airbase, from the squares around it.
  const air = t.type === 'airCargo';
  const atBase = air && airbaseUnder(s, t) !== undefined;
  if (!inFriendlyCity(s, t) && t.type !== 'troopTransport' && !atBase) return air ? 'can only load in a friendly city or at an Airbase' : 'can only load in a friendly city';
  if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length) return 'nothing to load';
  const boarding: Unit[] = [];
  for (const id of unitIds) {
    const u = s.units.find((x) => x.id === id);
    if (!u || u.owner !== t.owner) return 'not your unit';
    const near = atBase ? chebyshev(s, u, t) === 1 : u.x === t.x && u.y === t.y;
    if (u.carriedBy !== null || !near || !canCarry(t.type, u.type)) return 'unit cannot board here';
    if (atBase && u.movesLeft <= 0) return 'that unit has no moves left';
    boarding.push(u);
  }
  if (cargoUsed(boarding) > cargoRoom(s, t)) return 'not enough room';
  if (air && [...boarding, ...cargoOf(s, t)].filter((c) => isVehicle(c.type)).length > 1) return 'an Air Transport takes only one vehicle';
  if (air) {
    // A loaded APC boards empty: its troops get out where it stands, when there is room for all of them.
    for (const apc of boarding.filter((c) => c.type === 'troopTransport')) {
      const troops = cargoOf(s, apc);
      if (troops.length === 0) continue;
      if (!roomWhenLeft(s, apc, troops)) return 'unload the APC first: there is no room for its troops here';
      for (const c of troops) {
        c.carriedBy = null;
        c.orders = null;
      }
    }
  }
  for (const u of boarding) {
    if (atBase) {
      u.movesLeft = 0;
      u.x = t.x;
      u.y = t.y;
    }
    u.carriedBy = t.id;
    u.orders = { kind: 'sentry' };
  }
  t.unloadNextTurn = false;
  if (t.orders?.kind === 'sentry') t.orders = null; // boarding wakes a sentried transport
  return null;
}

/** Wakes cargo (null = all of it); in an own city it also leaves the transport. */
export function unloadCargo(s: GameState, t: Unit, unitIds: number[] | null, events: GameEvent[]): string | null {
  const cargo = cargoOf(s, t);
  let chosen = unitIds === null ? cargo : cargo.filter((c) => unitIds.includes(c.id));
  if (chosen.length === 0) return 'nothing to unload';
  if (unitIds !== null && !unitIds.every((id) => cargo.some((c) => c.id === id))) return 'unit is not aboard';
  const release = inFriendlyCity(s, t);
  // In flight only troops can get out (they jump); vehicles wait for a city or an Airbase.
  if (t.type === 'airCargo' && !release && !airbaseUnder(s, t)) {
    chosen = chosen.filter((c) => !isVehicle(c.type));
    if (chosen.length === 0) return 'vehicles can only unload in a city or at an Airbase';
  }
  for (const c of chosen) {
    c.orders = null;
    if (release) c.carriedBy = null;
  }
  // Units put ashore in a city of ours take its production route, as ones that walk in do.
  if (release) for (const c of chosen) pickUpRoute(s, c);
  events.push({ type: 'cargoUnloaded', transportId: t.id, owner: t.owner, unitIds: chosen.map((c) => c.id) });
  return null;
}
