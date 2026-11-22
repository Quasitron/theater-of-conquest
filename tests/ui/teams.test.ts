import { describe, expect, it } from 'vitest';
import { assignTeams, cleanTeamSetup, defaultTeamSetup, seededRandom, teamCounts } from '../../src/ui/teams';

const seats = (kinds: ('human' | 'ai')[]) => kinds.map((kind) => ({ kind }));
const sizes = (t: (number | undefined)[], count: number) => Array.from({ length: count }, (_, k) => t.filter((x) => x === k + 1).length);

describe('team counts', () => {
  it('2 up to one fewer than the players', () => {
    expect(teamCounts(2)).toEqual([]);
    expect(teamCounts(3)).toEqual([2]);
    expect(teamCounts(6)).toEqual([2, 3, 4, 5]);
    expect(teamCounts(8)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});

describe('assignTeams', () => {
  it('keeps fixed picks and leaves Alone alone', () => {
    const t = assignTeams(seats(['human', 'ai', 'ai', 'ai']), ['1', '', '2', '2'], 2, seededRandom(1));
    expect(t).toEqual([1, undefined, 2, 2]);
  });

  it('balances random seats: 6 players on 3 teams is 2-2-2, 7 on 3 is 3-2-2', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const six = assignTeams(seats(Array(6).fill('ai')), Array(6).fill('random'), 3, seededRandom(seed));
      expect(sizes(six, 3)).toEqual([2, 2, 2]);
      const seven = assignTeams(seats(Array(7).fill('ai')), Array(7).fill('random'), 3, seededRandom(seed));
      expect(sizes(seven, 3).sort()).toEqual([2, 2, 3]);
    }
  });

  it('fills the smallest team first around fixed picks', () => {
    // Team 1 already has two; the two random seats both go to team 2.
    for (let seed = 1; seed <= 10; seed++) {
      const t = assignTeams(seats(['ai', 'ai', 'ai', 'ai']), ['1', '1', 'random', 'random'], 2, seededRandom(seed));
      expect(t).toEqual([1, 1, 2, 2]);
    }
  });

  it('spreads humans over different teams when it can', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const k = seats(['human', 'human', 'ai', 'ai', 'ai', 'ai']);
      const t = assignTeams(k, Array(6).fill('random'), 2, seededRandom(seed));
      expect(t[0]).not.toBe(t[1]);
      expect(sizes(t, 2)).toEqual([3, 3]);
    }
  });

  it('is the same draw for the same seed, and varies with the seed', () => {
    const k = seats(Array(6).fill('ai'));
    const picks = Array(6).fill('random');
    expect(assignTeams(k, picks, 3, seededRandom(7))).toEqual(assignTeams(k, picks, 3, seededRandom(7)));
    const draws = new Set(Array.from({ length: 20 }, (_, s) => assignTeams(k, picks, 3, seededRandom(s)).join()));
    expect(draws.size).toBeGreaterThan(5);
  });

  it('never puts everyone on one team when there are random seats and 2+ teams', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const t = assignTeams(seats(Array(4).fill('ai')), ['1', 'random', 'random', 'random'], 2, seededRandom(seed));
      expect(new Set(t).size).toBe(2);
    }
  });
});

describe('cleanTeamSetup', () => {
  it('defaults to off with every seat Random', () => {
    expect(defaultTeamSetup(4)).toEqual({ on: false, count: 2, picks: ['random', 'random', 'random', 'random'], preview: false });
  });

  it('clamps the team count and turns picks beyond it into Random', () => {
    const s = cleanTeamSetup({ on: true, count: 6, picks: ['5', '1', '', 'random'], preview: true }, 4, []);
    expect(s.count).toBe(3);
    expect(s.picks).toEqual(['random', '1', '', 'random']);
    expect(s.on).toBe(true);
    expect(s.preview).toBe(true);
  });

  it('fills in seats added later as Random and ignores junk', () => {
    expect(cleanTeamSetup({ on: true, count: 2, picks: ['1'] }, 3, []).picks).toEqual(['1', 'random', 'random']);
    expect(cleanTeamSetup('junk', 3, [])).toEqual(defaultTeamSetup(3));
  });

  it('turns teams remembered on seats (before team play existed) into fixed picks', () => {
    const s = cleanTeamSetup(undefined, 4, [1, undefined, 2, 2]);
    expect(s).toMatchObject({ on: true, count: 2, picks: ['1', '', '2', '2'] });
  });
});
