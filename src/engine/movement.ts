import type { Dir, GameEvent, GameState, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, armorBlockedBy, armorSlowedBy, isVehicle, movesLikeArmor } from './units';
import { reliefAt, step, terrainAt } from './map';
import { airbaseUnder, canJoinStack, cargoOf, cityAt, destroyUnit, hasRoomFor, isAtRefuelPoint, topLevelUnitsAt } from './query';
import { boardOnDeparture } from './ferry';
import { areFriendly } from './relations';
import { attackCity, attackUnit, bombCity, bombardCity } from './attack';

export function spendMove(u: Unit): void {
  u.movesLeft -= 1;
  u.movedThisTurn = true;
  if (u.fuel !== null) u.fuel -= 1;
}

/** Armor that has just entered rough, river or forest ground (Advanced rules) has its move cut to one, so it is spent. */
export function slowArmor(s: GameState, u: Unit): void {
  if (movesLikeArmor(u.type) && s.rules.advancedUnits && armorSlowedBy(reliefAt(s, u.x, u.y))) u.movesLeft = 0;
}

/** `base` is the Airbase the unit is taking off from, if any. */
export function relocate(s: GameState, u: Unit, to: Pos, events: GameEvent[], base?: Unit): void {
  const from = { x: u.x, y: u.y };
  const leaving = cityAt(s, from.x, from.y);
  u.x = to.x;
  u.y = to.y;
  u.unloadNextTurn = false;
  delete u.hunted; // a spy that moves has got away from the manhunt
  for (const c of cargoOf(s, u)) {
    c.x = to.x;
    c.y = to.y;
  }
  // A transport leaving a city takes the armies there, and a carrier the fighters, up to capacity.
  boardOnDeparture(s, u, from, to, leaving, base);
  // Aircraft patrols tied to this carrier move with it, as in the original.
  for (const p of s.units) {
    const o = p.orders;
    if (o?.kind === 'patrol' && o.carrier?.id === u.id) o[o.carrier.end] = { x: u.x, y: u.y };
  }
  events.push({ type: 'unitMoved', unitId: u.id, from, to: { x: to.x, y: to.y } });
}

export function settleAircraft(s: GameState, u: Unit, events: GameEvent[]): void {
  const st = UNIT_STATS[u.type];
  if (st.domain !== 'air' || !s.units.includes(u)) return;
  if (isAtRefuelPoint(s, u)) {
    u.fuel = st.range;
    u.movesLeft = 0;
  } else if ((u.fuel ?? 0) <= 0) {
    destroyUnit(s, u, 'crashed', events);
  }
}

/** A transport or carrier on sentry wakes (needs orders again) when a unit boards it. */
export function wakeSentry(host: Unit): void {
  if (host.orders?.kind === 'sentry') {
    host.orders = null;
    host.blockedTurns = 0;
  }
}

/** Whether land unit `u` can be put out of an Air Transport onto the square `to`; an error message when not. */
export function leavePlaneError(s: GameState, u: Unit, plane: Unit, to: Pos): string | null {
  if (isVehicle(u.type) && !airbaseUnder(s, plane)) return 'vehicles can only unload in a city or at an Airbase';
  const city = cityAt(s, to.x, to.y);
  if (city) return areFriendly(s, city.owner, u.owner) ? null : 'troops cannot be dropped into that city';
  if (terrainAt(s, to.x, to.y) !== 'land') return 'land units cannot enter water';
  if (movesLikeArmor(u.type) && s.rules.advancedUnits && armorBlockedBy(reliefAt(s, to.x, to.y))) return u.type === 'armor' ? 'Armor cannot enter mountains' : 'an APC cannot enter mountains';
  const here = topLevelUnitsAt(s, to.x, to.y);
  if (here.some((o) => !areFriendly(s, o.owner, u.owner))) return 'troops cannot be dropped onto an enemy';
  return here.length === 0 || canJoinStack(s, u, to) ? null : 'square is occupied';
}

