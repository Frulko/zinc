// Paths, limits and the e-ink class vocabulary of the hub.
import * as sys from 'zinc:sys';

function envOr(name: string, fallback: string): string { const v = sys.env(name); return v !== '' ? v : fallback; }
const HOME = envOr('HOME', '.');

/** The hub's own files: hub.conf (server, server key, device token) and apps/<id>/ (what is installed, the previous .zapp). */
export const HUB_DIR = envOr('ZINC_HUB_DIR', HOME + '/.zinc/hub');
/** Where the installed .zapp files live: the AppLoad tiles of zinc-tile point at them (ZN-841). */
export const APPS_DIR = envOr('ZINC_HUB_APPS', HOME + '/zinc-apps');
/** zinc-tile of the engine on the tablet; absent on a desktop, where installing makes no tile (a dry run). */
export const TILE_COMMAND = envOr('ZINC_HUB_TILE', HOME + '/zinc/bin/zinc-tile');
/** The name the server records for this device at pairing. */
export const DEVICE_NAME = envOr('ZINC_HUB_DEVICE', 'reMarkable');
export const DEFAULT_SERVER = 'http://10.11.99.2:8787';
export const STABLE = 'stable';
export const REQUEST_TIMEOUT_MS: i32 = 20000;
export const MAX_ZAPP_BYTES: i32 = 64 * 1024 * 1024;

// E-paper: pure black on white, thick outlines, large type and targets, no greys, shadows or transitions (they ghost).
export const PAGE = 'flex-col h-full bg-white';
export const SECTION = 'flex-col gap-6 p-10';
export const TITLE = 'text-[48px] font-bold text-black';
export const LABEL = 'text-[34px] text-black';
export const SMALL = 'text-[28px] text-black';
export const FIELD = 'h-[96px] px-6 text-[38px] text-black bg-white border-4 border-black rounded-lg focus:border-black';
export const BUTTON = 'px-10 h-[96px] items-center justify-center rounded-lg bg-black focus:bg-black';
export const BUTTON_LABEL = 'text-[34px] font-bold text-white';
export const OUTLINE_BUTTON = 'px-10 h-[96px] items-center justify-center rounded-lg border-4 border-black bg-white focus:bg-white';
export const OUTLINE_LABEL = 'text-[34px] font-bold text-black';
export const KEY = 'bg-white text-black border-2 border-black active:bg-white';
