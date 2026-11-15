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
  /** Change a route's pickup city and drop square for every carrier on it. */
  onChange: (routeId: number, waitFull: boolean) => void;
  /** Flip "wait until full" on a route, keeping its squares. */
  onToggleWait: (routeId: number) => void;
  onLeave: () => void;
  onCancel: () => void;
}

/** The Ferry Route dialog of a carrier: join one of your routes, start a new one, change one, or leave the one it is on. */
export function FerryDialog({ view, unit, onJoin, onNew, onChange, onToggleWait, onLeave, onCancel }: Props) {
  const [waitFull, setWaitFull] = useState(false);
  const mine = view.ferryRoutes.find((r) => r.id === unit.ferry);
  return (
    <div class="picker">
      <h3>Ferry route for {UNIT_STATS[unit.type].name} #{unit.id}</h3>
      {mine && <span class="muted">On: {ferryLabel(view, mine)}</span>}
      {view.ferryRoutes.length === 0 && <span class="muted">No ferry routes yet.</span>}
      {view.ferryRoutes.map((r) => (
        <div class="picker-row" key={r.id}>
          <span>
            {ferryLabel(view, r)} ({r.carriers} {r.carriers === 1 ? 'carrier' : 'carriers'}{r.waitFull ? ', waits until full' : ''})
          </span>
          {r.id !== unit.ferry && <button onClick={(e) => { blur(e); onJoin(r.id); }}>Join</button>}
          <button onClick={(e) => { blur(e); onToggleWait(r.id); }}>{r.waitFull ? 'Do not wait' : 'Wait until full'}</button>
          <button onClick={(e) => { blur(e); onChange(r.id, r.waitFull); }}>Change…</button>
        </div>
      ))}
      <label class="picker-row">
        <input type="checkbox" checked={waitFull} onChange={(e) => { blur(e); setWaitFull(!waitFull); }} />
        New route waits at the pickup city until the carrier is full
      </label>
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onNew(waitFull); }}>New route…</button>
        {unit.ferry !== undefined && <button onClick={(e) => { blur(e); onLeave(); }}>Leave route</button>}
        <button onClick={(e) => { blur(e); onCancel(); }}>Cancel</button>
      </div>
    </div>
  );
}
