// Android's scroll physics for zinc:ui (docs/ui.md, "Scrolling"): the fling of android.widget.OverScroller (AOSP, Apache 2.0: the spline
// curve of SplineOverScroller, its constants and its formulas, ported as they are) and the stretch overscroll of Android 12's EdgeEffect.
// Units: logical pixels and seconds; OverScroller works in device pixels at 160 dpi per density unit, and the density cancels out of its formulas,
// so the curve below at density 1 gives the same durations and the same distances in logical pixels.
const DECELERATION_RATE: number = Math.log(0.78) / Math.log(0.9);   // 2.3582...
const INFLEXION: number = 0.35, START_TENSION: number = 0.5, END_TENSION: number = 1.0;
const P1: number = START_TENSION * INFLEXION, P2: number = 1.0 - END_TENSION * (1.0 - INFLEXION);
const NB_SAMPLES: i32 = 100;
/** ViewConfiguration.getScrollFriction(). */
export const SCROLL_FRICTION: number = 0.015;
/** SensorManager.GRAVITY_EARTH * 39.37 (inches per metre) * 160 (dpi at density 1) * 0.84 (a tuning of AOSP's). */
const PHYSICAL_COEFF: number = 9.80665 * 39.37 * 160.0 * 0.84;
/** ViewConfiguration's minimum and maximum fling velocities (50 and 8000 dp/s). */
export const MIN_FLING_V: number = 50, MAX_FLING_V: number = 8000;

const SPLINE_POSITION: number[] = [];
function buildSpline(): void {
  let xMin: number = 0;
  for (let i = 0; i < NB_SAMPLES; i++) {
    const alpha = i / NB_SAMPLES;
    let xMax: number = 1, x: number = 0, coef: number = 0;
    for (let k = 0; k < 60; k++) {   // bisection, as AOSP's while (true) to 1e-5
      x = xMin + (xMax - xMin) / 2;
      coef = 3 * x * (1 - x);
      const tx = coef * ((1 - x) * P1 + x * P2) + x * x * x;
      if (Math.abs(tx - alpha) < 1e-5) break;
      if (tx > alpha) xMax = x; else xMin = x;
    }
    SPLINE_POSITION.push(coef * ((1 - x) * START_TENSION + x) + x * x * x);
  }
  SPLINE_POSITION.push(1);
}

/** A fling of OverScroller from velocity v (px/s): its distance (px, signed as v) and duration (ms). */
export class Fling { distance: number = 0; duration: number = 0; }
export function fling(v: number): Fling {
  if (SPLINE_POSITION.length === 0) buildSpline();
  const f = new Fling();
  const av = Math.min(MAX_FLING_V, Math.abs(v));
  if (av === 0) return f;
  const l = Math.log(INFLEXION * av / (SCROLL_FRICTION * PHYSICAL_COEFF));   // getSplineDeceleration
  f.duration = 1000 * Math.exp(l / (DECELERATION_RATE - 1));                   // getSplineFlingDuration
  f.distance = (v < 0 ? -1 : 1) * SCROLL_FRICTION * PHYSICAL_COEFF * Math.exp(DECELERATION_RATE / (DECELERATION_RATE - 1) * l);   // getSplineFlingDistance
  return f;
}
/** The fraction of the fling's distance done at the fraction t of its duration, and the velocity there (px/s): SplineOverScroller.update. */
let splineV: number = 0;
export function splineAt(t: number, f: Fling): number {
  if (SPLINE_POSITION.length === 0) buildSpline();
  if (t >= 1) { splineV = 0; return 1; }
  const index: i32 = Math.floor(NB_SAMPLES * t);
  const tInf = index / NB_SAMPLES, tSup = (index + 1) / NB_SAMPLES;
  const dInf = SPLINE_POSITION[index], dSup = SPLINE_POSITION[index + 1];
  const velocityCoef = (dSup - dInf) / (tSup - tInf);
  splineV = f.duration > 0 ? velocityCoef * f.distance / f.duration * 1000 : 0;
  return dInf + (t - tInf) * velocityCoef;
}
/** The velocity at the last splineAt (px/s). */
export function splineVelocity(): number { return splineV; }

// ---- the stretch overscroll (Android 12 EdgeEffect): a pull past an edge stretches the content instead of moving it; the stretch shown is
// at most 8 % of the viewport (an exponential approach, as the stretch of EdgeEffect saturates), and it springs back with the stiffness and
// damping of EdgeEffect's release (200, 0.98). A fling that reaches an edge is absorbed as a stretch velocity.
// ponytail: the curve's constants are fitted to the look, not copied (EdgeEffect drives a RenderNode stretch shader we do not have); the
// stretch is drawn by spreading the scroll container's children from the pulled edge (ui.ts paint).
export const STRETCH_MAX: number = 0.08, STRETCH_K: number = 200, STRETCH_DAMPING: number = 0.98, ABSORB: number = 0.25;
/** The stretch (px) shown for an overscroll of `over` px on a viewport of `dim` px. */
export function stretchOf(over: number, dim: number): number {
  const d = Math.max(1, dim), s = d * STRETCH_MAX * (1 - Math.exp(-Math.abs(over) / (d * 0.5)));
  return over < 0 ? -s : s;
}
/** The overscroll that shows the stretch s (stretchOf's inverse), to take a stretch back in hand. */
export function overOf(s: number, dim: number): number {
  const d = Math.max(1, dim), k = Math.min(0.999, Math.abs(s) / (d * STRETCH_MAX));
  const o = -Math.log(1 - k) * d * 0.5;
  return s < 0 ? -o : o;
}
