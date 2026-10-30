// The values the two sides share: the page the tablet opens first, the shortcuts, the role switch.

/** Set on the second process, the one whose screen is the tablet (display-sidecar). */
export const ROLE_ENV = 'SIDECAR_BROWSER_ROLE';
export const ROLE_SCREEN = 'screen';

export const START_URL = 'zinc://app/start.html';

export interface Shortcut { label: string; url: string; }
export const SHORTCUTS: Shortcut[] = [
  { label: 'Start page', url: START_URL },
  { label: 'Wikipedia', url: 'https://en.m.wikipedia.org/wiki/Special:Random' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org' },
  { label: 'MDN', url: 'https://developer.mozilla.org' },
  { label: 'Zinc on GitHub', url: 'https://github.com' },
];

/** The screens display-sidecar reaches (ZINC_SIDECAR): an Android over adb, an iPad or iPhone over usbmuxd. */
export interface Target { label: string; host: string; }
export const TARGETS: Target[] = [
  { label: 'Android (USB)', host: 'adb' },
  { label: 'iPad / iPhone (USB)', host: 'usb' },
];
