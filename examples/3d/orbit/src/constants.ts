// Every number of the scene used more than once: sizes, speeds, colours, the light.

/** The light of the far sun, the direction it travels (from the sun towards the planet). */
export const SUN_DIRECTION: number[] = [0.8, -0.25, 0.55];
export const SUN_DISTANCE = 60;
export const SUN_COLOR: u32 = 0xfff1d6;
export const FILL_COLOR: u32 = 0x1c2a4a;      // the blue bounce from the opposite side
export const AMBIENT: u32 = 0x10131c;
export const SPACE: u32 = 0x05060c;

export const PLANET_RADIUS = 2;
export const RING_INNER = 2.6;
export const RING_OUTER = 4.4;
export const BELT_INNER = 7.5;
export const BELT_OUTER = 9;
export const STARS = 260;
export const STAR_RADIUS = 80;
export const ASTEROIDS = 140;

/** Radians per second. */
export const PLANET_SPIN = 0.25;
export const BELT_SPIN = 0.03;
export const CAMERA_DRIFT = 0.08;     // the camera's slow orbit while nobody touches the pad
export const CAMERA_TURN = 1.6;
export const CAMERA_ZOOM = 6;         // world units per second
export const CAMERA_NEAR = 6;
export const CAMERA_FAR = 22;

/** On the 3DS, the eyes' half distance at the slider's top, in world units. */
export const EYE_SEPARATION = 0.25;
