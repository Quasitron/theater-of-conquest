import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../../src/engine';
import { attackCity } from '../../src/engine/attack';
import { buildTime } from '../../src/engine/production';
import { addUnit, attackerAlwaysHits, makeGame } from '../helpers';

const M = ['*.*'];

describe('capital cities (house rule)', () => {
  it('is off by default: no city is a capital and build times are unchanged', () => {
    const s = makeGame(M);
    expect(s.cities.some((c) => c.capital)).toBe(false);
    expect(buildTime(s.cities[0], 'destroyer')).toBe(24);
  });

  it('makes each player\'s starting city a capital, and no other city', () => {
    const s = makeGame(['*..*..*'], { players: 2, starts: [0, 2], rules: { capitalCities: true } });
    expect(s.cities.map((c) => c.capital === true)).toEqual([true, false, true]);
  });

  it('builds 25% faster, always at least 1 turn faster', () => {
    const s = makeGame(M, { rules: { capitalCities: true } });
    const capital = s.cities[0];
    expect(buildTime(capital, 'destroyer')).toBe(18); // 24
    expect(buildTime(capital, 'army')).toBe(5); // 6 for a first Army
    capital.lastBuilt = 'army';
    expect(buildTime(capital, 'army')).toBe(4); // a repeat Army takes 5
    expect(buildTime({ ...capital, capital: false }, 'army')).toBe(5);
  });

  it('combines with the war-torn slowdown: slowed first, then a quarter off', () => {
    const s = makeGame(M, { rules: { capitalCities: true, warTornCities: true } });
    const capital = s.cities[0];
    capital.lastBuilt = 'army'; // a repeat Army takes 5
    capital.warTorn = 1;
    expect(buildTime(capital, 'destroyer')).toBe(23); // 30 slowed
    expect(buildTime(capital, 'army')).toBe(6); // 7 slowed
    capital.warTorn = 2;
    expect(buildTime(capital, 'destroyer')).toBe(27); // 36 slowed
    expect(buildTime(capital, 'army')).toBe(6); // 8 slowed
  });

  it('stays a capital, with its boost, when it is captured', () => {
    const s = makeGame(M, { rules: { capitalCities: true } });
    const capital = s.cities[1];
    capital.owner = 1;
    capital.capital = true;
    attackCity(s, attackerAlwaysHits(), addUnit(s, 'army', 0, 1, 0), capital, []);
    expect(capital.owner).toBe(0);
    expect(capital.capital).toBe(true);
    expect(buildTime(capital, 'destroyer')).toBe(18);
  });

  it('shows a capital in the view of anyone who knows the city', () => {
    const s = makeGame(M, { rules: { capitalCities: true } });
    s.fog[0].explored.fill(1);
    const known = getPlayerView(s, 0).knownCities;
    expect(known.map((c) => c.capital === true)).toEqual([true, true]);
    expect(getPlayerView(s, 0).myCities[0].capital).toBe(true);
  });
});
