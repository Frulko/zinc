// Colours (two zinc:ui colour schemes, light and dark, that follow the system), sizes, timings and the iPods' colours:
// every literal used twice.
import * as ui from 'zinc:ui';

// ---- colours: scheme variables, so a theme change restyles the nodes without re-rendering anything
const NAMES = ['ipBg', 'ipSidebar', 'ipCard', 'ipHover', 'ipSelected', 'ipBorder', 'ipText', 'ipMuted', 'ipFaint', 'ipAccent', 'ipAccentSoft', 'ipError', 'ipTrack', 'ipStripe'];
const LIGHT: i32[] = [0xffffff, 0xf3f3f5, 0xffffff, 0xe9e9ec, 0xdedee3, 0xe4e4e7, 0x1d1d1f, 0x6e6e73, 0xa1a1a6, 0xfa2d48, 0xfde8eb, 0xd70015, 0xececf0, 0xf7f7f9];
const DARK: i32[] = [0x1c1c1e, 0x242426, 0x2c2c2e, 0x323236, 0x3a3a3e, 0x38383c, 0xf5f5f7, 0x98989d, 0x6c6c70, 0xff375f, 0x4a1f29, 0xff6961, 0x3a3a3e, 0x232325];
ui.defineScheme('light', NAMES, LIGHT);
ui.defineScheme('dark', NAMES, DARK);

export const BACKGROUND = 0, SIDEBAR = 1, CARD = 2, HOVER = 3, SELECTED = 4, BORDER = 5, TEXT = 6, MUTED = 7, FAINT = 8, ACCENT = 9,
  ACCENT_SOFT = 10, ERROR = 11, TRACK = 12, STRIPE = 13;

function v(c: i32): string { return `[var(--${NAMES[c]})]`; }
export function bg(c: i32): string { return `bg-${v(c)}`; }
export function fg(c: i32): string { return `text-${v(c)}`; }
export function bd(c: i32): string { return `border-${v(c)}`; }
/** The colour of `c` in the scheme shown now (0xRRGGBB), for what is drawn rather than styled (icons). */
export function color(c: i32): i32 { return ui.currentScheme() === 'dark' ? DARK[c] : LIGHT[c]; }
/** The window's clear colour before the tree paints. */
export const CLEAR_COLOR: i32 = LIGHT[BACKGROUND];

// ---- the storage bar: one colour per kind of media (Device.mediaType), then the rest of the disk
export const MEDIA_KINDS: string[] = ['audio', 'podcast', 'audiobook', 'video', 'musicvideo', 'tvshow'];
export const MEDIA_NAMES: string[] = ['Music', 'Podcasts', 'Audiobooks', 'Videos', 'Music videos', 'TV shows'];
export const MEDIA_COLORS: i32[] = [0xfa2d48, 0xaf52de, 0xff9500, 0x007aff, 0x34c759, 0x5ac8fa];
export const OTHER_COLOR: i32 = 0x8e8e93;

// ---- the iPod's colour from its model name ("iPod Classic (Black)"): body, screen frame, click wheel, centre button
export class PodColors { body: i32; wheel: i32; button: i32; dark: boolean;
  constructor(body: i32, wheel: i32, button: i32, dark: boolean) { this.body = body; this.wheel = wheel; this.button = button; this.dark = dark; } }
