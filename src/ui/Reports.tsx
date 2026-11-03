import { useState } from 'preact/hooks';
import { UNIT_STATS, UNIT_TYPES, type PlayerView, type Pos } from '../engine';
import type { Fight } from './fights';
import { blur } from './blur';
import { UNIT_GLYPH } from './colors';
import { PlacedDialog } from './LeaderLine';
import type { BattleLine, Sighting, SentryLine } from './reportLines';
import { StatusTab } from './StatusReport';

export type ReportTab = 'status' | 'combat' | 'recon' | 'sentry';

interface Props {
  view: PlayerView;
  /** Each player's colour, by id. */
  colors: string[];
  tab: ReportTab;
  battles: BattleLine[];
  sightings: Sighting[];
  /** Units on sentry, longest-waiting first. */
  sentries: SentryLine[];
  /** Selects one of your units and centers the map on it; the reports then close. */
  onSelectUnit: (id: number) => void;
  /** Centers the map on a square and flashes it, so a line in a report can be found on the map; a battle also plays out. */
  onShow: (at: Pos, fight?: Fight) => void;
  onClose: () => void;
}

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'combat', label: 'Combat' },
  { id: 'recon', label: 'Recon' },
  { id: 'sentry', label: 'Sentry' },
];

/** "12 turns", "1 turn", "this turn". */
function sentryAge(turns: number): string {
  return turns === 0 ? 'since this turn' : `for ${turns} ${turns === 1 ? 'turn' : 'turns'}`;
}

/** The Reports dialog, like the original's Reports menu: status, battles against you, and enemy sightings. */
export function Reports({ view, colors, tab: first, battles, sightings, sentries, onSelectUnit, onShow, onClose }: Props) {
  const [tab, setTab] = useState<ReportTab>(first);
  const [sentryOrder, setSentryOrder] = useState<'time' | 'type'>('time');
  // The list arrives longest-waiting first; sorting by type keeps that order within each type.
  const sortedSentries = sentryOrder === 'time' ? sentries : [...sentries].sort((a, b) => UNIT_TYPES.indexOf(a.type) - UNIT_TYPES.indexOf(b.type));
  const count = (id: ReportTab) => (id === 'combat' ? battles.length : id === 'recon' ? sightings.length : id === 'sentry' ? sentries.length : 0);
  return (
    <PlacedDialog anchor={null} label="Reports" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Reports <span class="muted">turn {view.turn}</span></h2>
      <div class="report-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id} class={tab === t.id ? 'primary' : ''}
            onClick={(e) => { blur(e); setTab(t.id); }}
          >
            {t.label}{count(t.id) > 0 ? ` (${count(t.id)})` : ''}
          </button>
        ))}
      </div>

      {tab === 'status' && <StatusTab view={view} colors={colors} />}

      {tab === 'combat' && (
        battles.length === 0
          ? <p class="muted">No battles against you since your last turn.</p>
          : (
            <ul class="report-list">
              {battles.map((b, i) => (
                <li key={i}>
                  <span class={b.outcome === 'good' ? 'won-battle' : b.outcome === 'bad' ? 'lost-battle' : undefined}>{b.text}</span>
                  <span class="muted">at {b.at.x},{b.at.y}</span>
                  <button onClick={(e) => { blur(e); onShow(b.at, b.fight); }}>Show</button>
                </li>
              ))}
            </ul>
          )
      )}

      {tab === 'recon' && (
        sightings.length === 0
          ? <p class="muted">No enemy units sighted since your last turn.</p>
          : (
            <ul class="report-list">
              {sightings.map((s, i) => (
                <li key={i}>
                  <span><span class="glyph">{UNIT_GLYPH[s.type]}</span> {s.owner}'s {UNIT_STATS[s.type].name}</span>
                  <span class="muted">at {s.at.x},{s.at.y} · {s.visibleNow ? 'in sight now' : `last seen turn ${s.turnSeen}`}</span>
                  <button onClick={(e) => { blur(e); onShow(s.at); }}>Show</button>
                </li>
              ))}
            </ul>
          )
      )}

      {tab === 'sentry' && (
        sentries.length === 0
          ? <p class="muted">None of your units is on sentry.</p>
          : (
            <>
            <label>Sort by{' '}
              <select value={sentryOrder} onChange={(e) => setSentryOrder((e.target as HTMLSelectElement).value as 'time' | 'type')}>
                <option value="time">Longest on sentry</option>
                <option value="type">Unit type</option>
              </select>
            </label>
            <ul class="report-list">
              {sortedSentries.map((s) => (
                <li key={s.unitId}>
                  <button class="linklike" onClick={(e) => { blur(e); onSelectUnit(s.unitId); }}>
                    <span class="glyph">{UNIT_GLYPH[s.type]}</span> {s.name.includes(UNIT_STATS[s.type].name) ? s.name : <>{UNIT_STATS[s.type].name} <span class="muted">{s.name}</span></>}
                  </button>
                  <span class="muted">{s.where} · on sentry {sentryAge(s.turns)}</span>
                  <button onClick={(e) => { blur(e); onShow(s.at); }}>Show</button>
                </li>
              ))}
            </ul>
            </>
          )
      )}

      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
