import type { Dir, GameState, PlayerId, Pos, Relief, Terrain, Unit, UnitType } from './types';
import type { PlayerView } from './view';
import type { MapLike } from './map';
import { DIRS, chebyshev, index, normalize as normalizeSquare } from './map';
import { areFriendly } from './relations';
import { stackLimitOf } from './query';
import { UNIT_STATS, armorBlockedBy, armorSlowedBy, cargoCapacity, effectiveMove, movesLikeArmor } from './units';

export interface PathMap {
  width: number;
  height: number;
  wrap: boolean;
  me: PlayerId;
  turn: number;
  /** null = unexplored. */
  terrain: (Terrain | null)[];
  /** Known ground on land squares; absent on a map without terrain or when the Advanced units rule is off. */
  relief?: (Relief | null)[];
  /** Known cities by square index; own cities = me. */
  cityOwner: Map<number, PlayerId | null>;
  /** Squares with an enemy last seen this turn. */
  enemy: Set<number>;
  /** Own top-level units on non-city squares; room[type] = free cargo space (in slots) on hosts there that carry `type`. */
  own: Map<number, { count: number; air: number; room: Partial<Record<UnitType, number>> }>;
  /** Stacking rule: whether it is on (the limit itself depends on the unit: stackLimitOf). */
  stacking: boolean;
  /** When true, non-air units treat squares holding own units (without room) as walls. */
  blockOwn: boolean;
}

/** Geometry only: normalize and chebyshev never read terrain. */
const geo = (m: Pick<PathMap, 'width' | 'height' | 'wrap'>): MapLike => m as unknown as MapLike;
const normalize = (m: Pick<PathMap, 'width' | 'height' | 'wrap'>, x: number, y: number) => normalizeSquare(geo(m), x, y);

type Mobile = Pick<Unit, 'type' | 'x' | 'y'>;

function buildOwn(
  m: Pick<PathMap, 'width' | 'terrain'>,
  units: Unit[],
): PathMap['own'] {
  const cargo = new Map<number, number>();
  for (const u of units) if (u.carriedBy !== null) cargo.set(u.carriedBy, (cargo.get(u.carriedBy) ?? 0) + UNIT_STATS[u.type].slots);
  const own: PathMap['own'] = new Map();
  for (const u of units) {
    if (u.carriedBy !== null) continue;
    const i = u.y * m.width + u.x;
    if (m.terrain[i] === 'city') continue;
    let e = own.get(i);
    if (!e) own.set(i, (e = { count: 0, air: 0, room: {} }));
    if (u.type !== 'airbase') e.count++; // an Airbase takes no place in a stack
    if (UNIT_STATS[u.type].domain === 'air') e.air++;
    // Nothing walks or flies aboard an Air Transport out in the open: it is loaded in a city or at an Airbase.
    if (u.type === 'airCargo') continue;
    for (const carried of UNIT_STATS[u.type].carries) e.room[carried] = (e.room[carried] ?? 0) + cargoCapacity(u) - (cargo.get(u.id) ?? 0);
  }
  return own;
}

/** A friend's unit in the open: it blocks the square, or with the stacking rule counts towards the square's stack. */
function addFriend(own: PathMap['own'], enemy: Set<number>, stacking: boolean, i: number, type: UnitType): void {
  if (!stacking) {
    enemy.add(i);
    return;
  }
  let e = own.get(i);
  if (!e) own.set(i, (e = { count: 0, air: 0, room: {} }));
  if (type !== 'airbase') e.count++;
  if (UNIT_STATS[type].domain === 'air') e.air++;
}

