import { CITY_STRENGTH_HITS, UNIT_STATS, armorBlockedBy, movesLikeArmor, attackBlockedReason, hostHasRoom, isVehicle, step, type Dir, type MapLike, type PlayerView, type Pos, type Unit } from '../engine';

export interface StepTarget {
  x: number;
  y: number;
  dir: Dir;
  attack: boolean;
}

const mapOf = (v: PlayerView): MapLike => ({ width: v.width, height: v.height, wrap: v.wrap, terrain: [] });

export function dirTo(v: PlayerView, from: Pos, to: Pos): Dir | null {
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), from.x, from.y, d as Dir);
    if (p && p.x === to.x && p.y === to.y) return d as Dir;
  }
  return null;
}

const friendlyCityAt = (v: PlayerView, p: Pos): boolean =>
  v.knownCities.some((c) => c.x === p.x && c.y === p.y && c.owner !== null && (c.owner === v.me || v.allies.includes(c.owner)));

/** Where a unit riding in an Air Transport can get out: open land (or a friendly city) beside it. Vehicles only at an Airbase. */
function dropTargets(v: PlayerView, u: Unit, plane: Unit): StepTarget[] {
  if (isVehicle(u.type) && plane.carriedBy === null) return [];
  const out: StepTarget[] = [];
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), plane.x, plane.y, d as Dir);
    if (!p) continue;
    const target = { ...p, dir: d as Dir, attack: false };
    if (v.knownCities.some((c) => c.x === p.x && c.y === p.y)) {
      if (friendlyCityAt(v, p)) out.push(target);
      continue;
    }
    if (v.terrain[p.y * v.width + p.x] !== 'land') continue;
    if (movesLikeArmor(u.type) && v.rules.advancedUnits && armorBlockedBy(v.relief?.[p.y * v.width + p.x] ?? 'clear')) continue;
    if (v.enemies.some((e) => e.visibleNow && e.x === p.x && e.y === p.y)) continue;
    const there = [...v.myUnits.filter((o) => o.carriedBy === null && o.x === p.x && o.y === p.y), ...v.allyUnits.filter((a) => a.x === p.x && a.y === p.y)];
    if (there.length > 0 && !(v.rules.stacking && there.length < 4 && there.every((o) => UNIT_STATS[o.type].domain !== 'air'))) continue;
    out.push(target);
  }
  return out;
}

/** Adjacent squares this unit could plausibly step to, judged only from what the player knows. */
export function stepTargets(v: PlayerView, u: Unit): StepTarget[] {
  if (u.movesLeft <= 0) return [];
  const plane = u.carriedBy === null ? undefined : v.myUnits.find((h) => h.id === u.carriedBy && h.type === 'airCargo');
  if (plane && !friendlyCityAt(v, plane)) return dropTargets(v, u, plane);
  const domain = UNIT_STATS[u.type].domain;
  const out: StepTarget[] = [];
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), u.x, u.y, d as Dir);
    if (!p) continue;
    const terrain = v.terrain[p.y * v.width + p.x];
    if (terrain === null) {
      out.push({ ...p, dir: d as Dir, attack: false });
      continue;
    }
    const city = v.knownCities.find((c) => c.x === p.x && c.y === p.y);
    // An ally's city is as good as our own to enter (units garrison, refuel and repair there).
    const ownCity = city !== undefined && (city.owner === v.me || (city.owner !== null && v.allies.includes(city.owner)));
    // The first enemy seen on the square is the one that would defend; a pairing the rules forbid is no target.
    const foe = v.enemies.find((e) => e.visibleNow && e.x === p.x && e.y === p.y);
    const enemyHere = foe !== undefined;
    if (city && !ownCity) {
      // A spy slips into a player's city without a fight (a neutral city is no use to it).
      if (u.type === 'spy') {
        if (city.owner !== null) out.push({ ...p, dir: d as Dir, attack: false });
      } else if (domain === 'land') out.push({ ...p, dir: d as Dir, attack: true });
      // A Bomber can bomb a player's city (not a neutral one); it never takes it.
      else if (u.type === 'bomber' && v.rules.advancedUnits && city.owner !== null) out.push({ ...p, dir: d as Dir, attack: true });
      // With city strength on, a bombarding ship can fire on a player's city (not a neutral one) until it is nearly spent.
      else if (UNIT_STATS[u.type].bombard && v.rules.cityStrength && city.owner !== null && city.damage < CITY_STRENGTH_HITS - 1) {
        out.push({ ...p, dir: d as Dir, attack: true });
      }
      continue;
    }
    if (foe) {
      if (attackBlockedReason(u.type, foe.type, terrain, u.carriedBy !== null) === null) out.push({ ...p, dir: d as Dir, attack: true });
      continue;
    }
    const friends = v.myUnits.filter((o) => o.x === p.x && o.y === p.y && o.carriedBy === null && o.id !== u.id);
    const host = friends.find(
      (o) => o.type !== 'airCargo' && hostHasRoom(o, v.myUnits.filter((c) => c.carriedBy === o.id), u.type),
    );
    if (ownCity || host) {
      out.push({ ...p, dir: d as Dir, attack: false });
      continue;
    }
    const blocked = movesLikeArmor(u.type) && v.rules.advancedUnits && armorBlockedBy(v.relief?.[p.y * v.width + p.x] ?? 'clear');
    const fits = domain === 'air' || (domain === 'land' ? terrain === 'land' && !blocked : terrain === 'water');
    const allyThere = v.allyUnits.some((a) => a.x === p.x && a.y === p.y);
    if (fits && ((friends.length === 0 && !allyThere) || domain === 'air')) out.push({ ...p, dir: d as Dir, attack: false });
  }
  return out;
}
