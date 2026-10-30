// ============================================================================
// constants.ts — Colours, sizes, paths and limits of the player
// ============================================================================

// ----------------------------------------------------------------------------
// The session (zinc-session) and the system helper (zinc-admin)
// ----------------------------------------------------------------------------

/** Where zinc-session keeps crash.txt (`ZINC_RUN` overrides). */
export const DEFAULT_RUN_DIRECTORY = '/run/zinc';
/** The app the session starts (`ZINC_APP` overrides). */
export const DEFAULT_APP_PATH = '/var/lib/zinc/app';
export const CRASH_REPORT_FILE = 'crash.txt';
/** The helper that reads the system and changes it (Wi-Fi, SSH, the agent, the name, power); `ZINC_ADMIN` overrides. */
export const DEFAULT_ADMIN_PATH = '/usr/lib/zinc/zinc-admin';
/** The exit status that tells zinc-session to start the app. */
export const EXIT_START_APP = 10;
/** In the run directory: the folder of the app sent to the device that zinc-session starts instead of its own. */
export const NEXT_APP_FILE = 'next-app';
/** The apps the home page shows; past this many a + opens the page with all of them. */
export const HOME_APPS_SHOWN = 6;

/** How often the system's state is read again: on the settings page, and on the other pages. */
export const SETTINGS_REFRESH_INTERVAL_MS = 4000;
export const PAGE_REFRESH_INTERVAL_MS = 8000;
/** How often the clock is looked at (it is redrawn only when its minute changes). */
export const CLOCK_INTERVAL_MS = 1000;
/** The home page's animation stops after this long without a touch, a click or a key, and starts again at the next. */
export const ANIMATION_PAUSE_AFTER_IDLE_SECONDS = 60;

export const BYTES_PER_MIB = 1048576;

// ----------------------------------------------------------------------------
// Pages and settings sections
// ----------------------------------------------------------------------------

export const PAGE_HOME = 'home';
export const PAGE_CRASH = 'crash';
export const PAGE_SETTINGS = 'settings';
export const PAGE_APPS = 'apps';

export const SECTION_WIFI = 'wifi';
export const SECTION_REMOTE = 'remote';
export const SECTION_PREFERENCES = 'preferences';
export const SECTION_SYSTEM = 'system';
export const SECTION_UPDATES = 'updates';

export const KEYBOARD_QWERTY = 'qwerty';
export const KEYBOARD_AZERTY = 'azerty';

// ----------------------------------------------------------------------------
// Colours
// ----------------------------------------------------------------------------

/** The backgrounds of the home page: a name, the top and the bottom colour of a vertical gradient. */
export class BackgroundTheme {
  name: string;
  topColor: u32;
  bottomColor: u32;
  constructor(name: string, topColor: u32, bottomColor: u32) {
    this.name = name;
    this.topColor = topColor;
    this.bottomColor = bottomColor;
  }
}

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  new BackgroundTheme('Sunrise', 0xff8a5b, 0xd9437a),
  new BackgroundTheme('Ocean', 0x2ea3e6, 0x4a4fd6),
  new BackgroundTheme('Forest', 0x2bb685, 0x15707f),
  new BackgroundTheme('Night', 0x3b4080, 0x14162b),
];

export const COLOR_WHITE: u32 = 0xffffff;
export const COLOR_BACKGROUND: u32 = 0x111318;
export const COLOR_SIDEBAR: u32 = 0x171a21;
export const COLOR_CARD: u32 = 0x1e222b;
export const COLOR_CARD_PRESSED: u32 = 0x2a2f3a;
export const COLOR_INSET: u32 = 0x0b0d11;
export const COLOR_SEPARATOR: u32 = 0x2a2f3a;
export const COLOR_TEXT_PRIMARY: u32 = 0xf2f4f8;
export const COLOR_TEXT_SECONDARY: u32 = 0x98a1b0;
export const COLOR_ACCENT: u32 = 0x5b8cff;
export const COLOR_DANGER: u32 = 0xf0506e;
export const COLOR_SUCCESS: u32 = 0x34c77b;
export const COLOR_FOCUS_RING: u32 = 0x8fb3ff;

export const COLOR_KEYBOARD: u32 = 0x1a1c22;
export const COLOR_KEY: u32 = 0x3a3e48;
export const COLOR_KEY_SPECIAL: u32 = 0x2a2d35;
export const COLOR_KEY_PRESSED: u32 = 0x6a7080;

// ----------------------------------------------------------------------------
// Sizes (logical pixels; the layout fits 800 x 480 and grows with the screen)
// ----------------------------------------------------------------------------

export const TOP_BAR_HEIGHT = 56;
export const PAGE_PADDING = 28;
export const SIDEBAR_WIDTH = 210;
export const ROW_HEIGHT = 52;
export const BUTTON_HEIGHT = 46;
export const CORNER_RADIUS = 14;
export const HOME_CONTENT_MAX_WIDTH = 620;

export const KEY_HEIGHT = 50;
export const KEY_GAP = 7;
export const KEYBOARD_HEIGHT = KEY_HEIGHT * 4 + KEY_GAP * 5;
export const TEXT_FORM_WIDTH = 520;

/** The last lines of a crashed app kept on the screen. */
export const CRASH_LINES_SHOWN = 80;
