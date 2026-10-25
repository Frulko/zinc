// Literals used more than once: the city's files, the flight's speeds, the clock.

export const CITY_WORLD = 'city/city.zworld';
export const CITY_INDEX = 'city/city.txt';
export const CITY_HEIGHTS = 'city/heights.bin';
export const CITY_HMAP = 'city/hmap.bin';

/** The tour: metres a second along its loop (tokyo-sim's Flight::new). */
export const TOUR_SPEED = 60;
/** Metres the eye keeps above what stands under it and around it (tokyo-sim's clearance). */
export const CLEARANCE = 14;
/** The free camera: never lower than this over what it flies over, never higher than the ceiling. */
export const FLOOR = 6;
export const CEILING = 1400;
/** Hours of Tokyo's clock a second, left alone, and when the clock is turned by hand. */
export const CLOCK_RATE = 0.03;
export const CLOCK_TURN = 2.5;
/** The day of the year the sun is placed for (0 = 1 January): late October. */
export const DAY_OF_YEAR = 297;

export const FIELD_OF_VIEW = 55;
export const NEAR_PLANE = 4;
export const FAR_PLANE = 6000;

/** The panel (src/panel.ts): the 3DS's touch screen, an overlay elsewhere. */
export const PANEL_W: i32 = 320;
export const PANEL_H: i32 = 240;
export const PANEL_BG: u32 = 0x10131c;
export const PANEL_BUTTON: u32 = 0x262b38;
export const PANEL_ON: u32 = 0x2f6fde;
export const PANEL_FOCUS: u32 = 0xf4c542;
export const PANEL_TEXT: u32 = 0xf4f4f5;
export const PANEL_DIM: u32 = 0xa1a1aa;
export const TOWER_RED: u32 = 0xff5a36;
/** The panel's map: the corner of what it shows (Shiba, from Azabu to the bay), metres a pixel, its size. */
export const MAP_X0 = -1024;
export const MAP_Z0 = -1400;
export const MAP_METRES = 24;
export const MAP_W: i32 = 128;
export const MAP_H: i32 = 96;
/** Metres between the eyes of the 3DS's stereo picture at full slider (a city wants more than a person's 6.5 cm). */
export const STEREO_SPREAD = 1.5;
