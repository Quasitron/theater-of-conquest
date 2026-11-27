import { useState } from 'preact/hooks';
import { UNIT_STATS, unitDisplayName, type PlayerView, type Unit } from '../engine';
import { ferryLabel } from './actions';
import { blur } from './blur';

/**
 * What the player has changed in the dialog so far. Nothing reaches the game until Save and Close; Cancel drops it.
 * (Taking the dialog to the map to pick squares keeps it.)
 */
export interface FerryDraft {
  /** The carrier's route: undefined = unchanged, null = taken off its route, a number = an existing route, 'new' = the route made here. */
  assign?: number | null | 'new';
  /** "Wait until full" choices on existing routes. */
  wait: Record<number, boolean>;
  /** New pickup city and drop square chosen for existing routes (Change Route). */
  squares: Record<number, { pickup: number; drop: { x: number; y: number } }>;
  /** The route made here with New route…; it exists only if the carrier is on it when saved. */
  fresh: null | { pickup: number; drop: { x: number; y: number }; waitFull: boolean };
  /** Other carriers taken off their routes (they then wait for orders). */
  removed: number[];
}

export const emptyFerryDraft = (): FerryDraft => ({ wait: {}, squares: {}, fresh: null, removed: [] });

/** Rows shown before the list of routes scrolls. */
export const FERRY_ROWS_VISIBLE = 5;

interface Props {
  view: PlayerView;
  unit: Unit;
  draft: FerryDraft;
  onDraft: (next: FerryDraft) => void;
  /** Take the dialog to the map to pick squares for a new route (null) or to change an existing one. */
  onPickSquares: (routeId: number | null) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
}

interface Row {
  id: number; // -1 for the route made here
  label: string;
  waitFull: boolean;
  /** The carriers on it as the draft has it. */
  members: Unit[];
  /** Where the carriers pick up (the route as it stands in the game), to say what each is doing. */
  pickup: { name: string; x: number; y: number } | null;
}

