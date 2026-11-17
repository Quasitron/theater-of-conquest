import { describe, expect, it } from 'vitest';
import { eliminationHeadline } from '../../src/ui/EliminationNotice';

import { playersLeft } from '../../src/ui/EliminationNotice';

describe('playersLeft', () => {
  it('does not count teammates as opponents', () => {
    const ps = [{ id: 0, team: 1 }, { id: 1, team: 1 }, { id: 2, team: 1 }, { id: 3, team: 2 }, { id: 4, team: 3, eliminated: true }];
    expect(playersLeft(ps, 0)).toEqual({ left: 1, mates: 2 });
    expect(playersLeft(ps.map((p) => ({ id: p.id })), 0)).toEqual({ left: 3, mates: 0 });
  });
});

describe('eliminationHeadline', () => {
  it('names the fallen empire by colour, with an exclamation mark', () => {
    expect(eliminationHeadline(['Blue'], 1)).toBe('BLUE EMPIRE FALLS!');
    expect(eliminationHeadline([null], 1)).toBe('EMPIRE FALLS!');
  });

  it('counts several empires that fall at once', () => {
    expect(eliminationHeadline(['Red', 'Blue'], 2)).toBe('TWO EMPIRES FALL!');
    expect(eliminationHeadline(['Red', 'Blue', 'Green'], 3)).toBe('THREE EMPIRES FALL!');
  });
});
