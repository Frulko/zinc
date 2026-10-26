// Paths, limits and the e-ink class vocabulary of the web reader (the hub's: black on white, large targets, no animation).
import * as sys from 'zinc:sys';

function envOr(name: string, fallback: string): string { const v = sys.env(name); return v !== '' ? v : fallback; }

/** web.conf (relay, token), bookmarks.txt, ink/<sha256 of the URL>.json (and .txt: the URL), exports/*.png. */
export const WEB_DIR = envOr('ZINC_WEB_DIR', envOr('HOME', '.') + '/.zinc/web');
/** The Mac seen from the tablet over USB; the relay's default port. */
export const DEFAULT_RELAY = 'http://10.11.99.2:8790';
export const HOME_PAGE = 'https://en.wikipedia.org/wiki/E_Ink';
/** CSS pixels are this many tablet pixels: 1620 px wide is a page laid out at 810 CSS px, as on a tablet. */
export const DPR: number = 2;
export const MAX_ZOOM: number = 4;
export const REQUEST_TIMEOUT_MS: i32 = 30000;
export const MAX_IMAGE_BYTES: i32 = 32 * 1024 * 1024;

export const PAGE = 'flex-col h-full bg-white';
export const LABEL = 'text-[30px] text-black';
export const TITLE = 'text-[44px] font-bold text-black';
export const FIELD = 'h-[88px] px-5 text-[32px] text-black bg-white border-4 border-black rounded-lg focus:border-black';
export const BUTTON = 'px-6 h-[88px] items-center justify-center rounded-lg bg-black focus:bg-black';
export const BUTTON_LABEL = 'text-[30px] font-bold text-white';
export const OUTLINE_BUTTON = 'px-6 h-[88px] items-center justify-center rounded-lg border-4 border-black bg-white focus:bg-white';
export const OUTLINE_LABEL = 'text-[30px] font-bold text-black';
