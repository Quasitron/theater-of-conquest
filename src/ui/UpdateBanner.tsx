import { useState } from 'preact/hooks';
import type { GameSession } from '../app/session';
import { useUpdateReady } from './updateNotice';

/**
 * A small bar offering to reload into the new version that has finished downloading. Reload saves the game in progress
 * first (the autosave otherwise only happens when a turn changes), so nothing done this turn is lost.
 */
export function UpdateBanner({ session }: { session: GameSession | null }) {
  const ready = useUpdateReady();
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ready || later) return null;
  const reload = async () => {
    setBusy(true);
    try { if (session) await session.autosave(); } catch { /* reload anyway; the last autosave remains */ }
    location.reload();
  };
  return (
    <div class="update-banner" role="status">
      <span>A new version is ready.</span>
      <button class="primary" disabled={busy} onClick={() => { void reload(); }}>{busy ? 'Saving...' : 'Reload'}</button>
      <button onClick={() => setLater(true)}>Later</button>
    </div>
  );
}