const POD_COLOR_NAMES: string[] = ['Black', 'Silver', 'White', 'Pink', 'Blue', 'Green', 'Gold', 'Red', 'Purple', 'Orange', 'Yellow', 'Grey', 'Gray'];
const POD_COLORS: PodColors[] = [
  new PodColors(0x2b2b2e, 0x111113, 0x2b2b2e, true), new PodColors(0xd9dadc, 0xf4f4f5, 0xc9cacd, false),
  new PodColors(0xf5f5f5, 0xffffff, 0xe6e6e6, false), new PodColors(0xf2a7c3, 0xffffff, 0xe896b4, false),
  new PodColors(0x7fb2e5, 0xffffff, 0x6aa0d6, false), new PodColors(0x9bd48b, 0xffffff, 0x88c478, false),
  new PodColors(0xe6cf98, 0xffffff, 0xd8bf85, false), new PodColors(0xd5303e, 0xffffff, 0xc0242f, false),
  new PodColors(0x9a7cc9, 0xffffff, 0x8a6cba, false), new PodColors(0xf3a14b, 0xffffff, 0xe3903a, false),
  new PodColors(0xf2e16b, 0xffffff, 0xe3d15a, false), new PodColors(0x8e8e93, 0x2b2b2e, 0x7d7d82, true),
  new PodColors(0x8e8e93, 0x2b2b2e, 0x7d7d82, true),
];
/** The colours of an iPod from its model name; silver when the name has none. */
export function podColors(model: string): PodColors {
  for (let i = 0; i < POD_COLOR_NAMES.length; i++) if (model.indexOf(`(${POD_COLOR_NAMES[i]})`) >= 0 || model.indexOf(` ${POD_COLOR_NAMES[i]}`) >= 0) return POD_COLORS[i];
  return POD_COLORS[1];
}

// ---- sizes (px)
export const SIDEBAR_WIDTH: i32 = 232;
export const ROW_HEIGHT: i32 = 34;          // a track row of the tables
export const GRID_COLUMNS: i32 = 4;         // albums per row of the grid: four fit the window opened (1180 px)
export const COVER_SIZE: i32 = 168;         // an album's cover in the grid
export const GRID_ROW_HEIGHT: i32 = 236;    // cover, two lines of text and the gap
export const HEADER_COVER_SIZE: i32 = 200;  // the cover at the top of an album
export const POD_WIDTH: i32 = 220;          // the drawing of the iPod
export const PHOTO_SIZE: i32 = 150;         // a photo in the grid
export const PHOTO_ROW_HEIGHT: i32 = 166;   // a photo and the gap
export const PHOTO_VIEW_SIZE: i32 = 640;    // a photo opened
export const LCD_WIDTH: i32 = 460;          // the now-playing panel at the top
export const PROGRESS_WIDTH: i32 = 300;     // its progress bar

// ---- timings
export const SCAN_EVERY_MS: i32 = 3000;     // detect() again: an iPod mounted, unmounted or pulled shows within this time
export const LOG_KEEP: i32 = 500;           // operations kept on the Logs page (the file keeps them all)

// ---- pages
export const PAGE_OVERVIEW = 'overview', PAGE_ALBUMS = 'albums', PAGE_SONGS = 'songs', PAGE_PODCASTS = 'podcasts', PAGE_AUDIOBOOKS = 'audiobooks',
  PAGE_VIDEOS = 'videos', PAGE_PHOTOS = 'photos', PAGE_PLAYLISTS = 'playlists', PAGE_FILES = 'files', PAGE_SPECS = 'specs', PAGE_ADD = 'add',
  PAGE_BACKUPS = 'backups', PAGE_OPTIMISE = 'optimise', PAGE_TRANSFERS = 'transfers', PAGE_LOGS = 'logs';

// ---- adding: the kinds a file can be added as (TrackInput.mediaType) and the files a folder gives
export const ADD_KINDS: string[] = ['audio', 'podcast', 'audiobook', 'video'];
export const ADD_KIND_NAMES: string[] = ['Music', 'Podcast', 'Audiobook', 'Video'];
/** What zinc:ipod can copy (a folder's other files are left out; a file picked by hand is tried and refused with its reason). */
export const MEDIA_EXTENSIONS: string[] = ['mp3', 'm4a', 'aac', 'm4b', 'm4p', 'wav', 'aif', 'aiff', 'mp4', 'm4v', 'mov'];

/** The kinds of media (Track.mediaType) each page of tracks lists. */
export function kindsOf(page: string): string[] {
  if (page === PAGE_PODCASTS) return ['podcast'];
  if (page === PAGE_AUDIOBOOKS) return ['audiobook'];
  if (page === PAGE_VIDEOS) return ['video', 'musicvideo', 'tvshow'];
  return ['audio'];
}
