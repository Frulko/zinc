/**
 * Small statistics helpers.
 * Every function takes a plain array of numbers and never mutates it.
 */

/** Arithmetic mean (0 for an empty array). */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** [min, max] of the values. */
export function minMax(xs: number[]): number[] {
  let lo = xs[0], hi = xs[0];
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return [lo, hi];
}

/*
 * Centred moving average over `width` samples;
 * the window shrinks at both ends.
 */
export function movingAverage(xs: number[], width: i32): number[] {
  const out: number[] = [];
  const half = Math.floor(width / 2);
  for (let i = 0; i < xs.length; i++) {
    let sum = 0, n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < xs.length) { sum += xs[j]; n++; }
    }
    out.push(sum / n);
  }
  return out;
}
