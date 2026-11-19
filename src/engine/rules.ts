/** Opt-in house rules. Every flag defaults off, which gives the original Empire Deluxe rules. */
export interface HouseRules {
  /** Neutral cities defend with strength 1 instead of 2. */
  easierNeutralCities: boolean;
  /** No city produces on turn 1, so every player's first tick is on turn 2. */
  fairFirstTurn: boolean;
  /** A transport leaving a city does not auto-load armies that have orders (Sentry); likewise carriers and fighters. */
  sentriedStayAsGarrison: boolean;
  /** A city takes several hits to fall and keeps the damage between attacks, healing one hit a turn. */
  cityStrength: boolean;
  /** Each land unit of the owner in a city adds 1 to its defence (at most +2); ships and aircraft add nothing. */
  garrisonsDefend: boolean;
  /** A city taken from another player builds 25% slower for each such capture (up to 4), recovering a step every 10 turns. */
  warTornCities: boolean;
  /** Sea units that win fights are promoted (Experienced 1 win, Veteran 3, Elite 5): a promotion heals one hit, Elite takes one more. */
  promotions: boolean;
  /** The Advanced units can be built: Armor (more to come). */
  advancedUnits: boolean;
  /** A submarine unseen by the defender opens with a torpedo salvo on a Transport, Carrier or Battleship, then slips away. */
  submarineStrike: boolean;
  /** With the Advanced units rule: an Armor defending in a river gets no defence bonus (it is slowed there too). Armies keep theirs. */
  armorNoRiverCover: boolean;
  /** Each player's starting city is a capital: it builds 25% faster (at least 1 turn), and keeps that when captured. */
  capitalCities: boolean;
  /** Up to 3 of a player's land or sea units may share a square outside a city; an attack on the square fights its best defender, one unit at a time. */
  stacking: boolean;
}

export const CLASSIC_RULES: HouseRules = {
  easierNeutralCities: false,
  fairFirstTurn: false,
  sentriedStayAsGarrison: false,
  cityStrength: false,
  garrisonsDefend: false,
  warTornCities: false,
  promotions: false,
  advancedUnits: false,
  submarineStrike: false,
  armorNoRiverCover: false,
  capitalCities: false,
  stacking: false,
};

/** Bumped whenever a change alters how an old command log replays. 4: units arriving in a route city take the route. 5: a carrier leaving a city takes the fighters there. 6: a patrol tied to a carrier moves with it. 7: aircraft wait a turn when blocked. 8: equal-length paths prefer the straight line. 9: fighters aboard a carrier await orders instead of sleeping. 10: a player with no city and no unit able to take one is knocked out. 11: kills and losses are counted for the status report. 12: bombarding a city no longer counts as a win towards a promotion (with the city strength and promotions rules on, older games replay differently; older saves load from their saved position). 13: Armor can be promoted (with the Advanced units and promotions rules on, older games replay differently; older saves load from their saved position). 14: the submarine strike rule (only changes games that turn it on). 15: a Spy takes 16 turns to build, 14 for each after the first (with the Advanced units rule on, older games replay differently; older saves load from their saved position). 16: with the Advanced units rule on, a crippled unit attacks at half strength (older games replay differently; older saves load from their saved position). 17: standing orders may enter an ally's city even when an allied unit is in it (older games replay differently; older saves load from their saved position). 18: a captured city is known to the loser's teammates as its new owner's (older games replay
differently; older saves load from their saved position). 19: units on sentry are stamped with the turn they went on it
(the saved state differs, so an older save's history no longer matches its snapshot; older saves load from their saved
position). 20: a sentried transport or carrier wakes when a unit boards it (older games replay differently; older saves
load from their saved position). 21: an Elite unit is crippled by half of its raised hits, not of its base hits (with the
promotions rule on, older games replay differently; older saves load from their saved position). 22: Spies are promoted
after 1, 2 and 3 wins, hide better as they rise, and a failed revolt may leave the spy alive but hunted (with the Advanced
units rule on, older games replay differently; older saves load from their saved position). 23: a city's strength (city strength rule) is known only from sight, yours or a teammate's; out of sight it shows what was last seen (older games replay differently; older saves load from their saved position). 24: a unit repairing in a city wakes when an enemy that could take the city comes near (older games replay differently; older saves load from their saved position). 25: the stacking rule (only changes games that turn it on). 26: units unloaded in a city of theirs take that city's route (older games with routes replay differently; older saves load from their saved position). */
// 27: stacking rule: up to 4 land units may share a square (ships stay at 3), and a bomber or ship that beats a stack's defender may also hurt the rest of the stack.
// 28: an Army or Armor on Explore also heads for a known neutral city when it is nearer than the unexplored edge.
// 29: stacking rule: a unit may join a teammate's stack (one limit for the whole square).
// 30: a ferry may drop at a teammate's city and unload there; allied units inside a city no longer block it in the path map.
// 31: the APC, Armored Personnel Carrier (Advanced units): a land carrier for four Armies or Spies.
// 32: Go Home (and Repair) heads for the nearest city of yours or a teammate's, not only your own.
// 33: a ferry carrier sailing back from a drop city does not take the units it just put ashore.
// 34: a Wait-until-full ferry sails when the waiting units left over cannot fit its free space (e.g. one space left, Armor needs two).
// 35: a Wait-until-full ferry also sails with just one space free (5 of 6), not waiting for one more Army or Spy.
export const RULES_VERSION = 35;
