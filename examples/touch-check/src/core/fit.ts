// The affine map that sends where a screen was tapped to where it was meant, by least squares: x = a rx + b ry + c, y = d rx + e ry + f.
// It is what a resistive screen's calibration computes (TFT_eSPI, LVGL's examples) and what the ESP32 firmware applies to its touch
// (touch_calibrate in firmware/esp32-mquickjs/main/main.c): a scale, a shear, a turn or a mirror, and an offset. Three taps fix it; more
// average out the finger.

export class AffineMap {
  a: number = 1; b: number = 0; c: number = 0;
  d: number = 0; e: number = 1; f: number = 0;
  x(rx: number, ry: number): number { return this.a * rx + this.b * ry + this.c; }
  y(rx: number, ry: number): number { return this.d * rx + this.e * ry + this.f; }
  /** As zinc:device takes it: [a, b, c, d, e, f]. */
  coefficients(): number[] { return [this.a, this.b, this.c, this.d, this.e, this.f]; }
}

export function affine(m: number[]): AffineMap {
  const map = new AffineMap();
  map.a = m[0]; map.b = m[1]; map.c = m[2]; map.d = m[3]; map.e = m[4]; map.f = m[5];
  return map;
}

/** `outer` after `inner`: what a tap goes through when `inner` corrects it first. */
export function compose(outer: AffineMap, inner: AffineMap): AffineMap {
  return affine([outer.a * inner.a + outer.b * inner.d, outer.a * inner.b + outer.b * inner.e, outer.a * inner.c + outer.b * inner.f + outer.c,
                 outer.d * inner.a + outer.e * inner.d, outer.d * inner.b + outer.e * inner.e, outer.d * inner.c + outer.e * inner.f + outer.f]);
}

/** The map back: from where a finger aims to where the screen reports it. */
export function invert(m: AffineMap): AffineMap {
  const det = m.a * m.e - m.b * m.d;
  if (Math.abs(det) < 1e-9) return new AffineMap();
  return affine([m.e / det, -m.b / det, (m.b * m.f - m.e * m.c) / det, -m.d / det, m.a / det, (m.d * m.c - m.a * m.f) / det]);
}

export function distance(x0: number, y0: number, x1: number, y1: number): number { return Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)); }

function det3(m: number[]): number {   // a 3 x 3 matrix, row after row
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

/** The column `k` of `m` replaced by `v` (Cramer's rule). */
function withColumn(m: number[], k: i32, v: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) out.push(i % 3 === k ? v[(i / 3) | 0] : m[i]);
  return out;
}

/** The map that fits the taps best (raw[i] tapped for meant[i]); the identity when they are fewer than three or on one line. */
export function fitAffine(rawX: number[], rawY: number[], meantX: number[], meantY: number[]): AffineMap {
  const m: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const bx: number[] = [0, 0, 0];
  const by: number[] = [0, 0, 0];
  for (let i = 0; i < rawX.length; i++) {   // the normal equations: (R^T R) p = R^T t, R's rows (rx, ry, 1)
    const r: number[] = [rawX[i], rawY[i], 1];
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) m[j * 3 + k] += r[j] * r[k];
      bx[j] += r[j] * meantX[i];
      by[j] += r[j] * meantY[i];
    }
  }
  const d = det3(m);
  if (rawX.length < 3 || Math.abs(d) < 1e-6) return new AffineMap();
  return affine([det3(withColumn(m, 0, bx)) / d, det3(withColumn(m, 1, bx)) / d, det3(withColumn(m, 2, bx)) / d,
                 det3(withColumn(m, 0, by)) / d, det3(withColumn(m, 1, by)) / d, det3(withColumn(m, 2, by)) / d]);
}

/** How far apart two maps put a tap, at most, at the screen's corners: what a round of taps still changes. */
export function spread(p: AffineMap, q: AffineMap, w: number, h: number): number {
  let most = 0;
  const xs: number[] = [0, w, 0, w], ys: number[] = [0, 0, h, h];
  for (let i = 0; i < 4; i++) most = Math.max(most, distance(p.x(xs[i], ys[i]), p.y(xs[i], ys[i]), q.x(xs[i], ys[i]), q.y(xs[i], ys[i])));
  return most;
}
