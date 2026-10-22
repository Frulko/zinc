// The crosses of the touch check, its distortion grid and its look, on a 240 x 320 screen (the ESP32-2432S022 in portrait).
export const SCREEN_W: i32 = 240;
export const SCREEN_H: i32 = 320;
// where the crosses are: the four corners 20 px in, the centre, the bottom bar's buttons and the top third
export const TARGET_X: i32[] = [20, 220, 120, 20, 220, 60, 180, 120];
export const TARGET_Y: i32[] = [20, 20, 160, 300, 300, 298, 298, 60];
export const CROSS_ARM: i32 = 10;           // pixels from the centre of a cross to its ends
export const DOT_SIZE: i32 = 6;             // a dot shows where each tap of the round landed
export const GRID_COLUMNS: i32 = 5;         // the distortion view: where a finger aimed at each point of this grid lands
export const GRID_ROWS: i32 = 7;
export const GRID_MARGIN: i32 = 16;
export const SURE_PX: number = 8;           // the confidence: 0 when the map is known only to a finger's scatter, 100% when exactly
export const BUTTON_H: i32 = 30;
export const BUTTON_W: i32 = 56;
export const BUTTONS_Y: i32 = 232;          // the report's buttons: Again, Apply, Reset, under its card
export const COLOR_ACCENT: i32 = 0x3b82f6;
export const COLOR_CROSS: i32 = 0xffffff;
export const COLOR_DOT: i32 = 0xef4444;
export const COLOR_AIM: i32 = 0x52525b;      // a grid point, where the finger aims
export const COLOR_GOOD: i32 = 0x22c55e;     // where it lands: within 5 px
export const COLOR_FAIR: i32 = 0xf59e0b;     // within 15 px
export const COLOR_TEXT: i32 = 0xa1a1aa;
export const COLOR_CARD: i32 = 0x18181b;
export const GOOD_PX: number = 5;
export const FAIR_PX: number = 15;
