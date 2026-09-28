// The route as a function of the distance driven: position, heading, street, speed limit, and the steps.
// The data (src/route-data.ts) is generated from OpenStreetMap by tools/build-data.mjs.
import { ROUTE_POINTS, SEGMENT_LIMITS, SEGMENT_STREETS, STREETS, STEPS } from './route-data';

/** One turn-by-turn instruction: the maneuver happens `at` metres from the start. */
export class Step {
  constructor(
    public at: number,
    /** depart | slight | turn | sharp | uturn | roundabout | arrive */
    public type: string,
    /** left | right | '' */
    public side: string,
    /** roundabout exit number */
    public exit: i32,
    /** turn angle in degrees, + = right (roundabouts: from the entry to the exit direction) */
    public angle: number,
    public street: string,
    public text: string,
    /** turn:lanes of the approach ("left|through|through;right"), '' when unknown */
    public lanes: string,
    /** per lane, '1' when it leads to the maneuver */
    public lanesOn: string,
  ) {}
}

export const steps: Step[] = STEPS;
const n: i32 = ROUTE_POINTS.length / 2;
/** Cumulative distance at each route point. */
const cum: number[] = [0];
for (let i: i32 = 1; i < n; i++) {
  const dx = ROUTE_POINTS[i * 2] - ROUTE_POINTS[i * 2 - 2], dy = ROUTE_POINTS[i * 2 + 1] - ROUTE_POINTS[i * 2 - 1];
  cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
}
export const routeLength: number = cum[n - 1];
export const routePointCount: i32 = n;

/** Index of the segment containing distance d (binary search). */
export function segmentAt(d: number): i32 {
  let lo: i32 = 0, hi: i32 = n - 2;
  while (lo < hi) {
    const mid: i32 = (lo + hi + 1) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid - 1;
  }
  return lo;
}
export function pointX(i: i32): number { return ROUTE_POINTS[i * 2]; }
export function pointY(i: i32): number { return ROUTE_POINTS[i * 2 + 1]; }
export function distanceAt(i: i32): number { return cum[i]; }

/** Result of locate(): a point on the route (one shared object, no allocation per call). */
export class RoutePoint { x: number = 0; y: number = 0; }
export const at: RoutePoint = new RoutePoint();

/** Sets `at` to the point `d` metres along the route. */
export function locate(d: number): void {
  const c = Math.max(0, Math.min(routeLength, d));
  const i = segmentAt(c);
  const len = cum[i + 1] - cum[i];
  const t = len > 0 ? (c - cum[i]) / len : 0;
  at.x = ROUTE_POINTS[i * 2] + (ROUTE_POINTS[i * 2 + 2] - ROUTE_POINTS[i * 2]) * t;
  at.y = ROUTE_POINTS[i * 2 + 1] + (ROUTE_POINTS[i * 2 + 3] - ROUTE_POINTS[i * 2 + 1]) * t;
}

/** Direction of travel at d (radians, 0 = east, y south): the chord over ±`span` metres, which rounds the corners. */
export function headingAt(d: number, span: number): number {
  locate(d - span);
  const x0 = at.x, y0 = at.y;
  locate(d + span);
  return Math.atan2(at.y - y0, at.x - x0);
}

export function limitAt(d: number): i32 { return SEGMENT_LIMITS[segmentAt(d)]; }
export function streetAt(d: number): string { return STREETS[SEGMENT_STREETS[segmentAt(d)]]; }

/** Index of the next step after distance d (the maneuver ahead); the last step (arrival) once past everything. */
export function nextStepAt(d: number): i32 {
  for (let i: i32 = 1; i < steps.length; i++) if (steps[i].at > d + 0.5) return i;
  return steps.length - 1;
}

/** Shortest signed difference b - a between two angles, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** "450 m", "1.2 km", "12 km". */
export function formatDistance(m: number): string {
  if (m >= 9950) return `${Math.round(m / 1000)} km`;
  if (m >= 950) return `${(Math.round(m / 100) / 10).toFixed(1)} km`;
  return `${Math.max(0, Math.round(m / 10) * 10)} m`;
}
