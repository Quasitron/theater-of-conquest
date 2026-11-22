import { CITY_STRENGTH_HITS, RANK_NAMES, garrisonBonus, rankOf, UNIT_STATS, buildTime, warTornSpeedPercent, warTornTurnsLeft, buildableTypes, cargoCapacity, cargoUsed, unitDisplayName, type City, type PlayerView, type Unit, type UnitType } from '../engine';
import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ActionBar } from './ActionBar';
import { ordersText } from './actions';
import type { ActionId } from './keys';
import { UNIT_GLYPH } from './colors';
import { cargoAndPatrols, cargoLoad, cargoSummary, cityIsCoastal, groundUnder, patrolsFrom } from './labels';
import { HealthBar, StatBar } from './UnitInfo';
import { blur } from './blur';
import { UNIT_ICONS } from './unitIcons';
import { Chevrons } from './Chevrons';
import { Flag } from './Flag';

export type Selection = { kind: 'unit'; id: number } | { kind: 'city'; id: number } | { kind: 'enemy'; id: number } | null;

/**
 * The side panel's scrolling box. When more of it lies below the visible part (a phone or an iPad squeezes it under the log)
 * a fading "more" arrow shows at the bottom, so it is plain that scrolling reveals the rest.
 */
function ScrollPanel({ children }: { children: ComponentChildren }) {
  const box = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const check = () => {
    const el = box.current;
    if (!el) return;
    setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 6);
    // The unit card stays put while the commands scroll, but only when the panel has room for the card and some commands.
    const head = el.querySelector<HTMLElement>('.unit-head');
    el.classList.toggle('pin', head !== null && el.clientHeight >= head.offsetHeight + 140);
  };
  useEffect(check); // after every render: the content may have changed
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <aside class="panel" ref={box} onScroll={check}>
      {children}
      {more && <div class="scroll-hint" aria-hidden="true"><span>▾ more</span></div>}
    </aside>
  );
}

/** The unit's (or city's) picture in your colour, at the top right of the panel; nothing if it has no picture. */
function Picture({ src, color }: { src: string | undefined; color: string }) {
  if (!src) return null;
  return (
    <div class="unit-pic" style={{ borderColor: color }}>
      <img src={src} alt="" />
    </div>
  );
}

interface Props {
  view: PlayerView;
  selection: Selection;
  onSelectUnit: (id: number) => void;
  /** Picks another enemy marker from a stack list. */
  onSelectEnemy: (markerId: number) => void;
  onProduction: (cityId: number, type: UnitType | null) => void;
  onAction: (id: ActionId) => void;
  onOpenCity: (cityId: number) => void;
  /** Number of units the cycle would visit; End Turn is offered in the empty panel when it is 0. */
  readyCount: number;
  /** Your colour, for the frame round the picture. */
  myColor: string;
  /** The colour of the enemy unit being looked at, for its picture's frame. */
  enemyColor: string;
}

