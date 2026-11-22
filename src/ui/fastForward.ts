import type { PlayerId } from '../engine';
import type { LogEntry } from '../app/session';

/**
 * Fast-forward: End Turn is pressed for you, turn after turn, until something happens that you would want to see.
 * Used for the quiet opening (everyone waiting for a first unit) and by the Advance Time button. It only ever sends ordinary
 * End Turn commands, so saved games and replays are unaffected.
 */

/** A fast-forward gives up after this many turns in a row, so a game where nothing ever happens does not run away. */
export const FAST_FORWARD_MAX_TURNS = 40;

/**
 * Whether the turn that has just begun for `me` was quiet: since the start of my previous turn nothing happened that is
 * worth stopping for. Only the start of turns and the moves of my own and my teammates' units are quiet. Anything else
 * stops it: a unit produced (mine or a teammate's: the log only holds what I may know), a fight or a city taken in my
 * sight, an enemy unit moving where I can see it, orders that ended, a promotion, a player out, and so on.
 * (A freshly sighted enemy or a unit that needs orders are checked by the caller.)
 */
export function turnWasQuiet(
  entries: readonly LogEntry[], me: PlayerId, myUnitIds: ReadonlySet<number>, allyUnitIds: ReadonlySet<number>,
): boolean {
  const starts: number[] = [];
  entries.forEach((e, i) => {
    if (e.event.type === 'turnStarted' && e.event.player === me) starts.push(i);
  });
  // The latest start is the turn now under way; the one before it opens the span (everything since my last turn).
  const from = starts.length >= 2 ? starts[starts.length - 2] : 0;
  for (const { event } of entries.slice(from)) {
    if (event.type === 'turnStarted') continue;
    if (event.type === 'unitMoved' && (myUnitIds.has(event.unitId) || allyUnitIds.has(event.unitId))) continue;
    return false;
  }
  return true;
}

export const SKIP_OPENING_KEY = 'conquest.skipOpening';
let skipOpening: boolean | null = null;

/** Whether the quiet opening turns are skipped on its own (on by default): End Turn on turn 1 then fast-forwards. */
export function getSkipOpening(): boolean {
  if (skipOpening !== null) return skipOpening;
  try {
    const raw = globalThis.localStorage?.getItem(SKIP_OPENING_KEY);
    if (raw === 'true' || raw === 'false') return (skipOpening = raw === 'true');
  } catch { /* storage blocked or unreadable: use the default */ }
  return (skipOpening = true);
}

export function setSkipOpening(next: boolean): boolean {
  skipOpening = next;
  try {
    globalThis.localStorage?.setItem(SKIP_OPENING_KEY, String(next));
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  return next;
}

/** Forgets the cached choice (for tests). */
export function resetSkipOpening(): void {
  skipOpening = null;
}