export function pathMapFromState(s: GameState, pid: PlayerId, opts: { blockOwn?: boolean } = {}): PathMap {
  const fog = s.fog[pid];
  const terrain = s.terrain.map((t, i) => (fog.explored[i] ? t : null));
  const relief = s.relief && s.rules.advancedUnits ? s.relief.map((r, i) => (fog.explored[i] ? r : null)) : undefined;
  const cityOwner = new Map<number, PlayerId | null>();
  for (const c of s.cities) {
    const i = index(s, c.x, c.y);
    if (!fog.explored[i]) continue;
    // An ally's city counts as ours: units may enter, refuel and repair there.
    cityOwner.set(i, areFriendly(s, c.owner, pid) ? pid : (fog.knownCityOwner[c.id] ?? null));
  }
  const enemy = new Set<number>();
  for (const e of Object.values(fog.lastSeen)) if (e.turnSeen === s.turn) enemy.add(index(s, e.x, e.y));
  const m = { width: s.width, terrain };
  const own = buildOwn(m, s.units.filter((u) => u.owner === pid));
  // Allied units standing in the open block the square as an enemy would (nothing may share it), unless the stacking rule
  // lets land or sea units join them (then they only count towards the square's limit); a city can always be shared.
  for (const u of s.units) {
    if (u.owner === pid || u.carriedBy !== null || !areFriendly(s, u.owner, pid)) continue;
    const i = index(s, u.x, u.y);
    if (s.terrain[i] !== 'city') addFriend(own, enemy, s.rules.stacking, i, u.type);
  }
  return {
    width: s.width, height: s.height, wrap: s.wrap, me: pid, turn: s.turn,
    terrain, ...(relief ? { relief } : {}), cityOwner, enemy,
    own,
    stacking: s.rules.stacking,
    blockOwn: opts.blockOwn ?? false,
  };
}

export function pathMapFromView(v: PlayerView, opts: { blockOwn?: boolean } = {}): PathMap {
  const cityOwner = new Map<number, PlayerId | null>();
  for (const c of v.knownCities) cityOwner.set(c.y * v.width + c.x, c.owner !== null && v.allies.includes(c.owner) ? v.me : c.owner);
  const enemy = new Set<number>();
  for (const e of v.enemies) if (e.turnSeen === v.turn) enemy.add(e.y * v.width + e.x);
  const m = { width: v.width, terrain: v.terrain };
  const own = buildOwn(m, v.myUnits);
  // A city can always be shared, so allied units inside one neither block it nor count towards a stack.
  for (const a of v.allyUnits) if (v.terrain[a.y * v.width + a.x] !== 'city') addFriend(own, enemy, v.rules.stacking, a.y * v.width + a.x, a.type);
  return {
    width: v.width, height: v.height, wrap: v.wrap, me: v.me, turn: v.turn,
    terrain: v.terrain, ...(v.relief && v.rules.advancedUnits ? { relief: v.relief } : {}), cityOwner, enemy,
    own,
    stacking: v.rules.stacking,
    blockOwn: opts.blockOwn ?? false,
  };
}

function enterable(m: PathMap, t: UnitType, i: number, isTarget: boolean): boolean {
  const terrain = m.terrain[i];
  if (terrain === null || m.enemy.has(i)) return false;
  const city = m.cityOwner.has(i) ? m.cityOwner.get(i) : terrain === 'city' ? null : undefined;
  if (city !== undefined && city !== m.me) return false;
  const domain = UNIT_STATS[t].domain;
  const own = m.own.get(i);
  // A host with room can be boarded wherever it floats, whatever the terrain.
  if (own && isTarget && (own.room[t] ?? 0) >= UNIT_STATS[t].slots) return true;
  if (domain === 'land' && terrain !== 'land' && city !== m.me) return false;
  if (movesLikeArmor(t) && armorBlockedBy(m.relief?.[i] ?? 'clear')) return false;
  if (domain === 'sea' && terrain !== 'water' && city !== m.me) return false;
  if (own) {
    // Stacking rule: a land or sea unit may join up to the limit of its own, no aircraft among them.
    const joins = m.stacking && own.air === 0 && own.count < stackLimitOf(domain);
    return isTarget ? joins : !m.blockOwn || domain === 'air' || joins;
  }
  return true;
}

function neighborsOf(m: PathMap, i: number): number[] {
  const x = i % m.width;
  const y = (i - x) / m.width;
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const p = normalize(m, x + dx, y + dy);
    if (p) out.push(p.y * m.width + p.x);
  }
  return out;
}

interface HeapItem { f: number; seq: number; i: number }

function less(a: HeapItem, b: HeapItem): boolean {
  return a.f < b.f || (a.f === b.f && a.seq < b.seq);
}

function push(h: HeapItem[], item: HeapItem): void {
  h.push(item);
  let c = h.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (!less(h[c], h[p])) break;
    [h[c], h[p]] = [h[p], h[c]];
    c = p;
  }
}

