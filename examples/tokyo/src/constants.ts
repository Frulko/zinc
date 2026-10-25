// Literals used more than once: the city's files, the flight's speeds, the clock.

export const CITY_WORLD = 'city/city.zworld';
export const CITY_INDEX = 'city/city.txt';
export const CITY_HEIGHTS = 'city/heights.bin';

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
