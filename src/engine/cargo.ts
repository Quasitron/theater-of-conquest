import type { GameEvent, GameState, Unit } from './types';
import { UNIT_STATS, canCarry, cargoUsed } from './units';
import { cargoOf, cargoRoom, cityAt } from './query';
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

/** Boards the given own armies (or fighters) onto a carrier standing in its owner's city. */
export function loadUnits(s: GameState, t: Unit, unitIds: number[]): string | null {
  if (UNIT_STATS[t.type].carries.length === 0) return 'this unit cannot carry cargo';
  if (!inOwnCity(s, t)) return 'can only load in one of your cities';
  if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length) return 'nothing to load';
  const boarding: Unit[] = [];
  for (const id of unitIds) {
    const u = s.units.find((x) => x.id === id);
    if (!u || u.owner !== t.owner) return 'not your unit';
    if (u.carriedBy !== null || u.x !== t.x || u.y !== t.y || !canCarry(t.type, u.type)) return 'unit cannot board here';
    boarding.push(u);
  }
  if (cargoUsed(boarding) > cargoRoom(s, t)) return 'not enough room';
  for (const u of boarding) {
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
  const chosen = unitIds === null ? cargo : cargo.filter((c) => unitIds.includes(c.id));
  if (chosen.length === 0) return 'nothing to unload';
  if (unitIds !== null && !unitIds.every((id) => cargo.some((c) => c.id === id))) return 'unit is not aboard';
  const release = inFriendlyCity(s, t);
  for (const c of chosen) {
    c.orders = null;
    if (release) c.carriedBy = null;
  }
  // Units put ashore in a city of ours take its production route, as ones that walk in do.
  if (release) for (const c of chosen) pickUpRoute(s, c);
  events.push({ type: 'cargoUnloaded', transportId: t.id, owner: t.owner, unitIds: chosen.map((c) => c.id) });
  return null;
}