function UnitDetails({ u, view, onAction, onSelectUnit, myColor }: {
  u: Unit; view: PlayerView; onAction: (id: ActionId) => void; onSelectUnit: (id: number) => void; myColor: string;
}) {
  const st = UNIT_STATS[u.type];
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id).sort((a, b) => a.id - b.id);
  const [open, setOpen] = useState(false);
  // In a city the card names it (in place of the terrain).
  const inCity = u.carriedBy === null ? view.knownCities.find((c) => c.x === u.x && c.y === u.y) : undefined;
  // Fighters out on a patrol tied to this carrier are part of its group even while they are away.
  const away = st.carries.length > 0 ? patrolsFrom(view.myUnits, u) : [];
  // Everything standing on this square (not counting cargo): yours, then teammates' units in the open.
  const mine = u.carriedBy === null ? view.myUnits.filter((o) => o.x === u.x && o.y === u.y && o.carriedBy === null).sort((a, b) => a.id - b.id) : [];
  const mates = u.carriedBy === null ? view.allyUnits.filter((o) => o.x === u.x && o.y === u.y) : [];
  return (
    <div>
      <div class="unit-head">
      <Picture src={UNIT_ICONS[u.type]?.src} color={myColor} />
      <h3><span class="glyph owned" style={{ background: myColor }}>{UNIT_GLYPH[u.type]}</span> {unitDisplayName(u)}<Chevrons rank={rankOf(u.wins, u.type)} /></h3>
      {view.rules.promotions && st.promotes && <p>Rank: {RANK_NAMES[rankOf(u.wins, u.type)]}{u.wins ? ` (${u.wins} win${u.wins === 1 ? '' : 's'})` : ''}</p>}
      <p>Orders: {ordersText(view, u)}</p>
      {u.hunted !== undefined && <p class="crippled-tag">Manhunt on in this city: move out!</p>}
      {inCity ? <p>Location: {inCity.name}</p> : groundUnder(view, u) && <p>Terrain: {groundUnder(view, u)}</p>}
      <HealthBar u={u} />
      <StatBar label="Moves" value={u.movesLeft} max={st.move} kind="moves" />
      {u.fuel !== null && st.range !== null && <StatBar label="Fuel" value={u.fuel} max={st.range} kind="fuel" low={u.fuel <= Math.ceil(st.range / 4)} />}
      {st.carries.length > 0 && cargo.length === 0 && away.length === 0 && <p>{cargoLoad(0, cargoCapacity(u))}</p>}
      {(cargo.length > 0 || away.length > 0) && (
        <div>
          <button class="linklike" aria-expanded={open} title={cargoSummary(cargo)} onClick={(e) => { blur(e); setOpen(!open); }}>
            {cargoAndPatrols(cargoUsed(cargo), cargoCapacity(u), away.length)}
          </button>
          {open && (
            <ul class="cargo-list">
              {cargo.map((c) => (
                <li key={c.id}><button onClick={(e) => { blur(e); onSelectUnit(c.id); }}>{unitDisplayName(c)} · {ordersText(view, c)}</button></li>
              ))}
              {away.map((c) => (
                <li key={c.id}><button onClick={(e) => { blur(e); onSelectUnit(c.id); }}>{unitDisplayName(c)} · {ordersText(view, c)} (away)</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {mine.length + mates.length > 1 && (
        <div class="square-units">
          <h4>On this square ({mine.length + mates.length})</h4>
          <ul class="cargo-list">
            {mine.map((o) => (
              <li key={o.id}>
                <button class={o.id === u.id ? 'current' : ''} aria-current={o.id === u.id} onClick={(e) => { blur(e); onSelectUnit(o.id); }}>
                  {unitDisplayName(o)} · {ordersText(view, o)} ({o.movesLeft})
                </button>
              </li>
            ))}
            {mates.map((o) => (
              <li key={`a${o.id}`}><span class="mate">{UNIT_STATS[o.type].name} · {view.players[o.owner].name}</span></li>
            ))}
          </ul>
        </div>
      )}
      </div>
      <ActionBar view={view} unit={u} onAction={onAction} />
    </div>
  );
}

function CityDetails({ city, view, onProduction, onSelectUnit, onOpenCity, myColor }: {
  city: City; view: PlayerView; onProduction: Props['onProduction']; onSelectUnit: Props['onSelectUnit']; onOpenCity: Props['onOpenCity']; myColor: string;
}) {
  const coastal = cityIsCoastal(view, city);
  const here = view.myUnits.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null);
  return (
    <div>
      <Picture src="/art/units/city.webp" color={myColor} />
      <h3>{city.capital && <span class="capital-star" title="Capital: builds 25% faster">★ </span>}{city.name}</h3>
      {city.capital && <p>Capital: builds 25% faster</p>}
      {view.rules.cityStrength && <p>Strength {CITY_STRENGTH_HITS - (city.damage ?? 0)}/{CITY_STRENGTH_HITS}</p>}
      {city.warTorn ? <p>War-torn: builds at {warTornSpeedPercent(city.warTorn)}% of full speed, full capacity in {warTornTurnsLeft(city)} turns</p> : null}
      {view.rules.garrisonsDefend && <p>Garrison defence +{garrisonBonus(here.filter((u) => UNIT_STATS[u.type].domain === 'land').length)}</p>}
      <h4>Orders</h4>
      <div class="actions">
        <button onClick={(e) => { blur(e); onOpenCity(city.id); }}>Open city screen</button>
        <label>Building
          <select value={city.production ?? ''} onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            (e.currentTarget as HTMLElement).blur();
            onProduction(city.id, v === '' ? null : (v as UnitType));
          }}>
            <option value="">Nothing</option>
            {buildableTypes(view.rules).map((t) => (
              <option value={t} disabled={UNIT_STATS[t].domain === 'sea' && !coastal}>
                {UNIT_STATS[t].name} ({buildTime(city, t)} turns)
              </option>
            ))}
          </select>
        </label>
      </div>
      {city.production && <p>Progress {city.progress}/{buildTime(city, city.production)}</p>}
      {here.length > 0 && (
        <div>
          <h4>Units here</h4>
          <div class="actions">
            {here.map((u) => (
              <button onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onSelectUnit(u.id); }}>{UNIT_STATS[u.type].name} ({u.movesLeft} moves)</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Next unit (and End Turn when nothing is waiting), under a city or enemy panel, so it works without the N key (an iPad has none). */
function NextBar({ readyCount, onAction }: { readyCount: number; onAction: Props['onAction'] }) {
  return (
    <div class="actions">
      <button onClick={(e) => { blur(e); onAction('next'); }}>Next unit</button>
      {readyCount === 0 && <button class="primary" onClick={(e) => { blur(e); onAction('endTurn'); }}>End Turn</button>}
    </div>
  );
}

function EmptyPanel({ text, readyCount, onAction }: { text: string; readyCount: number; onAction: Props['onAction'] }) {
  return (
    <ScrollPanel>
      <p>{text}</p>
      <div class="actions">
        <button onClick={(e) => { blur(e); onAction('next'); }}>Next unit</button>
        {readyCount === 0 && <button class="primary" onClick={(e) => { blur(e); onAction('endTurn'); }}>End Turn</button>}
      </div>
    </ScrollPanel>
  );
}

function SidePanelView({ view, selection, onSelectUnit, onSelectEnemy, onProduction, onAction, onOpenCity, readyCount, myColor, enemyColor }: Props) {
  if (!selection) return <EmptyPanel text="Select a unit or city." readyCount={readyCount} onAction={onAction} />;
  if (selection.kind === 'enemy') {
    const e = view.enemies.find((x) => x.markerId === selection.id);
    if (!e) return <EmptyPanel text="That unit is no longer in view." readyCount={readyCount} onAction={onAction} />;
    const seen = e.visibleNow ? 'In sight now' : `Last seen turn ${e.turnSeen}`;
    // Everything seen on this square under the same sighting (in sight now, or last seen), the stack it is part of.
    const stack = view.enemies.filter((x) => x.x === e.x && x.y === e.y && x.visibleNow === e.visibleNow);
    return (
      <ScrollPanel>
        <Picture src={UNIT_ICONS[e.type]?.src} color={enemyColor} />
        <h3><span class="glyph owned" style={{ background: enemyColor }}>{UNIT_GLYPH[e.type]}</span> {UNIT_STATS[e.type].name}<Chevrons rank={e.rank ?? 0} /></h3>
        <p><Flag name={view.players[e.owner].name} /> {view.players[e.owner].name}</p>
        <p>{seen}</p>
        {groundUnder(view, e) && <p>Terrain: {groundUnder(view, e)}</p>}
        {stack.length > 1 && (
          <div class="square-units">
            <h4>On this square ({stack.length})</h4>
            <ul class="cargo-list">
              {stack.map((o) => (
                <li key={o.markerId}>
                  <button class={o.markerId === e.markerId ? 'current' : ''} aria-current={o.markerId === e.markerId} onClick={(ev) => { blur(ev); onSelectEnemy(o.markerId); }}>
                    {UNIT_STATS[o.type].name}{o.rank ? ` · ${RANK_NAMES[o.rank]}` : ''} · {view.players[o.owner].name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <NextBar readyCount={readyCount} onAction={onAction} />
      </ScrollPanel>
    );
  }
  if (selection.kind === 'unit') {
    const u = view.myUnits.find((x) => x.id === selection.id);
    if (!u) return <EmptyPanel text="That unit is gone." readyCount={readyCount} onAction={onAction} />;
    return (
      <ScrollPanel>
        <UnitDetails key={u.id} u={u} view={view} onAction={onAction} onSelectUnit={onSelectUnit} myColor={myColor} />
      </ScrollPanel>
    );
  }
  const own = view.myCities.find((c) => c.id === selection.id);
  if (own) {
    return (
      <ScrollPanel>
        <CityDetails city={own} view={view} onProduction={onProduction} onSelectUnit={onSelectUnit} onOpenCity={onOpenCity} myColor={myColor} />
        <NextBar readyCount={readyCount} onAction={onAction} />
      </ScrollPanel>
    );
  }
  const known = view.knownCities.find((c) => c.id === selection.id);
  const owner = known?.owner;
  return (
    <ScrollPanel>
      <h3>{known?.capital && <span class="capital-star" title="Capital: builds 25% faster">★ </span>}{known?.name ?? `City #${selection.id}`}</h3>
      {known?.capital && <p>Capital: builds 25% faster</p>}
      <p>{owner === null || owner === undefined ? 'Neutral (last known)' : <><Flag name={view.players[owner].name} /> {view.players[owner].name}{view.allies.includes(owner) ? ' (ally)' : ' (last known)'}</>}</p>
      {view.rules.cityStrength && known && known.owner !== null && <p>Strength {CITY_STRENGTH_HITS - known.damage}/{CITY_STRENGTH_HITS}</p>}
      {known?.intel && <p>Spy report on who is inside: {known.intel.garrison.length === 0 ? 'nobody' : known.intel.garrison.map((g) => `${g.count} ${UNIT_STATS[g.type].name}`).join(', ')}.</p>}
      {known?.intel && <p>Spy report: {known.intel.production === null ? 'building nothing' : `building ${UNIT_STATS[known.intel.production].name}, ${known.intel.turnsLeft} turn${known.intel.turnsLeft === 1 ? '' : 's'} to go`}</p>}
      <NextBar readyCount={readyCount} onAction={onAction} />
    </ScrollPanel>
  );
}

/** Memoised so unrelated GameScreen renders (hover, camera) skip it when its props are unchanged. */
export const SidePanel = memo(SidePanelView);
