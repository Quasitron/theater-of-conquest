import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/app/session';
import { STACK_LIMIT } from '../../src/engine/query';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen/options';

describe('computer players with the stacking rule', () => {
  it('play on without errors, and no square outside a city holds more than the limit', () => {
    const seats = [
      { name: 'A', kind: 'ai' as const, color: '#d7263d', difficulty: 'normal' as const },
      { name: 'B', kind: 'ai' as const, color: '#1b98e0', difficulty: 'normal' as const },
      { name: 'You', kind: 'human' as const, color: '#2a9d2a' },
    ];
    const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small, landmass: 'continents' as const, players: 3 };
    const s = GameSession.create({ world, seed: 33, seats, rules: { stacking: true, advancedUnits: true } }, null);
    let biggest = 0;
    for (let i = 0; i < 60 && s.phase === 'playing'; i++) {
      expect(s.act({ type: 'endTurn' })).toBeNull();
      const counts = new Map<string, number>();
      for (const u of s.state.units) {
        if (u.carriedBy !== null || s.state.cities.some((c) => c.x === u.x && c.y === u.y)) continue;
        const k = `${u.x},${u.y}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const n of counts.values()) biggest = Math.max(biggest, n);
    }
    expect(biggest).toBeLessThanOrEqual(STACK_LIMIT);
    expect(s.state.turn).toBeGreaterThan(10);
  }, 120_000);
});
