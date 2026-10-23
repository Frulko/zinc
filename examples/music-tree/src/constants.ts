// ============================================================================
// constants.ts — Global constants of the Music application
// ============================================================================
// This file gathers all the colors (dark palette inspired by iOS),
// the layout dimensions, the network ports and the identifiers of the
// pages and carousel slides. No magic value should be
// hard-coded elsewhere in the application.

// ----------------------------------------------------------------------------
// Color palette (hexadecimal format 0xRRGGBB)
// ----------------------------------------------------------------------------
export const COLOR_BACKGROUND: u32 = 0x000000;
export const COLOR_CARD: u32 = 0x1c1c1e;
export const COLOR_CARD_ELEVATED: u32 = 0x2c2c2e;
export const COLOR_FILL: u32 = 0x3a3a3c;
export const COLOR_SEPARATOR: u32 = 0x38383a;

export const COLOR_TEXT_PRIMARY: u32 = 0xffffff;
export const COLOR_TEXT_SECONDARY: u32 = 0x98989f;
export const COLOR_TEXT_TERTIARY: u32 = 0x636366;

export const COLOR_ACCENT: u32 = 0xfa2d48;   // Apple Music red
export const COLOR_GREEN: u32 = 0x1ed760;    // Spotify green / active playback
export const COLOR_ORANGE: u32 = 0xff9f0a;   // Orange of the seconds hand
export const COLOR_DANGER: u32 = 0xff453a;   // Red for delete / low battery

/** Colors of the activity rings and the per-room volumes. */
export const RING_COLORS: u32[] = [
  0xfa114f,
  0x92e82a,
  0x1eeaef,
  0xff9f0a,
  0xbf5af2,
];

/** Gradient colors for the covers generated from initials. */
export const COVER_TINT_COLORS: u32[] = [
  0xfa2d48,
  0xff9f0a,
  0x30d158,
  0x0a84ff,
  0xbf5af2,
  0xff375f,
  0x64d2ff,
  0xffd60a,
];

// ----------------------------------------------------------------------------
// Defaults for wide layouts (logical pixels); core/responsive.ts adapts compact screens
// ----------------------------------------------------------------------------
export const STATUS_BAR_HEIGHT = 30;
export const SIDEBAR_WIDTH_DEFAULT = 240;
export const PAGE_PADDING = 36;
export const KEYBOARD_HEIGHT = 300;
export const GRID_GAP = 24;

// ----------------------------------------------------------------------------
// Identifiers of the main pages (sidebar)
// ----------------------------------------------------------------------------
export const PAGE_NOW_PLAYING: i32 = 0;
export const PAGE_RADIOS: i32 = 1;
export const PAGE_SPOTIFY: i32 = 2;
export const PAGE_ROOMS: i32 = 3;
export const PAGE_SETTINGS: i32 = 4;

// ----------------------------------------------------------------------------
// Identifiers of the slides of the home page carousel
// ----------------------------------------------------------------------------
export const SLIDE_PLAYER: i32 = 0;
export const SLIDE_CLOCK: i32 = 1;
export const SLIDE_WEATHER: i32 = 2;
export const SLIDE_RINGS: i32 = 3;
export const SLIDE_NOTIFICATIONS: i32 = 4;
export const SLIDE_COUNT: i32 = 5;

// ----------------------------------------------------------------------------
// Identifiers of the StandBy clock faces
// ----------------------------------------------------------------------------
export const CLOCK_FACE_ANALOG: i32 = 0;
export const CLOCK_FACE_DIGITAL: i32 = 1;
export const CLOCK_FACE_RINGS: i32 = 2;
export const CLOCK_FACE_LAVA: i32 = 3;
export const CLOCK_FACE_ODOMETER: i32 = 4;
export const CLOCK_FACE_COUNT: i32 = 5;

// ----------------------------------------------------------------------------
// Network, pagination and image cache
// ----------------------------------------------------------------------------
export const SSDP_PORT: i32 = 37451;
export const REMOTE_UDP_PORT: i32 = 7777;
export const SPOTIFY_PAGE_SIZE: i32 = 20;

export const MAX_CACHED_PICTURES: i32 = 60;
export const MAX_INFLIGHT_DOWNLOADS: i32 = 4;
export const MAX_PICTURE_DIMENSION = 400;
export const PICTURE_FADE_DURATION_MS = 220;

// ----------------------------------------------------------------------------
// Date texts in French
// ----------------------------------------------------------------------------
export const WEEKDAYS_SHORT: string[] = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const WEEKDAYS_CAPITALIZED: string[] = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
export const WEEKDAYS_LONG: string[] = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const MONTHS_SHORT: string[] = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MONTHS_LONG: string[] = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
