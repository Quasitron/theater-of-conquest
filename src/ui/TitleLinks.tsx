/** Where the title screen's two outside links go. An empty address hides its button. */
export const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61595971664363';
/** The "Buy us a coffee" donation page: left empty (and the button hidden) until the page exists. */
export const COFFEE_URL = '';

/** Shown when hovering the coffee button (nothing on touch screens); the full note lives on the donation page itself. */
export const COFFEE_HINT = 'The game will always be free. If you would like to chip in, leave a few coins in the coffee jar.';

const FacebookIcon = () => (
  <svg class="link-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#1877f2" />
    <path fill="#fff" d="M13.4 20v-7.2h2.4l.4-2.8h-2.8V8.3c0-.8.3-1.4 1.4-1.4h1.5V4.4c-.3 0-1.1-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V10H8v2.8h2.4V20z" />
  </svg>
);

const CoffeeIcon = () => (
  <svg class="link-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="#e8e1d5" d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path fill="none" stroke="#e8e1d5" stroke-width="2" d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path fill="none" stroke="#c9b79c" stroke-width="1.6" stroke-linecap="round" d="M8 3.5c-.8 1 .8 1.6 0 2.8M12 3.5c-.8 1 .8 1.6 0 2.8" />
    <rect x="3" y="20.2" width="15" height="1.8" rx="0.9" fill="#c9b79c" />
  </svg>
);

/** Bottom-left of the title screen: follow the game on Facebook, and (once there is a page) buy us a coffee. */
export function TitleLinks() {
  return (
    <div class="title-links">
      {FACEBOOK_URL && (
        <a class="title-link" href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Follow us on Facebook">
          Follow us on <FacebookIcon />
        </a>
      )}
      {COFFEE_URL && (
        <a class="title-link" href={COFFEE_URL} target="_blank" rel="noopener noreferrer" aria-label="Buy us a coffee" title={COFFEE_HINT}>
          Buy us a <CoffeeIcon />
        </a>
      )}
    </div>
  );
}
