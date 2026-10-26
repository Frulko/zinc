// Paths, limits and the e-ink class vocabulary of the web reader (the hub's: black on white, large targets, no animation).
import * as sys from 'zinc:sys';
import { appFolder } from 'zinc:remarkable';

function envOr(name: string, fallback: string): string { const v = sys.env(name); return v !== '' ? v : fallback; }

/** web.conf (relay, token), bookmarks.txt, ink/<sha256 of the URL>.json (and .txt: the URL), exports/*.png. */
export const WEB_DIR = sys.env('ZINC_WEB_DIR') !== '' ? sys.env('ZINC_WEB_DIR') : appFolder(envOr('HOME', '.') + '/.zinc/web');
/** The Mac seen from the tablet over USB; the relay's default port. */
export const DEFAULT_RELAY = 'http://10.11.99.2:8790';
/** The first page (ZINC_WEB_HOME for tests). */
export const HOME_PAGE = envOr('ZINC_WEB_HOME', 'https://en.wikipedia.org/wiki/E_Ink');
/** CSS pixels are this many tablet pixels: 1620 px wide is a page laid out at 810 CSS px, as on a tablet. */
export const DPR: number = 2;
export const MAX_ZOOM: number = 4;
export const REQUEST_TIMEOUT_MS: i32 = 30000;
export const MAX_IMAGE_BYTES: i32 = 32 * 1024 * 1024;

export const PAGE = 'flex-col h-full bg-white';
export const LABEL = 'text-[28px] text-black';
export const SMALL = 'text-[24px] text-black';
export const TITLE = 'text-[40px] font-bold text-black';
export const FIELD = 'h-[88px] px-4 text-[28px] text-black bg-white border-2 border-black rounded-lg focus:border-black';
/** A toolbar target: 88 px for a finger, a 2 px outline; pressed or active, inverted (black fill, white icon), never grey. */
export const BUTTON = 'flex-row gap-2 px-3 min-w-[88px] h-[88px] items-center justify-center rounded-lg border-2 border-black bg-black focus:bg-black';
export const OUTLINE_BUTTON = 'flex-row gap-2 px-3 min-w-[88px] h-[88px] items-center justify-center rounded-lg border-2 border-black bg-white focus:bg-white';
export const BUTTON_LABEL = 'text-[26px] font-bold text-white';
export const OUTLINE_LABEL = 'text-[26px] font-bold text-black';
/** A bar between the top bar, the page and the status line: thin rule, little padding. */
export const BAR = 'flex-row gap-2 px-4 py-2 items-center';
export const ICON: number = 44;
