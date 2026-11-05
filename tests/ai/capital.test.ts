import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/app/session';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen/options';

describe('computer opponent with the capital cities rule', () => {
  it('plays on without errors or stalls, and the capitals stay marked', () => {
    const seats = [
      { name: 'You', kind: 'human' as const, color: '#d7263d' },
      { name: 'Computer', kind: 'ai' as const, color: '#1b98e0', difficulty: 'normal' as const },
    ];
    const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small, landmass: 'continents' as const };
    const s = GameSession.create({ world, seed: 21, seats, rules: { capitalCities: true, warTornCities: true } }, null);
    expect(s.state.cities.filter((c) => c.capital)).toHaveLength(2);
    for (let i = 0; i < 100 && s.phase === 'playing'; i++) {
      expect(s.act({ type: 'endTurn' })).toBeNull();
    }
    expect(s.state.turn).toBeGreaterThan(40);
    expect(s.state.cities.filter((c) => c.capital)).toHaveLength(2); // none is made or lost, only passed on
  }, 120_000);
});
