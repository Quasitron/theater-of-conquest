import { UNIT_STATS, UNIT_TYPES, type PlayerView, type UnitType } from '../engine';
import { blur } from './blur';
import { eligibleFor, filterGroup, GROUP_ORDERS, type GroupFilter, type GroupOrderId } from './group';
import { PlacedDialog } from './LeaderLine';

interface Props {
  view: PlayerView;
  /** Ids of the units the box caught. */
  unitIds: number[];
  onPick: (order: GroupOrderId) => void;
  onCancel: () => void;
  /** Units to leave out of the order (sentried ones, ones in cities); the choice is remembered by the caller. */
  filter: GroupFilter;
  onFilter: (f: GroupFilter) => void;
}

/** The one order to give every unit in the group; each button shows how many of the units it applies to. */
export function GroupDialog({ view, unitIds: caught, onPick, onCancel, filter, onFilter }: Props) {
  const unitIds = filterGroup(view, caught, filter);
  const left = caught.length - unitIds.length;
  const counts = new Map<UnitType, number>();
  for (const id of unitIds) {
    const u = view.myUnits.find((x) => x.id === id);
    if (u) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  }
  const summary = UNIT_TYPES.filter((t) => counts.has(t)).map((t) => `${counts.get(t)} ${UNIT_STATS[t].name}`).join(', ');
  return (
    <PlacedDialog anchor={null} label="Group" onKey={(e) => { if (e.key === 'Escape') { onCancel(); return true; } return false; }}>
      <h2>Group <span class="muted">{unitIds.length} {unitIds.length === 1 ? 'unit' : 'units'}</span></h2>
      <p class="muted">{summary}</p>
      <div class="group-filter">
        <label><input type="checkbox" checked={filter.skipSentry} onChange={(e) => onFilter({ ...filter, skipSentry: e.currentTarget.checked })} /> Leave out sentried units</label>
        <label><input type="checkbox" checked={filter.skipCities} onChange={(e) => onFilter({ ...filter, skipCities: e.currentTarget.checked })} /> Leave out units in cities</label>
        {left > 0 && <span class="muted">{left} left out</span>}
      </div>
      <p>Give them all one order:</p>
      <div class="group-orders">
        {GROUP_ORDERS.map((o) => {
          const n = eligibleFor(view, unitIds, o.id).length;
          return (
            <button key={o.id} disabled={n === 0} onClick={(e) => { blur(e); onPick(o.id); }}>{o.label} ({n})</button>
          );
        })}
      </div>
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onCancel(); }}>Cancel</button>
      </div>
    </PlacedDialog>
  );
}

