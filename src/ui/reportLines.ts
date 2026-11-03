import { UNIT_STATS, unitDisplayName, type PlayerId, type PlayerView, type Pos, type UnitType } from '../engine';
import type { LogEntry } from '../app/session';
import { describeEvent, type DescribeLookup } from './describe';
import { fightsFromEvents, type Fight } from './fights';

export interface SentryLine {
  unitId: number;
  type: UnitType;
  /** The unit's display name. */
  name: string;
  /** The square it is on (its carrier's, when it is aboard one). */
  at: Pos;
  /** Where it is, in words: in a city, aboard a ship, or at coordinates. */
  where: string;
  /** Whole turns it has been on sentry; 0 for one put on sentry this turn. */
  turns: number;
}

/** Your units on sentry, longest-waiting first (then by unit id), so one forgotten long ago comes top of the list. */
export function sentryLines(view: PlayerView): SentryLine[] {
  const cityAt = (x: number, y: number) => view.myCities.find((c) => c.x === x && c.y === y);
  return view.myUnits
    .filter((u) => u.orders?.kind === 'sentry')
    .map((u) => {
      const host = u.carriedBy !== null ? view.myUnits.find((h) => h.id === u.carriedBy) : undefined;
      const at = host ? { x: host.x, y: host.y } : { x: u.x, y: u.y };
      const city = cityAt(at.x, at.y);
      const hostName = host ? unitDisplayName(host) : '';
      return {
        unitId: u.id, type: u.type, name: unitDisplayName(u), at,
        where: host ? `aboard ${hostName}` : city ? `in ${city.name}` : `at ${at.x},${at.y}`,
        turns: Math.max(0, view.turn - (u.sentrySince ?? view.turn)),
      };
    })
    .sort((a, b) => b.turns - a.turns || a.unitId - b.unitId);
}

export interface BattleLine {
  turn: number;
  /** "Computer's Cruiser attacked your Army and won." */
  text: string;
  /** The square that was attacked. */
  at: Pos;
  /** True when the attacker won. */
  attackerWon: boolean;
  /** How the result is for me and my team: good (green), bad (red), or neither (a fight between others). */
  outcome: 'good' | 'bad' | 'neutral';
  /** The fight, so the report's Show button can play it on the map. */
  fight?: Fight;
}

/**
 * Battles that others started and that you could see, since the start of your previous turn (so everything the
 * other players did between your last turn and this one). Empty when the log does not reach back that far, as
 * after a reload.
 */
export function battlesAgainstMe(
  entries: readonly LogEntry[], me: PlayerId, names: string[], lookup: DescribeLookup, allies: readonly PlayerId[] = [],
): BattleLine[] {
  const mine = (p: PlayerId | null) => p !== null && (p === me || allies.includes(p));
  const starts: number[] = [];
  entries.forEach((e, i) => {
    if (e.event.type === 'turnStarted' && e.event.player === me) starts.push(i);
  });
  // The latest start is the turn now under way; the one before it opens the span we want.
  const from = starts.length >= 2 ? starts[starts.length - 2] : 0;
  const span = entries.slice(from);
  // The fights are built the same way as the lines (same filters), so the nth line goes with the nth fight.
  const fights = fightsFromEvents(span.map((x) => x.event), (ev) => describeEvent(ev, me, names, lookup))
    .filter((f) => f.attackerOwner !== me);
  const out: BattleLine[] = [];
  for (const entry of span) {
    const e = entry.event;
    if (e.type !== 'combat' || e.attackerOwner === me) continue;
    const text = describeEvent(e, me, names, lookup);
    if (text === null) continue;
    // Good for my side when my team's attacker wins or my team's defender holds; the reverse is bad.
    const outcome = mine(e.attackerOwner) ? (e.attackerWon ? 'good' : 'bad') : mine(e.defender.owner) ? (e.attackerWon ? 'bad' : 'good') : 'neutral';
    out.push({ turn: entry.turn, text, at: { x: e.x, y: e.y }, attackerWon: e.attackerWon, outcome, fight: fights[out.length] });
  }
  return out;
}

export interface Sighting {
  type: UnitType;
  /** Name of the player it belongs to. */
  owner: string;
  at: Pos;
  /** The turn it was last seen. */
  turnSeen: number;
  /** In sight right now, as opposed to last seen. */
  visibleNow: boolean;
}

/** Enemy units seen since your last turn: those in sight now first, then the most recently seen. */
export function recentSightings(view: PlayerView, names: string[]): Sighting[] {
  return view.enemies
    .filter((e) => e.visibleNow || e.turnSeen >= view.turn - 1)
    .map((e): Sighting => ({
      type: e.type, owner: names[e.owner] ?? `Player ${e.owner + 1}`, at: { x: e.x, y: e.y },
      turnSeen: e.turnSeen, visibleNow: e.visibleNow,
    }))
    .sort((a, b) => Number(b.visibleNow) - Number(a.visibleNow) || b.turnSeen - a.turnSeen
      || UNIT_STATS[a.type].name.localeCompare(UNIT_STATS[b.type].name));
}

/**
 * The other players knocked out since the start of your previous turn (the same span the Combat report covers), in the
 * order it happened. Empty when the log does not reach back that far, as after a reload.
 */
export function newEliminations(entries: readonly LogEntry[], me: PlayerId): PlayerId[] {
  const starts: number[] = [];
  entries.forEach((e, i) => {
    if (e.event.type === 'turnStarted' && e.event.player === me) starts.push(i);
  });
  const from = starts.length >= 2 ? starts[starts.length - 2] : 0;
  const out: PlayerId[] = [];
  for (const { event: e } of entries.slice(from)) {
    if (e.type === 'playerEliminated' && e.player !== me && !out.includes(e.player)) out.push(e.player);
  }
  return out;
}