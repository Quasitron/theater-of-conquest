import { useState } from 'preact/hooks';
import { blur } from './blur';
import { WhatsNewDialog } from './WhatsNewDialog';
import { hasUnseenNews } from './whatsNew';

/** State of the What's New dialog and its dot. The screen renders the button where it likes and the dialog at its top level (a blurred panel would trap it). */
export function useWhatsNew() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(hasUnseenNews);
  return {
    unseen,
    open,
    show: () => setOpen(true),
    close: () => { setOpen(false); setUnseen(hasUnseenNews()); },
  };
}

type News = ReturnType<typeof useWhatsNew>;

/** The What's New button, with a dot until the newest entry has been read. */
export function WhatsNewButton({ news }: { news: News }) {
  return (
    <button
      class="whatsnew-button" title={news.unseen ? "What's New (new since you last looked)" : "What's New"}
      onClick={(e) => { blur(e); news.show(); }}
    >
      What's New{news.unseen && <span class="news-dot" aria-label="new" />}
    </button>
  );
}

/** The dialog, when open. */
export function WhatsNewDialogHost({ news }: { news: News }) {
  return news.open ? <WhatsNewDialog onClose={news.close} /> : null;
}
