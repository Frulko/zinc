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
/** AppLoad's tiles (zinc-tile's ZINC_APPLOAD): Clean up AppLoad looks there for tiles whose package is gone. */
export const APPLOAD_DIR = envOr('ZINC_APPLOAD', '/home/root/xovi/exthome/appload');
/** Where the apps keep their own files: <dir>/<name>/ (Zinc Web's ~/.zinc/web, Read's ~/.zinc/markdown). Reset data empties it. */
export const APP_DATA_DIR = envOr('ZINC_HUB_APP_DATA', HOME + '/.zinc');
/** The zinc:storage all apps shared before each got its own (an app's keys move out of it when it first runs on a newer engine). */
export const SHARED_STORAGE = envOr('ZINC_HOME', HOME + '/.zinc') + '/storage.kv';
/** The name the server records for this device at pairing. */
export const DEVICE_NAME = envOr('ZINC_HUB_DEVICE', 'reMarkable');
/** What this engine runs (src/main.cpp sets them): a package that needs a newer ZBC or more runtime calls is not installed. */
export const ENGINE_ZBC: i32 = parseInt(envOr('ZINC_HUB_ENGINE_ZBC', envOr('ZINC_ENGINE_ZBC', '0')));
export const ENGINE_RT: i32 = parseInt(envOr('ZINC_HUB_ENGINE_RT', envOr('ZINC_ENGINE_RT', '0')));
/** The engine directory the hub runs from (zinc-app sets ZINC_RMPP_ENGINE, /home/root/zinc): an engine update replaces it. '' (a desktop): no engine updates. */
export const ENGINE_DIR = sys.env('ZINC_RMPP_ENGINE');
export const DEFAULT_SERVER = 'http://10.11.99.2:8787';
export const STABLE = 'stable';
export const HUB_ID = 'dev.zinc.hub';   // the hub's own app id: updating it restarts it
export const REQUEST_TIMEOUT_MS: i32 = 20000;
export const MAX_ZAPP_BYTES: i32 = 64 * 1024 * 1024;   // ponytail: also the engine bundle's ceiling (39 MB in 0.9), the most zinc:net fetches
export const ENGINE_TIMEOUT_MS: i32 = 600000;

// E-paper: pure black on white, thick outlines, large type and targets, no greys, shadows or transitions (they ghost).
export const PAGE = 'flex-col h-full bg-white';
export const SECTION = 'flex-col gap-6 p-10';
export const TITLE = 'text-[48px] font-bold text-black';
export const LABEL = 'text-[34px] text-black';
export const SMALL = 'text-[28px] text-black';
export const FIELD = 'h-[96px] px-6 text-[38px] text-black bg-white border-4 border-black rounded-lg focus:border-black';
export const BUTTON = 'px-10 h-[96px] items-center justify-center rounded-lg bg-black focus:bg-black disabled:opacity-40';
export const BUTTON_LABEL = 'text-[34px] font-bold text-white';
export const OUTLINE_BUTTON = 'px-10 h-[96px] items-center justify-center rounded-lg border-4 border-black bg-white focus:bg-white disabled:opacity-40';
export const OUTLINE_LABEL = 'text-[34px] font-bold text-black';
