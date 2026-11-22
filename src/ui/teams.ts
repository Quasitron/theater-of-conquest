import { MAX_PLAYERS } from '../engine';

/** What the New Game form remembers about team play. */
export interface TeamSetup {
  /** Team play is on (needs 3 or more players). */
  on: boolean;
  /** How many teams. */
  count: number;
  /** Per seat: '' = Alone, 'random' = drawn at random, otherwise the team number as text. */
  picks: string[];
  /** Show the drawn teams on the form before the game starts (with a Reshuffle button), instead of finding out in the game. */
  preview: boolean;
}

export const TEAM_PLAY_MIN_PLAYERS = 3;

/** The team counts a game of `players` can choose: 2 up to one fewer than the players (more would leave everyone alone). */
export const teamCounts = (players: number): number[] =>
  Array.from({ length: Math.max(0, Math.min(players - 1, MAX_PLAYERS) - 1) }, (_, i) => i + 2);

export const defaultTeamSetup = (players: number): TeamSetup => ({
  on: false, count: 2, picks: Array.from({ length: players }, () => 'random'), preview: false,
});

/** A small seeded random source, so a preview and the game that follows it agree. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The team of every seat (undefined = Alone). Fixed picks stay; each Random seat joins one of the smallest teams, so the
 * teams end as even as they can be. Humans are placed first and prefer the team with the fewest humans among the smallest,
 * so they are spread out rather than all landing together.
 */
export function assignTeams(
  seats: readonly { kind: 'human' | 'ai' | 'idle' }[],
  picks: readonly string[],
  count: number,
  random: () => number,
): (number | undefined)[] {
  const out: (number | undefined)[] = seats.map((_, i) => {
    const n = Number(picks[i]);
    return Number.isInteger(n) && n >= 1 && n <= count ? n : undefined;
  });
  const size = Array.from({ length: count + 1 }, () => 0);
  const humans = Array.from({ length: count + 1 }, () => 0);
  seats.forEach((s, i) => {
    const t = out[i];
    if (t !== undefined) { size[t]++; if (s.kind === 'human') humans[t]++; }
  });
  const shuffle = <T,>(a: T[]): T[] => {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  };
  const draw = shuffle(seats.map((_, i) => i).filter((i) => picks[i] === 'random'));
  draw.sort((a, b) => Number(seats[b].kind === 'human') - Number(seats[a].kind === 'human')); // stable: humans first, order otherwise shuffled
  for (const i of draw) {
    const teams = Array.from({ length: count }, (_, k) => k + 1);
    const least = Math.min(...teams.map((t) => size[t]));
    let pool = teams.filter((t) => size[t] === least);
    if (seats[i].kind === 'human') {
      const fewest = Math.min(...pool.map((t) => humans[t]));
      pool = pool.filter((t) => humans[t] === fewest);
    }
    const t = pool[Math.floor(random() * pool.length)];
    out[i] = t;
    size[t]++;
    if (seats[i].kind === 'human') humans[t]++;
  }
  return out;
}

export const TEAM_SETUP_KEY = 'conquest.newGameTeams';

/** The remembered team setup (its own key, so the rest of the New Game settings are untouched), made valid for `players`. */
export function loadTeamSetup(players: number, seats: readonly { team?: number }[]): TeamSetup {
  let raw: unknown;
  try {
    const text = globalThis.localStorage?.getItem(TEAM_SETUP_KEY);
    if (text) raw = JSON.parse(text);
  } catch { /* storage blocked or unreadable */ }
  return cleanTeamSetup(raw, players, seats.map((s) => s.team));
}

export function saveTeamSetup(t: TeamSetup): void {
  try {
    globalThis.localStorage?.setItem(TEAM_SETUP_KEY, JSON.stringify(t));
  } catch { /* storage blocked: the form simply starts from the defaults next time */ }
}

/** A setup read from storage (or built from older saved seats) with every field made valid for `players`. */
export function cleanTeamSetup(raw: unknown, players: number, legacyTeams: (number | undefined)[]): TeamSetup {
  const base = defaultTeamSetup(players);
  const r = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const counts = teamCounts(players);
  let setup: TeamSetup = { ...base };
  if (Object.keys(r).length > 0) {
    if (typeof r.on === 'boolean') setup.on = r.on;
    if (typeof r.preview === 'boolean') setup.preview = r.preview;
    if (typeof r.count === 'number' && Number.isInteger(r.count)) setup.count = r.count;
    if (Array.isArray(r.picks)) {
      const given = r.picks as unknown[];
      setup.picks = Array.from({ length: players }, (_, i) => (typeof given[i] === 'string' ? given[i] as string : 'random'));
    }
  } else if (legacyTeams.some((t) => t !== undefined)) {
    // Remembered from before team play existed: seats with a team become fixed picks.
    setup = { ...base, on: true, count: Math.max(2, ...legacyTeams.map((t) => t ?? 0)), picks: Array.from({ length: players }, (_, i) => (legacyTeams[i] ? String(legacyTeams[i]) : '')) };
  }
  if (counts.length > 0) setup.count = Math.min(Math.max(setup.count, 2), counts[counts.length - 1]);
  setup.picks = setup.picks.map((p) => (p === '' || p === 'random' || (Number.isInteger(Number(p)) && Number(p) >= 1 && Number(p) <= setup.count) ? p : 'random'));
  return setup;
}