function pop(h: HeapItem[]): HeapItem {
  const top = h[0];
  const last = h.pop()!;
  if (h.length > 0) {
    h[0] = last;
    let p = 0;
    for (;;) {
      const l = 2 * p + 1;
      const r = l + 1;
      let s = p;
      if (l < h.length && less(h[l], h[s])) s = l;
      if (r < h.length && less(h[r], h[s])) s = r;
      if (s === p) break;
      [h[s], h[p]] = [h[p], h[s]];
      p = s;
    }
  }
  return top;
}

/** Extra path cost of a square that spends Armor's whole turn (the cost of going round is usually less). */
const SLOW_COST = 0.9;

/** Steps after the start, ending at `to`; [] when already there; null when unreachable. */
export function findPath(m: PathMap, u: Mobile, to: Pos): Pos[] | null {
  if (u.x === to.x && u.y === to.y) return [];
  const start = u.y * m.width + u.x;
  const goal = to.y * m.width + to.x;
  const g = new Map<number, number>([[start, 0]]);
  const from = new Map<number, number>();
  const closed = new Set<number>();
  const heap: HeapItem[] = [];
  let seq = 0;
  // Among equally short paths, prefer the one that hugs the straight line from start to goal: each square costs a
  // tiny extra amount for how far it lies from that line. The extra is far too small (even summed over a whole
  // path) to ever make a longer path win, so path lengths are unchanged.
  const wrapW = m.wrap ? m.width : 0;
  let lineDx = to.x - u.x;
  if (wrapW) lineDx = ((((lineDx + wrapW / 2) % wrapW) + wrapW) % wrapW) - wrapW / 2;
  const lineDy = to.y - u.y;
  const lineLen = Math.max(1, Math.abs(lineDx), Math.abs(lineDy));
  const offLine = (i: number): number => {
    const x = i % m.width;
    const dy = Math.floor(i / m.width) - u.y;
    let best = Infinity;
    for (const dx of wrapW ? [x - u.x, x - u.x - wrapW, x - u.x + wrapW] : [x - u.x]) {
      best = Math.min(best, Math.abs(dx * lineDy - dy * lineDx) / lineLen);
    }
    return best;
  };
  const TIE = 1e-6;
  push(heap, { f: chebyshev(geo(m), u, to), seq: seq++, i: start });
  while (heap.length > 0) {
    const { i } = pop(heap);
    if (closed.has(i)) continue;
    closed.add(i);
    if (i === goal) {
      const path: Pos[] = [];
      for (let c = goal; c !== start; c = from.get(c)!) path.push({ x: c % m.width, y: Math.floor(c / m.width) });
      return path.reverse();
    }
    const gi = g.get(i)!;
    for (const n of neighborsOf(m, i)) {
      if (closed.has(n) || !enterable(m, u.type, n, n === goal)) continue;
      // Armor loses the rest of its turn in rough, river and forest ground, so those squares cost it a little more.
      const slow = movesLikeArmor(u.type) && armorSlowedBy(m.relief?.[n] ?? 'clear') ? SLOW_COST : 0;
      const gn = gi + 1 + slow + TIE * offLine(n);
      if (gn >= (g.get(n) ?? Infinity)) continue;
      g.set(n, gn);
      from.set(n, i);
      const p = { x: n % m.width, y: Math.floor(n / m.width) };
      push(heap, { f: gn + chebyshev(geo(m), p, to), seq: seq++, i: n });
    }
  }
  return null;
}

/**
 * Nearest reachable square (distance >= 1) with an unexplored neighbor; lowest index on ties. With `neutralCities`, a
 * square beside a known neutral city counts too, and wins a tie on distance (so an explorer heads for a city it can see
 * when that is nearer than the unexplored ground). A city the unit already stands beside is left out, so an explorer
 * told to carry on does not turn back to it.
 */
