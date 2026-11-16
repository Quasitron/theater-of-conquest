/**
 * What's New: the player-facing highlights of recent versions, newest first. Add an entry here in the same commit that
 * bumps the version (see docs/versions.md for the full technical list). Pictures live in public/art/whatsnew/.
 */
export interface WhatsNewEntry {
  /** Stable id, also what "seen" is remembered by. */
  id: string;
  /** The version the feature arrived in (the first one, for a feature that grew over several). */
  version: string;
  date: string;
  title: string;
  text: string[];
  /** Picture under /art/whatsnew/ and what it shows. */
  image?: { src: string; alt: string };
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: 'whats-new',
    version: '0.9.83',
    date: '2026-11-16',
    title: "What's New",
    text: ['This page. The latest features are listed here, newest first, with pictures where they help. A dot on the button means there is something you have not seen yet. It is on the title screen and in the game, next to Manual.'],
  },
  {
    id: 'unload-route',
    version: '0.9.82',
    date: '2026-11-15',
    title: 'Unloaded units follow city routes',
    text: [
      'Units you unload from a transport in one of your cities (by hand, or from a ferry route) now take that city\'s production route, just like units that are built or walk in.',
    ],
  },
  {
    id: 'war-torn-display',
    version: '0.9.80',
    date: '2026-11-15',
    title: 'War-torn cities: clearer numbers',
    text: [
      'A war-torn city now says how fast it builds as a percent of full capacity, and how many turns until it is back to full. The city screen shows a bar for it.',
    ],
    image: { src: 'war-torn.png', alt: 'City screen showing a war-torn city building at 57% of full speed with a recovery bar' },
  },
  {
    id: 'ferry-dialog',
    version: '0.9.79',
    date: '2026-11-15',
    title: 'The Ferry Route dialog',
    text: [
      'Existing Routes is a table: tick Wait until full, Join or Remove this carrier, or Change Route for everyone on it. Click "N carriers" to see who is on a route and take any of them off. Nothing changes until Save and Close; Cancel drops your edits.',
      'While you pick the pickup city and drop square, a blue banner reminds you this is a route, not a move order. The drop square must be a sea tile (or one of your cities).',
    ],
    image: { src: 'ferry-dialog.png', alt: 'The Ferry Route dialog with a table of existing routes' },
  },
  {
    id: 'ferry-routes',
    version: '0.9.75',
    date: '2026-11-15',
    title: 'Ferry routes',
    text: [
      'A Transport (any carrier except a Carrier) can run a standing route: go to a pickup city, take on cargo, sail to a drop square, put everything ashore and come back, again and again. Routes are shared, so several ships can run the same one. Press F, or use Ferry Route on the unit.',
      'Turn on the Routes map to see them: blue dashed lines with arrows, grey when paused (an enemy came near; press Y to resume).',
    ],
    image: { src: 'ferry-route.png', alt: 'A dashed ferry route drawn across the sea between two cities' },
  },
  {
    id: 'stacking',
    version: '0.9.74',
    date: '2026-11-15',
    title: 'House rule: Stackable units',
    text: [
      'Off by default. Up to 3 of your land or sea units may share a square outside a city, to clear traffic jams. An attack on a stack fights its best defender, one unit at a time, so a stack can still be wiped out. Click a stack repeatedly to cycle through its units.',
    ],
  },
  {
    id: 'end-turn-spinner',
    version: '0.9.73',
    date: '2026-11-15',
    title: 'End Turn feedback',
    text: ['Pressing End Turn now shows a spinner and "Computer players are moving…" while the other players\' turns are worked out.'],
  },
  {
    id: 'replay-priority',
    version: '0.9.72',
    date: '2026-11-15',
    title: 'Your own battles replay first',
    text: ['When there are more fights to replay than fit at the start of your turn, the ones against you come first, then your teammates\', then everyone else\'s.'],
  },
];

/** Entries shown before "Older changes". */
export const WHATS_NEW_RECENT = 5;

const SEEN_KEY = 'toc.whatsNewSeen';

/** The newest entry's id, or null. */
export const latestEntryId = (): string | null => WHATS_NEW[0]?.id ?? null;

/** True when this browser has not opened What's New since the newest entry was added. */
export function hasUnseenNews(): boolean {
  try {
    return globalThis.localStorage?.getItem(SEEN_KEY) !== latestEntryId();
  } catch {
    return false;
  }
}

/** Remembers that the newest entry has been seen. */
export function markNewsSeen(): void {
  try {
    const id = latestEntryId();
    if (id) globalThis.localStorage?.setItem(SEEN_KEY, id);
  } catch {
    // Storage may be blocked; the dot then simply stays.
  }
}
