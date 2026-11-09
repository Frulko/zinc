// The easing curves of zinc:ui (D182 step 6): one definition for the script and the compositor. lib/std/ui.ts reaches them through
// zinc:gfx ease(); runtime/gfx.cpp samples the declared animations with them on the render thread. Both sample one animation with the
// same arithmetic in the same order, so a value the compositor shows is bit-equal to the one the script computes at the same clock.
// Freestanding (the runtime has no libc++ headers): __builtin maths only. No contraction into fused multiply-adds, which the
// interpreter does not do either: the script's and the compositor's values stay bit-equal.
#pragma once

namespace zn::ease {

// The kinds (ui.ts easeOf): 0 linear, 1 in (cubic), 2 out, 3 inOut, 4 underdamped spring, 5-8 the CSS cubic-béziers (Tailwind's
// ease-in, ease-out, ease-in-out; CSS's ease), 9-11 the iOS curves of LayoutAnimation (easeIn, easeOut, easeInEaseOut).
inline double cubic_bezier(double x1, double y1, double x2, double y2, double x) {
#pragma clang fp contract(off)
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  double lo = 0, hi = 1, u = x;
  for (int i = 0; i < 30; i++) {   // the curve's x(u) by bisection
    const double v = ((1 - 3 * x2 + 3 * x1) * u + (3 * x2 - 6 * x1)) * u * u + 3 * x1 * u;
    if (__builtin_fabs(v - x) < 1e-7) break;
    if (v < x) lo = u; else hi = u;
    u = (lo + hi) / 2;
  }
  return ((1 - 3 * y2 + 3 * y1) * u + (3 * y2 - 6 * y1)) * u * u + 3 * y1 * u;
}

/** The eased progress of `t` in [0, 1) (the spring overshoots 1). */
inline double at(int e, double t) {
#pragma clang fp contract(off)
  switch (e) {
    case 0: return t;
    case 1: return t * t * t;
    case 2: { const double u = 1 - t; return 1 - u * u * u; }
    case 3: return t < 0.5 ? 4 * t * t * t : 1 - __builtin_pow(-2 * t + 2, 3) / 2;
    case 5: return cubic_bezier(0.4, 0, 1, 1, t);
    case 6: return cubic_bezier(0, 0, 0.2, 1, t);
    case 7: return cubic_bezier(0.4, 0, 0.2, 1, t);
    case 8: return cubic_bezier(0.25, 0.1, 0.25, 1, t);
    case 9: return cubic_bezier(0.42, 0, 1, 1, t);
    case 10: return cubic_bezier(0, 0, 0.58, 1, t);
    case 11: return cubic_bezier(0.42, 0, 0.58, 1, t);
    default: return 1 - __builtin_exp(-6 * t) * __builtin_cos(10 * t);
  }
}

/** An animation's eased progress at `clock` (ms), `el = clock - start` >= 0 elapsed: 1 once its iterations are done (`iter` may be
 *  infinite), else the curve at the fraction of the current iteration. ui.ts stepAnims computes the same in the same order. */
inline bool finished(double el, double dur, double iter) {
#pragma clang fp contract(off)
  return dur <= 0 || el >= dur * iter;
}
inline double progress(int e, double el, double dur, double iter) {
#pragma clang fp contract(off)
  return finished(el, dur, iter) ? 1 : at(e, __builtin_fmod(el, dur) / dur);
}

/** A series of values, one every `step` ms (Animated's native driver, ZN-364.01: the program samples its timing, spring or decay once, the
 *  compositor and ui.ts replay it): the value `el` ms after its start, linear between samples, the last one from (n - 1) * step on. */
inline double series_at(const double* v, int n, double el, double step) {
#pragma clang fp contract(off)
  if (n <= 0) return 0;
  if (el <= 0 || step <= 0) return v[el <= 0 ? 0 : n - 1];
  const double i = el / step;
  if (i >= n - 1) return v[n - 1];
  const int k = (int)i;
  return v[k] + (v[k + 1] - v[k]) * (i - k);
}

}  // namespace zn::ease
