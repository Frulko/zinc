// Sizes and colours of the widgets tour: the zinc palette of zinc:ui/kit (shadcn's dark look), on a 240 x 320 screen.
export const SCREEN_W: i32 = 240;
export const SCREEN_H: i32 = 320;
export const TITLE_H: i32 = 28;
export const NAV_H: i32 = 44;
export const PAGE_H: i32 = SCREEN_H - TITLE_H - NAV_H;
export const GAP: i32 = 8;

export const COLOR_BACKGROUND: i32 = 0x09090b;
export const COLOR_CARD: i32 = 0x18181b;
export const COLOR_BORDER: i32 = 0x27272a;
export const COLOR_MUTED: i32 = 0x27272a;
export const COLOR_MUTED_TEXT: i32 = 0xa1a1aa;
export const COLOR_TEXT: i32 = 0xfafafa;
export const COLOR_ACCENT: i32 = 0x3b82f6;
export const COLOR_GOOD: i32 = 0x10b981;
export const COLOR_HOT: i32 = 0xf43f5e;
export const COLOR_COOL: i32 = 0x0ea5e9;
export const COLOR_DANGER: i32 = 0xdc2626;

// LVGL's built-in symbols (Font Awesome glyphs in its Montserrat fonts)
export const SYMBOL_HOME: string = '\uF015';
export const SYMBOL_SETTINGS: string = '\uF013';
export const SYMBOL_AUDIO: string = '\uF001';
export const SYMBOL_CHARGE: string = '\uF0E7';
export const SYMBOL_LIST: string = '\uF00B';
export const SYMBOL_PREV: string = '\uF048';
export const SYMBOL_PLAY: string = '\uF04B';
export const SYMBOL_PAUSE: string = '\uF04C';
export const SYMBOL_NEXT: string = '\uF051';
export const SYMBOL_OK: string = '\uF00C';

export const PIN_CODE: string = '2432';
export const STATS_EVERY: number = 0.5;   // seconds between two refreshes of the figures
