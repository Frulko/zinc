// Entrance motion: each element fades in and rises into place, starting `delay` seconds after launch.
import { time } from './state';

const DURATION: number = 0.6;   // seconds per entrance
const RISE: number = 16;        // pixels travelled upward

/** Cubic ease-out of x in [0, 1]. */
function easeOut(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** Progress of an entrance: 0 before `delay`, 1 once it has finished. */
export function reveal(delay: number): number {
  return easeOut((time() - delay) / DURATION);
}

/** Vertical offset of an entrance: RISE pixels below its place at the start, 0 at the end. */
export function rise(delay: number): number {
  return Math.round((1 - reveal(delay)) * RISE);
}
