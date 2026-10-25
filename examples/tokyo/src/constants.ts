// Literals used more than once: the city's files, the flight's speeds, the clock.

export const CITY_DIR = 'city/';
export const CITY_INDEX = 'city/city.txt';
export const CITY_HEIGHTS = 'city/heights.bin';
export const FACADE_DAY = 'city/facade.png';
export const FACADE_NIGHT = 'city/facade-night.png';

/** The levels of detail's file suffixes, finest first. */
export const LOD_NAMES: string[] = ['near', 'mid', 'far'];
/** The geometric error of a tile's mid and far levels, metres (the near level's is 0): what the first port's distances gave on the Mac, mid
 *  from 700 m and far from 2200 m with the reference camera at a pixel (REFERENCE_FOCAL: 544 pixels high, 55 degrees). A device's tau and
 *  focal scale them: a smaller screen takes coarser levels nearer. */
export const REFERENCE_FOCAL = 522.5;
export const ERROR_MID = 700 / REFERENCE_FOCAL;
export const ERROR_FAR = 2200 / REFERENCE_FOCAL;

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
/** How far a landmark shines by its own colour once the night has come (the pack's alpha 191: floodlights). */
export const LANDMARK_GLOW: u32 = 0xa0a0a0;
