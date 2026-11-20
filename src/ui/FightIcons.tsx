import type { PlayerId, UnitType } from '../engine';
import type { Fight } from './fights';
import { UNIT_GLYPH } from './colors';
import { UNIT_ICONS, iconSize } from './unitIcons';

/** One side of a fight: a unit's picture (or a city's) in a frame in its owner's colour, crossed out when it was lost. */
function Side({ type, owner, colors, lost, captured, faceLeft }: {
  type: UnitType | null; owner: PlayerId | null; colors: readonly string[]; lost: boolean; captured?: boolean; faceLeft?: boolean;
}) {
  const color = owner === null ? '#8a8f98' : colors[owner] ?? '#8a8f98';
  const icon = type === null ? null : UNIT_ICONS[type];
  const src = type === null ? '/art/units/city.webp' : icon?.src;
  // Pictures face right; the defender on the right turns to face the attacker.
  const flip = !!faceLeft && (type === null ? false : icon?.faces === 'right');
  return (
    <span class={lost ? 'fi lost' : 'fi'} style={{ borderColor: color }} title={type === null ? 'City' : undefined}>
      {src
        ? <img src={src} alt="" style={{ maxWidth: `${Math.round((type === null ? 1 : iconSize(type)) * 92)}%`, transform: flip ? 'scaleX(-1)' : undefined }} />
        : <span class="glyph">{type ? UNIT_GLYPH[type] : ''}</span>}
      {captured && <span class="fi-flag" aria-label="captured">{'⚑'}</span>}
    </span>
  );
}

/**
 * The two units of a fight for the Combat report: the attacker's picture, an arrow, and the defender's, each in its owner's
 * colour. The one that was lost is crossed out; a city that was taken carries a flag.
 */
export function FightIcons({ fight, colors }: { fight: Fight; colors: readonly string[] }) {
  const attackerLost = !fight.attackerWon;
  const defenderLost = fight.attackerWon && fight.destroyed && fight.defenderType !== null;
  return (
    <span class="fight-icons" aria-hidden="true">
      <Side type={fight.attackerType} owner={fight.attackerOwner} colors={colors} lost={attackerLost} />
      <span class="fight-arrow">{'→'}</span>
      <Side type={fight.defenderType} owner={fight.defenderOwner} colors={colors} lost={defenderLost} captured={fight.captured} faceLeft />
    </span>
  );
}