export function findFrontier(m: PathMap, u: Mobile, neutralCities = false): Pos | null {
  const start = u.y * m.width + u.x;
  const isNeutral = (i: number) => m.terrain[i] === 'city' && m.cityOwner.get(i) === null;
  const skip = new Set<number>();
  if (neutralCities) for (const n of neighborsOf(m, start)) if (isNeutral(n)) skip.add(n);
  const seen = new Set<number>([start]);
  let level = [start];
  while (level.length > 0) {
    const next: number[] = [];
    for (const i of level) {
      for (const n of neighborsOf(m, i)) {
        if (seen.has(n) || !enterable(m, u.type, n, false)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    const open = next.filter((i) => enterable(m, u.type, i, true));
    const cityHit = neutralCities ? open.filter((i) => neighborsOf(m, i).some((n) => isNeutral(n) && !skip.has(n))) : [];
    const hit = cityHit.length > 0 ? cityHit : open.filter((i) => neighborsOf(m, i).some((n) => m.terrain[n] === null));
    if (hit.length > 0) {
      const best = Math.min(...hit);
      return { x: best % m.width, y: Math.floor(best / m.width) };
    }
    level = next;
  }
  return null;
}

/**
 * The nearest reachable square (distance >= 1) beside one of the `targets` (square indices), lowest index on ties.
 * A target the unit already stands beside is left out. Null when none can be reached.
 */
export function findBeside(m: PathMap, u: Mobile, targets: ReadonlySet<number>): Pos | null {
  const start = u.y * m.width + u.x;
  const near = new Set(neighborsOf(m, start));
  const wanted = new Set([...targets].filter((t) => !near.has(t)));
  if (wanted.size === 0) return null;
  const seen = new Set<number>([start]);
  let level = [start];
  while (level.length > 0) {
    const next: number[] = [];
    for (const i of level) {
      for (const n of neighborsOf(m, i)) {
        if (seen.has(n) || !enterable(m, u.type, n, false)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    const hit = next.filter((i) => enterable(m, u.type, i, true) && neighborsOf(m, i).some((n) => wanted.has(n)));
    if (hit.length > 0) {
      const best = Math.min(...hit);
      return { x: best % m.width, y: Math.floor(best / m.width) };
    }
    level = next;
  }
  return null;
}

/** Turn on which a unit that needs `steps` moves arrives (this turn if movesLeft covers it). */
export function arrivalTurn(u: Pick<Unit, 'type' | 'damage' | 'movesLeft'>, steps: number, turn: number): number {
  if (steps <= u.movesLeft) return turn;
  return turn + Math.ceil((steps - u.movesLeft) / effectiveMove(u as Unit));
}

/**
 * Turn on which a unit following `path` arrives, step by step: an Armor entering rough, river or forest ground
 * loses the rest of that turn's moves. `extraSteps` are plain moves past the end of the path (a spy's step into a city).
 */
export function pathArrivalTurn(
  m: Pick<PathMap, 'relief' | 'width'>, u: Pick<Unit, 'type' | 'damage' | 'movesLeft'>, path: readonly Pos[], extraSteps: number, turn: number,
): number {
  const perTurn = effectiveMove(u as Unit);
  let moves = u.movesLeft;
  let t = turn;
  const total = path.length + extraSteps;
  for (let k = 0; k < total; k++) {
    if (moves <= 0) {
      t++;
      moves = perTurn;
    }
    moves--;
    const p = path[k];
    if (p && movesLikeArmor(u.type) && armorSlowedBy(m.relief?.[p.y * m.width + p.x] ?? 'clear')) moves = 0;
  }
  return t;
}

/** Direction from `from` to an adjacent square `to`, or null when not adjacent. */
export function dirBetween(m: Pick<PathMap, 'width' | 'height' | 'wrap'>, from: Pos, to: Pos): Dir | null {
  for (let d = 0; d < 8; d++) {
    const p = normalize(m, from.x + DIRS[d][0], from.y + DIRS[d][1]);
    if (p && p.x === to.x && p.y === to.y) return d as Dir;
  }
  return null;
}

/** Whether an aircraft with `fuel` can safely make a go-to of `steps` to `target`: it must keep one unit of fuel, unless it ends at a refuel point it knows (own city, or own carrier with room). */
export function aircraftCanReach(m: PathMap, steps: number, fuel: number, target: Pos, type: UnitType = 'fighter'): boolean {
  if (steps < fuel) return true;
  if (steps > fuel) return false;
  const i = target.y * m.width + target.x;
  return m.cityOwner.get(i) === m.me || (m.own.get(i)?.room[type] ?? 0) > 0;
}
