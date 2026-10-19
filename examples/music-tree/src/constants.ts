// ============================================================================
// constants.ts — Constantes globales de l'application Musique
// ============================================================================
// Ce fichier rassemble toutes les couleurs (palette sombre inspirée d'iOS),
// les dimensions de mise en page, les ports réseau et les identifiants des
// pages et des écrans du carrousel. Aucune valeur magique ne doit être
// codée en dur ailleurs dans l'application.

// ----------------------------------------------------------------------------
// Palette de couleurs (format hexadécimal 0xRRGGBB)
// ----------------------------------------------------------------------------
export const COLOR_BACKGROUND: u32 = 0x000000;
export const COLOR_CARD: u32 = 0x1c1c1e;
export const COLOR_CARD_ELEVATED: u32 = 0x2c2c2e;
export const COLOR_FILL: u32 = 0x3a3a3c;
export const COLOR_SEPARATOR: u32 = 0x38383a;

export const COLOR_TEXT_PRIMARY: u32 = 0xffffff;
export const COLOR_TEXT_SECONDARY: u32 = 0x98989f;
export const COLOR_TEXT_TERTIARY: u32 = 0x636366;

export const COLOR_ACCENT: u32 = 0xfa2d48;   // Rouge Apple Music
export const COLOR_GREEN: u32 = 0x1ed760;    // Vert Spotify / lecture active
export const COLOR_BLUE: u32 = 0x0a84ff;     // Bleu iOS
export const COLOR_ORANGE: u32 = 0xff9f0a;   // Orange aiguille des secondes
export const COLOR_DANGER: u32 = 0xff453a;   // Rouge suppression / batterie faible

/** Couleurs des anneaux d'activité et des volumes par pièce. */
export const RING_COLORS: u32[] = [
  0xfa114f,
  0x92e82a,
  0x1eeaef,
  0xff9f0a,
  0xbf5af2,
];

/** Couleurs de dégradé pour les pochettes générées à partir des initiales. */
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
// Dimensions de mise en page (en pixels logiques, écran cible 1024x768)
// ----------------------------------------------------------------------------
export const STATUS_BAR_HEIGHT = 30;
export const SIDEBAR_WIDTH_DEFAULT = 240;
export const PAGE_PADDING = 36;
export const KEYBOARD_HEIGHT = 300;
export const LIST_ROW_HEIGHT = 68;
export const GRID_COLUMNS: i32 = 4;
export const GRID_GAP = 24;

// ----------------------------------------------------------------------------
// Identifiants des pages principales (barre latérale)
// ----------------------------------------------------------------------------
export const PAGE_NOW_PLAYING: i32 = 0;
export const PAGE_RADIOS: i32 = 1;
export const PAGE_SPOTIFY: i32 = 2;
export const PAGE_ROOMS: i32 = 3;
export const PAGE_SETTINGS: i32 = 4;
export const PAGE_COUNT: i32 = 5;

// ----------------------------------------------------------------------------
// Identifiants des écrans (slides) du carrousel de la page d'accueil
// ----------------------------------------------------------------------------
export const SLIDE_PLAYER: i32 = 0;
export const SLIDE_CLOCK: i32 = 1;
export const SLIDE_WEATHER: i32 = 2;
export const SLIDE_RINGS: i32 = 3;
export const SLIDE_NOTIFICATIONS: i32 = 4;
export const SLIDE_COUNT: i32 = 5;

// ----------------------------------------------------------------------------
// Identifiants des cadrans de l'horloge StandBy
// ----------------------------------------------------------------------------
export const CLOCK_FACE_ANALOG: i32 = 0;
export const CLOCK_FACE_DIGITAL: i32 = 1;
export const CLOCK_FACE_RINGS: i32 = 2;
export const CLOCK_FACE_LAVA: i32 = 3;
export const CLOCK_FACE_ODOMETER: i32 = 4;
export const CLOCK_FACE_COUNT: i32 = 5;

// ----------------------------------------------------------------------------
// Réseau, pagination et cache d'images
// ----------------------------------------------------------------------------
export const SSDP_PORT: i32 = 37451;
export const REMOTE_UDP_PORT: i32 = 7777;
export const SPOTIFY_PAGE_SIZE: i32 = 20;

export const MAX_CACHED_PICTURES: i32 = 60;
export const MAX_INFLIGHT_DOWNLOADS: i32 = 4;
export const MAX_PICTURE_DIMENSION = 400;
export const PICTURE_FADE_DURATION_MS = 220;

// ----------------------------------------------------------------------------
// Textes de dates en français
// ----------------------------------------------------------------------------
export const WEEKDAYS_SHORT: string[] = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const WEEKDAYS_CAPITALIZED: string[] = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
export const WEEKDAYS_LONG: string[] = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const MONTHS_SHORT: string[] = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MONTHS_LONG: string[] = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
