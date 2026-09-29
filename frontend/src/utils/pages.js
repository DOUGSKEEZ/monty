// Single source of truth for Monty's pages.
// Used by the navbar (desktop tabs, hamburger, owl picker), footer nav, and swipe nav.
//   label      - desktop tabs + hamburger menu
//   shortLabel - compact rows (owl picker, footer emoji nav)
//   swipe      - included in swipe navigation (array order = swipe order)
export const PAGES = [
  { path: '/',         label: 'Dashboard', shortLabel: 'Home',     title: 'Welcome to Monty',      icon: '/images/Monty.png',            alt: 'Monty',                       emoji: '🏠', swipe: true },
  { path: '/shades',   label: 'Shades',    shortLabel: 'Shades',   title: 'Shade Control',         icon: '/images/Monty_Sunglasses.png', alt: 'Monty with sunglasses',       emoji: '🪟', swipe: true },
  { path: '/pianobar', label: 'Pianobar',  shortLabel: 'Music',    title: "Monty's Pianobar",      icon: '/images/Monty_Music.png?v=2', alt: 'Monty with headphones',       emoji: '🎧', swipe: true },
  { path: '/cameras',  label: 'Cameras',   shortLabel: 'Cams',     title: 'Cameras',               icon: '/images/Monty_Security.png',   alt: 'Monty as a security guard with a camera', emoji: '📹' },
  { path: '/weather',  label: 'Weather',   shortLabel: 'Weather',  title: 'Local Weather',         icon: '/images/Monty_Weather.png',    alt: 'Monty with weather elements', emoji: '⛅' },
  { path: '/settings', label: 'Settings',  shortLabel: 'Settings', title: 'Settings',              icon: '/images/Monty_Settings.png',   alt: 'Monty with settings gear',    emoji: '⚙️', hideForGuest: true },
];

export const visiblePages = (isGuest) => PAGES.filter(p => !(isGuest && p.hideForGuest));

export const SWIPE_PAGES = PAGES.filter(p => p.swipe);

export const getPageInfo = (pathname) =>
  PAGES.find(p => p.path === pathname) ?? { icon: '/images/Monty.png', title: 'Monty', alt: 'Monty' };