/** The Ferry Route dialog of a carrier: its route assignment, the existing routes, and New route. */
export function FerryDialog({ view, unit, draft, onDraft, onPickSquares, onSave, onCancel, error }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const assigned = draft.assign === undefined ? unit.ferry ?? null : draft.assign === 'new' ? -1 : draft.assign;
  const air = unit.type === 'airCargo';
  /** A pickup's name: a city, or (air routes) an Airbase, written as a negative number. */
  const cityName = (id: number) => {
    if (id >= 0) return view.knownCities.find((c) => c.id === id)?.name ?? '?';
    const base = view.myUnits.find((u) => u.id === -id - 1);
    return base ? `Airbase ${base.x},${base.y}` : '?';
  };
  const label = (pickup: number, drop: { x: number; y: number }) => ferryLabel(view, { pickup: { name: cityName(pickup) }, drop });

  // Air routes and surface routes are kept apart.
  const rows: Row[] = view.ferryRoutes.filter((r) => r.air === air).map((r) => {
    const sq = draft.squares[r.id];
    return {
      id: r.id,
      label: label(sq?.pickup ?? r.pickup.id, sq?.drop ?? r.drop),
      waitFull: draft.wait[r.id] ?? r.waitFull,
      members: [...view.myUnits.filter((u) => u.ferry === r.id && u.id !== unit.id && !draft.removed.includes(u.id)), ...(r.id === assigned ? [unit] : [])],
      pickup: r.pickup,
    };
  });
  if (draft.fresh) rows.push({ id: -1, label: `${label(draft.fresh.pickup, draft.fresh.drop)} (new)`, waitFull: draft.fresh.waitFull, members: assigned === -1 ? [unit] : [], pickup: null });

  const setWait = (id: number, waitFull: boolean) => {
    if (id === -1 && draft.fresh) onDraft({ ...draft, fresh: { ...draft.fresh, waitFull } });
    else onDraft({ ...draft, wait: { ...draft.wait, [id]: waitFull } });
  };
  /** Joining another route drops a route made here (it would have no carrier); Remove takes the carrier off. */
  const assign = (id: number | null) => onDraft({ ...draft, assign: id === -1 ? 'new' : id, ...(id === -1 ? {} : { fresh: null }) });
  const current = rows.find((r) => r.id === assigned);
  const toggle = (id: number) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** Takes a carrier off its route in the draft (this carrier through its own assignment). */
  const remove = (m: Unit) => (m.id === unit.id ? assign(null) : onDraft({ ...draft, removed: [...draft.removed, m.id] }));
  /** What a carrier on a route is doing, in a few words. */
  const what = (m: Unit, r: Row): string => {
    const o = m.orders;
    const cargo = view.myUnits.filter((c) => c.carriedBy === m.id).length;
    let s = 'not yet started';
    if (m.id !== unit.id || m.ferry === r.id) {
      if (o?.kind === 'goto' && o.ferry === 'drop') s = 'heading to the drop';
      else if (o?.kind === 'goto' && o.ferry === 'pickup') s = r.pickup && m.x === r.pickup.x && m.y === r.pickup.y ? `waiting at ${r.pickup.name}` : `heading to ${r.pickup?.name ?? 'the pickup'}`;
      else s = 'paused, waiting for orders';
    }
    return cargo > 0 ? `${s}, carrying ${cargo}` : s;
  };

  return (
    <div class={air ? 'picker ferry-dialog air-route' : 'picker ferry-dialog'}>
      <h3>{air ? '\u{1FA82} Air route' : 'Ferry route'} for {UNIT_STATS[unit.type].name} #{unit.id}</h3>
      {air && <span class="muted">A route to a city or Airbase flies troops and one Armor. A route to open land parachutes troops only.</span>}
      <span><strong>Current Route Assignment:</strong> {current ? current.label.replace(' (new)', '') : 'None'}</span>
      <strong>{air ? 'Existing Air Routes' : 'Existing Routes'}</strong>
      {rows.length === 0 ? <span class="muted">None yet: use New route… below.</span> : (
        <div class="ferry-table-scroll" style={{ maxHeight: `${FERRY_ROWS_VISIBLE * 1.8 + 1.6}em` }}>
          <div class="ferry-table">
            <span class="ferry-head">Route</span>
            <span class="ferry-head">Wait until full</span>
            <span class="ferry-head" />
            <span class="ferry-head" />
            {rows.map((r) => (
              <div class="ferry-row" key={r.id}>
                <span>{r.label} · <button class="linklike" title="Show the carriers on this route" onClick={(e) => { blur(e); toggle(r.id); }}>{r.members.length} {r.members.length === 1 ? 'carrier' : 'carriers'} {open.has(r.id) ? '▴' : '▾'}</button></span>
                <label class="ferry-wait" title="Applies to every carrier on this route">
                  <input type="checkbox" checked={r.waitFull} onChange={(e) => { blur(e); setWait(r.id, !r.waitFull); }} />
                </label>
                {r.id === assigned
                  ? <button title="Take this carrier off this route" onClick={(e) => { blur(e); assign(null); }}>Remove</button>
                  : <button title="Put this carrier on this route" onClick={(e) => { blur(e); assign(r.id); }}>Join</button>}
                <button title="Pick a new pickup city and drop square; every carrier on this route follows" onClick={(e) => { blur(e); onPickSquares(r.id === -1 ? null : r.id); }}>Change Route</button>
                {open.has(r.id) && (
                  <div class="ferry-members">
                    {r.members.length === 0 && <span class="muted">No carriers on this route.</span>}
                    {r.members.map((m) => (
                      <div class="ferry-member" key={m.id}>
                        <span>{unitDisplayName(m)} · {what(m, r)}</span>
                        <button title="Take this carrier off the route; it will wait for orders" onClick={(e) => { blur(e); remove(m); }}>Remove</button>
                      </div>
                    ))}
                    {r.members.length === 1 && r.id !== -1 && <span class="muted">Removing the last carrier drops the route at the next turn.</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <span class="error" role="alert">{error}</span>}
      <div class="picker-actions">
        <button onClick={(e) => { blur(e); onPickSquares(null); }}>New route…</button>
        <span class="ferry-spacer" />
        <button class="primary" onClick={(e) => { blur(e); onSave(); }}>Save and Close</button>
        <button onClick={(e) => { blur(e); onCancel(); }}>Cancel</button>
      </div>
    </div>
  );
}
