// Shared pinball policy. Distances use the caller's units (inches in 2D, centimetres in 3D).
export const SLOPE_DEGREES: number = 6.5;
export const GRAVITY_CM: number = 981;
export const MAX_SPEED_CM: number = 700;
export const PLUNGER_SPEED_CM: number = 480;
export const INCH_CM: number = 2.54;
export const FLIPPER_SPEED_DEGREES: number = 1800;
export const FLIPPER_RETURN_DEGREES: number = 1100;

/** A solid sphere trades 2/7 of its downhill acceleration for rolling rotation. */
export function rollingGravity(gravity: number, slope: number): number {
  return gravity * Math.sin(slope * Math.PI / 180) * 5 / 7;
}

/** Bound relative travel to half a radius, as Space Cadet does, including moving flippers. */
export function travelSteps(dt: number, radius: number, relativeSpeed: number): i32 {
  return Math.max(1, Math.ceil(Math.max(0, relativeSpeed) * dt / (radius * 0.5)));
}

/** Apply a speed limit at the impulse, avoiding an oversized shot chopped on the next step. */
export function speedScale(speed: number, limit: number): number {
  return speed > limit ? limit / speed : 1;
}
