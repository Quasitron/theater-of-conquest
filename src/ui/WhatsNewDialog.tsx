import { useEffect, useState } from 'preact/hooks';
import { blur } from './blur';
import { PlacedDialog } from './LeaderLine';
import { WHATS_NEW, WHATS_NEW_RECENT, markNewsSeen } from './whatsNew';

interface Props {
  onClose: () => void;
}

/** What's New: the latest features, newest first, with the older ones a click away. */
export function WhatsNewDialog({ onClose }: Props) {
  const [all, setAll] = useState(false);
  useEffect(markNewsSeen, []);
  const shown = all ? WHATS_NEW : WHATS_NEW.slice(0, WHATS_NEW_RECENT);
  return (
    <PlacedDialog anchor={null} wide label="What's New" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <div class="news-top">
        <h2>What's New</h2>
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
      {shown.map((e) => (
        <section key={e.id} class="news-entry">
          <h3>{e.title} <span class="muted">Version {e.version} · {e.date}</span></h3>
          {e.text.map((p) => <p>{p}</p>)}
          {e.image && <img class="news-image" src={`/art/whatsnew/${e.image.src}`} alt={e.image.alt} loading="lazy" />}
        </section>
      ))}
      <div class="picker-actions">
        {!all && WHATS_NEW.length > WHATS_NEW_RECENT && <button onClick={(e) => { blur(e); setAll(true); }}>Older changes</button>}
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
