import { useState } from 'preact/hooks';
import { UNIT_STATS, type PlayerView, type Unit } from '../engine';
import { ferryLabel } from './actions';
import { blur } from './blur';

interface Props {
  view: PlayerView;
  unit: Unit;
  onJoin: (routeId: number) => void;
  /** Start a new route: the player then picks the squares on the map. */
  onNew: (waitFull: boolean) => void;
  /** Edit a route's pickup city and drop square, for every carrier on it. */
  onChange: (routeId: number, waitFull: boolean) => void;
  /** Set "wait until full" on a route, keeping its squares. */
  onSetWait: (routeId: number, waitFull: boolean) => void;
  onLeave: () => void;
  onCancel: () => void;
}

/** The Ferry Route dialog of a carrier: put it on one of your routes, start a new one, edit one, or take it off the one it is on. */
export function FerryDialog({ view, unit, onJoin, onNew, onChange, onSetWait, onLeave, onCancel }: Props) {
  const [waitFull, setWaitFull] = useState(false);
  const mine = view.ferryRoutes.find((r) => r.id === unit.ferry);
  return (
    <div class="picker">
      <h3>Ferry route for {UNIT_STATS[unit.type].name} #{unit.id}</h3>
      {mine ? <span class="muted">This carrier is on: {ferryLabel(view, mine)}</span> : <span class="muted">This carrier is not on a route.</span>}
      {view.ferryRoutes.length > 0 && <strong>Your routes</strong>}
      {view.ferryRoutes.map((r) => (
        <div class="picker-row ferry-route-row" key={r.id}>
          <span>
            {ferryLabel(view, r)} ({r.carriers} {r.carriers === 1 ? 'carrier' : 'carriers'})
          </span>
          <label title="Applies to every carrier on this route">
            <input type="checkbox" checked={r.waitFull} onChange={(e) => { blur(e); onSetWait(r.id, !r.waitFull); }} />
            Wait until full
          </label>
          {r.id === unit.ferry
            ? <span class="muted">(on this route)</span>
            : <button title="Put this carrier on this route" onClick={(e) => { blur(e); onJoin(r.id); }}>Put this carrier on it</button>}
          <button title="Pick a new pickup city and drop square for this route; every carrier on it follows" onClick={(e) => { blur(e); onChange(r.id, r.waitFull); }}>Edit route…</button>
        </div>
      ))}
      <strong>New route</strong>
      <label class="picker-row">
        <input type="checkbox" checked={waitFull} onChange={(e) => { blur(e); setWaitFull(!waitFull); }} />
        Wait Until Full at Pickup City (New Routes)
      </label>
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onNew(waitFull); }}>New route…</button>
        {unit.ferry !== undefined && <button onClick={(e) => { blur(e); onLeave(); }}>Take this carrier off its route</button>}
        <button onClick={(e) => { blur(e); onCancel(); }}>Close</button>
      </div>
    </div>
  );
}
