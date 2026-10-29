// Throwing a card, worked out from scratch and kept away from the DOM so it can be tested.
//
// A drop asks you to be accurate about a coordinate. A throw asks you to be accurate about a
// direction — and the whole difficulty is deciding *which* release is a throw at all, and what
// a throw is aimed at once the projection leaves the stage entirely.
//
// Three rules, in order:
//
//   1. Below `min` px/ms the release is a drop. Nothing here applies.
//   2. If the projected resting point is still on the stage, the **region under it** wins:
//      the carving is what the user is looking at, and a short throw is a drop with follow
//      through.
//   3. Past the edge there are no regions left, so the zone is the one nearest the **ray** —
//      not to the landing point. A projection that overshoots by 400px is still pointing at
//      the same tile, and measuring to the point instead of the line is what makes a fast
//      flick pick the corner tile rather than the one it was aimed at.
//
// Two guards close the loop: a zone the gesture is heading away from is never a candidate,
// and the whole thing is scored with the model's suggestion pulling in proportion to its
// confidence — the iPhone keyboard trick of growing the hit area of the likely key without
// moving it.

import type { Point } from './types.js';

export interface ThrowZone {
  index: number;
  /** the tile's centre, in px from the centre of the stage */
  pos: Point;
  /** 0–1 from the model, if it has an opinion about this zone */
  score?: number;
}

export interface ThrowOptions {
  /** px/ms below which a release is a drop, not a throw */
  min: number;
  /** how far ahead the release is projected, in ms of travel (λ/(1−λ) of a deceleration rate) */
  ms: number;
  /** how much wider a fully confident suggestion catches, in tiles */
  bias: number;
  /** how far off the throw's direction a zone may sit, in radians */
  cone: number;
  /** the measured size of a tile, for the bias and for the near-miss allowance */
  tile: number;
}

export interface ThrowInput {
  /** where the pointer let go, in px from the centre of the stage */
  at: Point;
  /** where the card was resting when the gesture began, same space */
  from: Point;
  /** velocity at release, px/ms */
  v: Point;
  zones: ThrowZone[];
  stage: { w: number; h: number };
  opts: ThrowOptions;
  /** the zone whose region contains a point, when the layout has regions */
  regionAt?: (p: Point) => number | null;
}

export interface ThrowResult {
  /** false when the release was too slow to be a throw — the caller falls back to the drop */
  thrown: boolean;
  speed: number;
  /** how far the projection carried it past the release point */
  carried: number;
  /** the projected resting point, in px from the centre of the stage */
  landing: Point;
  /** the zone it resolves to, or null when it is aimed at nothing */
  index: number | null;
  why: 'slow' | 'region' | 'ray' | 'nothing';
}

const DEFAULTS: ThrowOptions = { min: 0.6, ms: 170, bias: 0.4, cone: Math.PI / 3, tile: 104 };

export const throwDefaults = (o: Partial<ThrowOptions> = {}): ThrowOptions => ({ ...DEFAULTS, ...o });

/** Signed angle between two directions, in [0, π]. */
const gap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/** Distance from a point to the ray that starts at `o` and goes in direction `d` (a unit vector). */
function toRay(p: Point, o: Point, d: Point): number {
  const [px, py] = [p.x - o.x, p.y - o.y];
  const along = px * d.x + py * d.y;
  if (along <= 0) return Infinity; // behind the throw: not a candidate at any distance
  return Math.abs(px * d.y - py * d.x); // perpendicular distance
}

export function resolveThrow(input: ThrowInput): ThrowResult {
  const { at, from, v, zones, stage, opts } = input;
  const speed = Math.hypot(v.x, v.y);
  const dir = { x: v.x / (speed || 1), y: v.y / (speed || 1) };

  if (speed < opts.min || !zones.length) {
    return { thrown: false, speed, carried: 0, landing: at, index: null, why: 'slow' };
  }

  /* Where it comes to rest. Velocity decays exponentially, so the trip integrates to
     `v · λ/(1−λ)` — and that fraction is a duration, which is why the knob is one. Capped at
     the stage's diagonal: past the edge every extra pixel aims at the same zone, and an
     uncapped throw off a trackpad lands in another postcode. */
  const carried = Math.min(speed * opts.ms, Math.hypot(stage.w, stage.h));
  const landing = { x: at.x + dir.x * carried, y: at.y + dir.y * carried };

  const heading = Math.atan2(dir.y, dir.x);
  const facing = (z: ThrowZone) => gap(heading, Math.atan2(z.pos.y - from.y, z.pos.x - from.x)) < opts.cone;

  // On the stage still: the region under the landing point is what the eye expects.
  const inside = Math.abs(landing.x) <= stage.w / 2 && Math.abs(landing.y) <= stage.h / 2;
  if (inside && input.regionAt) {
    const hit = input.regionAt(landing);
    const zone = hit === null ? undefined : zones.find((z) => z.index === hit);
    if (zone && facing(zone)) {
      return { thrown: true, speed, carried, landing, index: zone.index, why: 'region' };
    }
  }

  // Past it: the tile nearest the *line*, with the model's thumb on the scale.
  let best: ThrowZone | null = null;
  let bestCost = Infinity;
  for (const z of zones) {
    if (!facing(z)) continue;
    const d = toRay(z.pos, from, dir);
    if (!Number.isFinite(d)) continue;
    const cost = d - opts.bias * (z.score ?? 0) * opts.tile;
    if (cost < bestCost) {
      bestCost = cost;
      best = z;
    }
  }
  // a tile a whole stage away from the line was not what anyone aimed at
  if (!best || bestCost > Math.max(stage.w, stage.h) / 2) {
    return { thrown: true, speed, carried, landing, index: null, why: 'nothing' };
  }
  return { thrown: true, speed, carried, landing, index: best.index, why: 'ray' };
}

/**
 * Velocity at the last sample, from a weighted least-squares fit of position against time.
 *
 * Degree two, not one: a fling is usually still accelerating when the finger lifts, and a
 * straight line through the window reports the speed of its middle. The fit is centred on the
 * newest sample, so the slope at zero *is* the lift-off velocity, and the weights fall off
 * with age so a stale sample cannot drag the answer back. Three samples do not determine a
 * parabola, so below that it falls back to the plain two-point estimate.
 */
export function fitVelocity(samples: Array<{ t: number; x: number; y: number }>, key: 'x' | 'y', horizon = 100): number {
  const n = samples.length;
  const last = samples[n - 1];
  if (!last || n < 2) return 0;
  const first = samples[0]!;
  if (n < 4) {
    const dt = last.t - first.t;
    return dt > 0 ? (last[key] - first[key]) / dt : 0;
  }
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let y0 = 0;
  let y1 = 0;
  let y2 = 0;
  for (const s of samples) {
    const t = s.t - last.t;
    const w = Math.max(0, 1 + t / horizon);
    const y = s[key] - last[key];
    const t2 = t * t;
    s0 += w;
    s1 += w * t;
    s2 += w * t2;
    s3 += w * t2 * t;
    s4 += w * t2 * t2;
    y0 += w * y;
    y1 += w * t * y;
    y2 += w * t2 * y;
  }
  // 3×3 normal equations, solved for the linear coefficient — the slope at t = 0
  const m = [
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ];
  const rhs = [y0, y1, y2];
  const det3 = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det3(m);
  if (Math.abs(d) < 1e-9) return 0;
  const swapped = m.map((row, i) => [row[0]!, rhs[i]!, row[2]!]);
  const b = det3(swapped) / d;
  return Number.isFinite(b) ? b : 0;
}
