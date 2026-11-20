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
    id: 'patrol-from-ally-city',
    version: '0.9.124',
    date: '2026-11-19',
    title: 'Patrols from an ally\'s city',
    text: ['Bombers and fighters can now patrol from (or to) a teammate\'s city. It counts as a base for refuelling, as it already did for Go Home and Sentry. Before, the game said "patrol must start or end at a city or carrier" unless the city was your own.'],
  },
  {
    id: 'capture-lists-losses',
    version: '0.9.123',
    date: '2026-11-19',
    title: 'Captured cities list what was lost',
    text: ['When you capture a city, the log now names each enemy unit that was inside and went down with it (for example "Computer\'s Army was lost when its city fell"), so you can see what the capture cost them.'],
  },
  {
    id: 'stack-count-allies',
    version: '0.9.122',
    date: '2026-11-19',
    title: 'Stack counts include allies',
    text: ['A stack\'s number badge now counts allied units on the square too, since they use up places in the limit of 4 (an allied unit could hide under your stack and make it look as if there was room). Pointing at a full stack now says "stack full" instead of "No known path".'],
  },
  {
    id: 'patrol-circuits',
    version: '0.9.121',
    date: '2026-11-19',
    title: 'Patrols with waypoints',
    text: ['Press P, then click each waypoint in turn (a triangle, a stretch of coast), then click the start (the city, carrier or square the unit stands on) or press Done. The unit visits the waypoints in order, returns to the start and goes round again; for out and back, click the far square and then the start. The route you are drawing and other patrols show as dashed lines. Aircraft can do this too: they must start at a city or carrier, and a waypoint is refused when the whole route back to the base would not fit in their fuel.'],
  },
  {
    id: 'news-shows-version',
    version: '0.9.120',
    date: '2026-11-19',
    title: 'Version shown in What\'s New',
    text: ['The What\'s New window now says which version you are running, right under its title.'],
  },
  {
    id: 'fight-rank-badges',
    version: '0.9.119',
    date: '2026-11-19',
    title: 'Rank badges in fights',
    text: ['Units in an attack replay now show their rank chevrons while they fight, and a unit promoted in the fight gets its new chevron just as the promotion chime plays, instead of only after the battle.'],
  },
  {
    id: 'quit-button',
    version: '0.9.118',
    date: '2026-11-19',
    title: 'Quit button',
    text: ['The title menu has a Quit button when the game is installed as an app. In a browser tab it is hidden, since a page cannot close its own tab.'],
  },
  {
    id: 'aircraft-shared-square',
    version: '0.9.117',
    date: '2026-11-19',
    title: 'No more stuck End Turn from stacked aircraft',
    text: ['If an aircraft flies over another unit and stops on its square, you now have to move it on before you can go to the next unit (Next, Standby, Hold and Sentry are held back with a reminder). This stops End Turn from being refused at the end because a plane was left sitting on top of another.'],
  },
  {
    id: 'unload-stack',
    version: '0.9.116',
    date: '2026-11-19',
    title: 'Landings land as a stack',
    text: ['With the stacking rule on, unloading a transport (and a ferry dropping its cargo) now puts the units ashore together on one square, up to 4, so the weaker ones are covered. Spread them out afterwards if you prefer.'],
  },
  {
    id: 'ferry-waitfull-fix',
    version: '0.9.114',
    date: '2026-11-19',
    title: 'Ferry fix: no endless waiting for a full load',
    text: ['A ferry set to Wait until full could sit at its pickup city for ever when the units there could not fill its last space (for example, one space left and only Armor, which needs two). It now sails with what fits, and a ferry with just one space free (5 of 6) counts as full instead of waiting for one more Army or Spy. Its orders also say what it is waiting for: cargo, or a full load.'],
  },
  {
    id: 'replay-attacker-cue',
    version: '0.9.110',
    date: '2026-11-19',
    title: 'Replays show who is attacking',
    text: ['In a battle replay the attacker now has a pulsing orange ring and an arrow pointing at its target, and the shots come from its side, so you can tell attacker from defender at a glance. Replays are also a little quicker than before: the shots phase is shorter and the pauses between fights are shorter at every pace.'],
  },
  {
    id: 'ferry-no-reload',
    version: '0.9.109',
    date: '2026-11-18',
    title: 'Ferry fix: no re-loading at the drop city',
    text: ['When a ferry route\'s drop square is a city, the transport used to pick the units it had just landed back up as it left, and carry them back to the pickup. It now sails back empty.'],
  },
  {
    id: 'ai-shore-bombardment',
    version: '0.9.106',
    date: '2026-11-18',
    title: 'Computer warships shell your coast',
    text: [
      'Computer Cruisers and Battleships now fire on your land units standing on the shore, and sail toward ones they saw recently. Expect to lose a few units on the beach if you leave them exposed.',
      'They are careful about it: a ship shells only when it expects to come away nearly unhurt, and holds fire when it is badly damaged or a stronger enemy warship is close by. They also shell a city only when one of their own or a teammate\'s units is near enough to attack it afterwards.',
    ],
  },
  {
    id: 'city-crippled-badge',
    version: '0.9.105',
    date: '2026-11-18',
    title: 'Wounded units in a city show their damage cross',
    text: ['A crippled unit in one of your cities now shows its red cross when it blinks for orders, as it does on open ground.'],
  },
  {
    id: 'stack-under-badges',
    version: '0.9.104',
    date: '2026-11-18',
    title: 'No misleading damage marks in a stack',
    text: ['When you are giving orders to a unit in a stack, the red damage cross and low-fuel mark of the faded units underneath are hidden, so they no longer look like the active unit\'s.'],
  },
  {
    id: 'gohome-allies',
    version: '0.9.103',
    date: '2026-11-18',
    title: 'Go Home also finds your teammates\' cities',
    text: ['Go Home (and Repair) now heads for the nearest city of yours or a teammate\'s, so a bomber or ship that is only near allied cities can still use it. A unit already standing in an allied city counts as home.'],
  },
  {
    id: 'stack-under-fade',
    version: '0.9.101',
    date: '2026-11-18',
    title: 'Easier to see which unit in a stack has the orders',
    text: ['When the unit you are giving orders to shares a square with others, the other units on that square are now drawn much fainter, so the blinking unit stands out on the map.'],
  },
  {
    id: 'replay-double-fight',
    version: '0.9.100',
    date: '2026-11-18',
    title: 'Replay: a unit that fights twice no longer appears early',
    text: ['A unit that wins one fight and attacks again was drawn on its second battle square before its first fight played, for instance already standing on your unit\'s square. It now stays where it started until its first fight plays.'],
  },
  {
    id: 'enemy-stacks',
    version: '0.9.99',
    date: '2026-11-18',
    title: 'See how big an enemy stack is',
    text: ['Enemy stacks now show a count badge on the map, just like your own. Click one and the side panel lists every unit on the square (click any to inspect it), and the attack odds say "stack of N".'],
  },
  {
    id: 'replay-chronology',
    version: '0.9.98',
    date: '2026-11-18',
    title: 'Battle replays no longer spoil the result',
    text: ["During the start-of-turn replay, a city that is about to be taken keeps its old owner's colour until its fight plays, then changes hands."],
  },
  {
    id: 'apc-rename',
    version: '0.9.97',
    date: '2026-11-18',
    title: 'The Troop Transport is now the APC',
    text: ['The new land carrier is renamed the APC (Armored Personnel Carrier), so it cannot be mistaken for the ship Transport. Nothing else about it changed, and saved games are unaffected.'],
  },
  {
    id: 'news-close-top',
    version: '0.9.96',
    date: '2026-11-18',
    title: 'Close What\'s New from the top',
    text: ['This page now has its Close button at the top, and it stays in view while you scroll.'],
  },
  {
    id: 'ai-airbases',
    version: '0.9.95',
    date: '2026-11-18',
    title: 'Smarter Airbases for the computer',
    text: ['Computer players on Hard now build Airbases out in remote country, where they bring an enemy city into Bomber range, instead of beside their own cities where they only drew fire.'],
  },
  {
    id: 'troop-transport',
    version: '0.9.94',
    date: '2026-11-18',
    title: 'The APC (Armored Personnel Carrier)',
    text: [
      'A new unit with the Advanced units rule, the Armored Personnel Carrier (APC): a tracked carrier for four Armies or Spies (not Armor). It moves like Armor, with the same terrain limits, and loads and unloads on any land square: walk an Army onto it, or use Load. It can run routes over land, too.',
      'It cannot attack and is easy prey: Armor kills it almost at will, an Army has an even fight with it, and it can hide in a forest. If it is destroyed, everyone aboard dies with it.',
    ],
    image: { src: 'apc.png', alt: 'The APC card' },
  },
  {
    id: 'square-units',
    version: '0.9.93',
    date: '2026-11-18',
    title: 'Units on this square',
    text: ['When a square holds more than one unit, the side panel now lists them all under the selected unit, with their orders. Click one of yours to select it. Teammates\' units on the square are listed too.'],
  },
  {
    id: 'friendly-squares',
    version: '0.9.92',
    date: '2026-11-17',
    title: 'Go to friendly stacks and cities',
    text: ['Click a stack of your own or a teammate\'s units with a unit selected and it now goes there, when there is room, instead of just selecting. Allied units in a city no longer block paths into it, and a ferry route can drop at a teammate\'s city.'],
  },
  {
    id: 'ally-stacking',
    version: '0.9.91',
    date: '2026-11-17',
    title: 'Stack with your allies',
    text: ['With Stackable units on, you can now move onto a teammate\'s stack, and they can join yours. The square keeps one limit (4 land, 3 sea) whoever the units belong to. Each player still orders only their own units. An enemy attack on a mixed stack fights the best defender of either side, and splash damage can hit any of them.'],
  },
  {
    id: 'explore-neutral-cities',
    version: '0.9.90',
    date: '2026-11-17',
    title: 'Explorers go for neutral cities',
    text: ['An Army or Armor on Explore now heads for a neutral city it knows about when that is nearer than the unexplored edge, and stops beside it so you can decide whether to attack. If you tell it to carry on, it leaves that city alone.'],
  },
  {
    id: 'stack-splash',
    version: '0.9.89',
    date: '2026-11-17',
    title: 'Bigger land stacks, and splash damage',
    text: [
      'With the Stackable units house rule on, up to 4 land units can now share a square (ships still 3).',
      'The risk: when a Bomber or a ship beats a stack\'s best defender, the blast may hurt the rest of the stack. Each other unit has an even chance of taking one hit, so some are damaged and some are spared. A unit on its last hit is destroyed.',
    ],
  },
  {
    id: 'route-arrival-shown',
    version: '0.9.88',
    date: '2026-11-17',
    title: 'Routes show what units do on arrival',
    text: ['The list of a city\'s routes now ends with the arrival order, for example "Army, Armor → Tangier (Explore)".'],
  },
  {
    id: 'elimination-count',
    version: '0.9.86',
    date: '2026-11-17',
    title: 'Opponent count ignores teammates',
    text: ['The "Empire falls" newspaper now counts only real opponents, and mentions how many teammates you still have.'],
  },
  {
    id: 'then-build-follows',
    version: '0.9.85',
    date: '2026-11-16',
    title: '"Then build" follows your choice',
    text: ['On the production screen, the "Then build" menu now updates to the unit you have highlighted, instead of staying on the one the city was building.'],
  },
  {
    id: 'hold-saved',
    version: '0.9.84',
    date: '2026-11-16',
    title: 'Hold and Standby survive a reload',
    text: ['Units you put on Hold Position or Standby are remembered when you save and load the game in the middle of a turn, so they no longer ask for orders again.'],
  },
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
