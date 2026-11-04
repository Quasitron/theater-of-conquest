import type { Command, GameState } from './types';
import { apply } from './apply';

/** Plays `commands` from `initial` (which is left untouched). One copy up front, then each command changes it in place. */
export function replay(initial: GameState, commands: readonly Command[]): GameState {
  const s = structuredClone(initial);
  commands.forEach((cmd, i) => {
    const r = apply(s, cmd, true);
    if (!r.ok) throw new Error(`command ${i} (${cmd.type}) rejected: ${r.error}`);
  });
  return s;
}