/** Puts a unit out of its Air Transport onto the adjacent square; that is its turn. */
export function leavePlane(s: GameState, u: Unit, plane: Unit, to: Pos, events: GameEvent[]): string | null {
  const error = leavePlaneError(s, u, plane, to);
  if (error) return error;
  u.carriedBy = null;
  relocate(s, u, to, events);
  u.movesLeft = 0;
  u.movedThisTurn = true;
  return null;
}

export function moveUnit(s: GameState, rng: RandomSource, u: Unit, dir: Dir, events: GameEvent[]): string | null {
  if (u.type === 'airbase') return 'an airbase cannot move';
  if (u.movesLeft <= 0) return 'unit has no moves left';
  const to = step(s, u.x, u.y, dir);
  if (!to) return 'cannot move off the map';
  const st = UNIT_STATS[u.type];
  // Where it is leaving from: an Airbase it is parked at, or an Air Transport it is riding in.
  const base = airbaseUnder(s, u);
  const plane = u.carriedBy === null ? undefined : s.units.find((h) => h.id === u.carriedBy && h.type === 'airCargo');

  const city = cityAt(s, to.x, to.y);
  // Leaving an Air Transport anywhere but a friendly city is an airdrop (or, at an Airbase, an unloading).
  const from = cityAt(s, u.x, u.y);
  if (plane && !(from && areFriendly(s, from.owner, u.owner))) return leavePlane(s, u, plane, to, events);
  if (u.type === 'spy' && city && !areFriendly(s, city.owner, u.owner)) {
    // A spy slips into an enemy city without a fight, and unseen.
    if (city.owner === null) return 'a spy has no business in a neutral city';
    spendMove(u);
    u.carriedBy = null;
    relocate(s, u, to, events);
    return null;
  }
  if (city && !areFriendly(s, city.owner, u.owner)) {
    if (u.type === 'troopTransport') return 'an APC cannot attack';
    if (u.type === 'airCargo') return 'an Air Transport cannot attack';
    if (st.domain === 'sea' && st.bombard && s.rules.cityStrength && city.owner !== null) return bombardCity(s, rng, u, city, events);
    if (st.domain === 'air' && u.type === 'bomber' && s.rules.advancedUnits) return bombCity(s, rng, u, city, events);
    if (st.domain !== 'land') return 'only land units can attack cities';
    return attackCity(s, rng, u, city, events);
  }

  const occupants = topLevelUnitsAt(s, to.x, to.y);
  // An enemy spy hiding in a city is no obstacle (the city's own units come and go); out in the open it is found by walking into it.
  const foes = occupants.filter((o) => !areFriendly(s, o.owner, u.owner) && !(city && o.type === 'spy'));
  // Against a stack the best defender takes the fight (attackUnit picks it).
  if (foes.length > 0) return attackUnit(s, rng, u, foes[0], events);

  if (city) {
    spendMove(u);
    u.carriedBy = null;
    relocate(s, u, to, events, base);
    settleAircraft(s, u, events);
    return null;
  }

  const host = occupants.find(
    (o) => o.owner === u.owner && o.type !== 'airCargo' && hasRoomFor(s, o, u.type),
  );
  if (host) {
    spendMove(u);
    u.carriedBy = host.id;
    u.orders = st.domain === 'air' ? null : { kind: 'sentry' };
    wakeSentry(host);
    relocate(s, u, to, events, base);
    settleAircraft(s, u, events);
    return null;
  }

  const terrain = terrainAt(s, to.x, to.y);
  if (st.domain === 'land' && terrain !== 'land') return 'land units cannot enter water';
  if (movesLikeArmor(u.type) && s.rules.advancedUnits && armorBlockedBy(reliefAt(s, to.x, to.y))) return u.type === 'armor' ? 'Armor cannot enter mountains' : 'an APC cannot enter mountains';
  if (st.domain === 'sea' && terrain !== 'water') return 'ships can only enter water or friendly cities';
  if (occupants.length > 0 && !canJoinStack(s, u, to)) {
    const canPassOver = st.domain === 'air' && u.movesLeft > 1 && (u.fuel ?? 0) > 1;
    if (!canPassOver) return 'square is occupied';
  }

  spendMove(u);
  u.carriedBy = null;
  relocate(s, u, to, events, base);
  slowArmor(s, u);
  settleAircraft(s, u, events);
  return null;
}
