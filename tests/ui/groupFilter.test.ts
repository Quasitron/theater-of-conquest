import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { filterGroup, NO_GROUP_FILTER } from '../../src/ui/group';
import { addUnit, makeGame } from '../helpers';

describe('filterGroup', () => {
  it('can leave out sentried units and units standing in your cities', () => {
    const s = makeGame(['*##*', '####']);
    const inCity = addUnit(s, 'army', 0, 0, 0);
    const sentry = addUnit(s, 'army', 0, 2, 0, { orders: { kind: 'sentry' } });
    const awake = addUnit(s, 'army', 0, 3, 1);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    const ids = [inCity.id, sentry.id, awake.id];
    expect(filterGroup(v, ids, NO_GROUP_FILTER)).toEqual(ids);
    expect(filterGroup(v, ids, { skipSentry: true, skipCities: false })).toEqual([inCity.id, awake.id]);
    expect(filterGroup(v, ids, { skipSentry: false, skipCities: true })).toEqual([sentry.id, awake.id]);
    expect(filterGroup(v, ids, { skipSentry: true, skipCities: true })).toEqual([awake.id]);
  });
});
