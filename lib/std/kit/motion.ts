// zinc:ui/kit — springs, after CUI's motion (docs/design.md "Motion"; github.com/yappologistic/CUI, MIT, src/cui_core.c).
//
// A spring is a period and a bounce, as SwiftUI's and CUI's: the stiffness is (2π / duration)² and the damping ratio 1 − bounce, so a bounce
// of 0 lands without overshoot (what reports a state) and a small one gives feedback a little life. springTo samples the spring once, in
// closed form, and the engine plays the samples (ui.animateSeries: the compositor moves transforms and opacity without the program);
// under reduced motion (ui.prefersReducedMotion) the property takes its end at once.
//
//   springTo(panel, 'scaleX', 0.96, 1, SPRING_SMOOTH);
//   springTo(thumb, 'translateX', 0, 16, SPRING_STATE);
import * as ui from 'zinc:ui';

export interface Spring {
  duration: number;   // the period, ms: how long the move takes
  bounce: number;     // 0: no overshoot; 0.1 to 0.2: a little life
}

/** What reports a state (a switch thumb, progress, a panel's height): 180 ms, no overshoot. */
export const SPRING_STATE: Spring = { duration: 180, bounce: 0 };
/** Moves and opens (a disclosure, a highlight gliding): CUI's smooth, 400 ms, no overshoot. */
export const SPRING_SMOOTH: Spring = { duration: 400, bounce: 0 };
/** Presses and small feedback: CUI's snappy, 260 ms, a little bounce. */
export const SPRING_SNAPPY: Spring = { duration: 260, bounce: 0.12 };
/** A shape turning into another: CUI's morph, 420 ms. */
export const SPRING_MORPH: Spring = { duration: 420, bounce: 0.16 };

/** Where a spring from 0 to 1 is after t ms (it overshoots 1 when it bounces). */
export function springAt(s: Spring, t: number): number {
  const w = 2 * Math.PI / (s.duration / 1000), z = 1 - s.bounce, ts = t / 1000;
  if (z >= 1) return 1 - (1 + w * ts) * Math.exp(-w * ts);   // critically damped
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * ts) * (Math.cos(wd * ts) + (z * w / wd) * Math.sin(wd * ts));
}

const STEP_MS: number = 1000 / 60;

/** The spring from `from` to `to`, one value every 1/60 s until it rests (within 0.1 % of the move), ending exactly on `to`; [to] alone under reduced motion. */
export function springValues(from: number, to: number, s: Spring): number[] {
  if (ui.prefersReducedMotion() || s.duration <= 0) return [to];
  const out: number[] = [];
  for (let i = 0; i < 600; i++) {   // ponytail: 10 s at most; a spring of a few hundred ms rests long before
    const k = springAt(s, i * STEP_MS);
    out.push(from + (to - from) * k);
    if (i > 0 && Math.abs(1 - k) < 0.001 && Math.abs(springAt(s, (i + 1) * STEP_MS) - k) < 0.001) break;
  }
  out[out.length - 1] = to;
  return out;
}

/** Springs node h's numeric style property `key` (translateX, scaleX, opacity, height...) from `from` to `to`. Under reduced motion it takes
 *  `to` at once. Returns the series id (ui.stopSeries). */
export function springTo(h: i32, key: string, from: number, to: number, s: Spring = SPRING_SMOOTH): i32 {
  return ui.animateSeries(h, key, springValues(from, to, s), STEP_MS, 0, null);
}
