import type { GameEvent, GameState, PlayerId, Unit, UnitType } from './types';
import { UNIT_STATS, rankOf } from './units';
import { chebyshev, index, normalize } from './map';
import { cityAt, destroyUnit } from './query';
import { areFriendly, teammatesOf } from './relations';

const SIGHT = 1;
const ADVANCED_SIGHT = 2;
const MARKER_LIFETIME = 3;

interface Observer {
  x: number;
  y: number;
  kind: UnitType | 'city';
}

function observersOf(s: GameState, pid: PlayerId): Observer[] {
  const obs: Observer[] = [];
  for (const u of s.units) if (areFriendly(s, u.owner, pid)) obs.push({ x: u.x, y: u.y, kind: u.type });
  for (const c of s.cities) if (areFriendly(s, c.owner, pid)) obs.push({ x: c.x, y: c.y, kind: 'city' });
  return obs;
}

/**
 * How far an observer sees. In the Advanced rules all air units, cities and Airbases see 2 squares; everything else sees 1.
 */
function sightOf(s: GameState, o: Observer): number {
  if (!s.rules.advancedUnits) return SIGHT;
  return o.kind === 'city' || o.kind === 'airbase' || UNIT_STATS[o.kind].domain === 'air' ? ADVANCED_SIGHT : SIGHT;
}

function observerSees(s: GameState, o: Observer, target: { type: UnitType; x: number; y: number }): boolean {
  const canSeeTarget = !(o.kind === 'submarine' && UNIT_STATS[target.type].domain !== 'sea');
  // Advanced rules: anything that can see aircraft sees them from 2 squares away.
  const range = s.rules.advancedUnits && UNIT_STATS[target.type].domain === 'air' && canSeeTarget ? Math.max(sightOf(s, o), ADVANCED_SIGHT) : sightOf(s, o);
  if (chebyshev(s, o, target) > range) return false;
  if (target.type === 'submarine' && o.kind !== 'city' && !UNIT_STATS[o.kind].seesSubs) return false;
  return canSeeTarget;
}

export function visibleSquares(s: GameState, pid: PlayerId): Set<number> {
  const vis = new Set<number>();
  for (const o of observersOf(s, pid)) {
    const sight = sightOf(s, o);
    for (let dy = -sight; dy <= sight; dy++) {
      for (let dx = -sight; dx <= sight; dx++) {
        const p = normalize(s, o.x + dx, o.y + dy);
        if (p) vis.add(index(s, p.x, p.y));
      }
    }
  }
  return vis;
}

/** A spy standing in a city of pid's side: it uncovers enemy spies in and beside that city. */
function spyWatchers(s: GameState, pid: PlayerId): Unit[] {
  return s.units.filter((u) => {
    if (u.type !== 'spy' || u.carriedBy !== null || !areFriendly(s, u.owner, pid)) return false;
    const c = cityAt(s, u.x, u.y);
    return !!c && areFriendly(s, c.owner, pid);
  });
}

/** Spies are unseen by ordinary sight; one is seen only while it stands beside a city of the other side that holds a spy of its own. */
export function canPlayerSeeUnit(s: GameState, pid: PlayerId, target: Unit): boolean {
  if (target.type === 'spy') {
    if (target.carriedBy !== null || cityAt(s, target.x, target.y)) return false;
    return spyWatchers(s, pid).some((w) => chebyshev(s, w, target) <= 1);
  }
  if (target.carriedBy !== null) return false;
  if (cityAt(s, target.x, target.y)) return false;
  return observersOf(s, pid).some((o) => observerSees(s, o, target));
}

export function reveal(s: GameState, pid: PlayerId, u: Unit): void {
  if (areFriendly(s, pid, u.owner)) return;
  s.fog[pid].lastSeen[u.id] = { unitId: u.id, type: u.type, owner: u.owner, x: u.x, y: u.y, turnSeen: s.turn, ...(rankOf(u.wins, u.type) > 0 ? { rank: rankOf(u.wins, u.type) } : {}) };
}

/**
 * A city has changed hands: its old owner knows it, and so do the old owner's teammates (they share its sight, and may
 * have lost sight of the city with the garrison that was killed, so would otherwise keep showing it as theirs).
 */
export function noteCityTaken(s: GameState, cityId: number, from: PlayerId | null, newOwner: PlayerId): void {
  if (from === null) return;
  for (const p of [from, ...teammatesOf(s, from)]) s.fog[p].knownCityOwner[cityId] = newOwner;
}

export function updateFog(s: GameState, pid: PlayerId): void {
  const fog = s.fog[pid];
  const vis = visibleSquares(s, pid);
  for (const i of vis) fog.explored[i] = 1;
  for (const c of s.cities) if (vis.has(index(s, c.x, c.y))) fog.knownCityOwner[c.id] = c.owner;

  // Observers by square, so a target is only tested against the few that are within reach (no one sees beyond 2).
  const observers = observersOf(s, pid);
  const grid = new Map<number, Observer[]>();
  for (const o of observers) {
    const k = index(s, o.x, o.y);
    const list = grid.get(k);
    if (list) list.push(o);
    else grid.set(k, [o]);
  }
  const citySquares = new Set<number>();
  for (const c of s.cities) citySquares.add(index(s, c.x, c.y));
  const anyObserverSees = (t: { type: UnitType; x: number; y: number }): boolean => {
    for (let dy = -ADVANCED_SIGHT; dy <= ADVANCED_SIGHT; dy++) {
      for (let dx = -ADVANCED_SIGHT; dx <= ADVANCED_SIGHT; dx++) {
        const p = normalize(s, t.x + dx, t.y + dy);
        const list = p ? grid.get(index(s, p.x, p.y)) : undefined;
        if (list && list.some((o) => observerSees(s, o, t))) return true;
      }
    }
    return false;
  };

  const seenNow = new Set<number>();
  for (const u of s.units) {
    if (areFriendly(s, u.owner, pid)) continue;
    // Same rules as canPlayerSeeUnit; ordinary units go through the observer grid instead of every observer.
    const sees = u.type === 'spy' ? canPlayerSeeUnit(s, pid, u)
      : u.carriedBy === null && !citySquares.has(index(s, u.x, u.y)) && anyObserverSees(u);
    if (sees) {
      reveal(s, pid, u);
      seenNow.add(u.id);
    }
  }

  for (const key of Object.keys(fog.lastSeen)) {
    const e = fog.lastSeen[Number(key)];
    if (seenNow.has(e.unitId)) continue;
    const couldSeeIt = anyObserverSees(e);
    if (couldSeeIt || s.turn - e.turnSeen >= MARKER_LIFETIME) delete fog.lastSeen[Number(key)];
  }
}

/** An enemy spy inside a city that holds a spy of the city's owner is discovered and shot. */
export function catchSpies(s: GameState, events: GameEvent[]): void {
  for (const spy of [...s.units]) {
    if (spy.type !== 'spy' || spy.carriedBy !== null || !cityAt(s, spy.x, spy.y)) continue;
    const watcher = spyWatchers(s, cityAt(s, spy.x, spy.y)!.owner ?? -1).find((w) => w.x === spy.x && w.y === spy.y && !areFriendly(s, w.owner, spy.owner));
    if (watcher) {
      events.push({ type: 'spyFound', cityId: cityAt(s, spy.x, spy.y)!.id, owner: cityAt(s, spy.x, spy.y)!.owner!, by: spy.owner });
      destroyUnit(s, spy, 'caught', events, watcher.owner);
    }
  }
}
