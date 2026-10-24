// The meshes zinc:3d has no generator for: the rings, the asteroid belt and the star field. Each is one mesh (one draw call).
import { Mesh } from 'zinc:3d';
import { RING_INNER, RING_OUTER, BELT_INNER, BELT_OUTER, ASTEROIDS, STARS, STAR_RADIUS } from './constants';

/** A repeatable pseudo-random sequence (the same scene on every run and every engine). */
class Random {
  private s: u32;
  constructor(seed: u32) { this.s = seed; }
  next(): number { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
}

/** The rings: a flat annulus in XZ, bands of brightness from the vertex colours and a dark gap (the Cassini division). */
export function rings(segments: i32): Mesh {
  const BANDS: number[] = [0, 0.18, 0.35, 0.52, 0.56, 0.6, 0.8, 1];
  const SHADES: u32[] = [0x8a7a64, 0xc9b28c, 0xe8d3a8, 0x3a332a, 0x3a332a, 0xd8c39a, 0xa8957a, 0x6f6352];
  const pos: number[] = [], nrm: number[] = [], col: u32[] = [], idx: i32[] = [];
  for (let s = 0; s <= segments; s++) {
    const a = 2 * Math.PI * s / segments, c = Math.cos(a), si = Math.sin(a);
    for (let b = 0; b < BANDS.length; b++) {
      const r = RING_INNER + (RING_OUTER - RING_INNER) * BANDS[b];
      pos.push(c * r); pos.push(0); pos.push(si * r);
      nrm.push(0); nrm.push(1); nrm.push(0);
      col.push(SHADES[b]);
    }
  }
  const n: i32 = BANDS.length;
  for (let s = 0; s < segments; s++) {
    for (let b = 0; b + 1 < n; b++) {
      const i: i32 = s * n + b, j: i32 = i + n;
      idx.push(i); idx.push(i + 1); idx.push(j);
      idx.push(j); idx.push(i + 1); idx.push(j + 1);
    }
  }
  return new Mesh(pos, idx, nrm, [], col);
}

/** The asteroid belt: small irregular tetrahedra on a wide ring, flat shaded. */
export function belt(): Mesh {
  const rnd = new Random(7);
  const pos: number[] = [], col: u32[] = [], idx: i32[] = [];
  const GREYS: u32[] = [0x8c8273, 0x6e665c, 0xa39684, 0x5d554c];
  for (let k = 0; k < ASTEROIDS; k++) {
    const a = rnd.range(0, 2 * Math.PI), r = rnd.range(BELT_INNER, BELT_OUTER), y = rnd.range(-0.25, 0.25), size = rnd.range(0.025, 0.08);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const base: i32 = pos.length / 3;
    // a tetrahedron's corners, each pushed in or out a little
    const T: number[] = [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1];
    for (let v = 0; v < 4; v++) {
      const s = size * rnd.range(0.6, 1.3);
      pos.push(cx + T[v * 3] * s); pos.push(y + T[v * 3 + 1] * s); pos.push(cz + T[v * 3 + 2] * s);
      col.push(GREYS[k % 4]);
    }
    idx.push(base); idx.push(base + 1); idx.push(base + 2);
    idx.push(base); idx.push(base + 3); idx.push(base + 1);
    idx.push(base); idx.push(base + 2); idx.push(base + 3);
    idx.push(base + 1); idx.push(base + 3); idx.push(base + 2);
  }
  return new Mesh(pos, idx, [], [], col);
}

/** The stars: one small triangle each, facing the centre, on a sphere around the whole scene. */
export function starField(): Mesh {
  const rnd = new Random(42);
  const pos: number[] = [], col: u32[] = [], idx: i32[] = [];
  const TINTS: u32[] = [0xffffff, 0xcfe0ff, 0xfff0d0, 0xffd6c0, 0x9fb4ff];
  for (let k = 0; k < STARS; k++) {
    // a uniform direction, then two vectors across it
    const z = rnd.range(-1, 1), a = rnd.range(0, 2 * Math.PI), q = Math.sqrt(1 - z * z);
    const x = q * Math.cos(a), y = q * Math.sin(a);
    const ux = -Math.sin(a), uy = Math.cos(a);              // across, in the xy plane
    const vx = -z * Math.cos(a), vy = -z * Math.sin(a), vz = q;   // across, the third axis
    const s = rnd.range(0.12, 0.35);
    const base: i32 = pos.length / 3;
    pos.push(x * STAR_RADIUS + ux * s); pos.push(y * STAR_RADIUS + uy * s); pos.push(z * STAR_RADIUS);
    pos.push(x * STAR_RADIUS - ux * s * 0.5 + vx * s); pos.push(y * STAR_RADIUS - uy * s * 0.5 + vy * s); pos.push(z * STAR_RADIUS + vz * s);
    pos.push(x * STAR_RADIUS - ux * s * 0.5 - vx * s); pos.push(y * STAR_RADIUS - uy * s * 0.5 - vy * s); pos.push(z * STAR_RADIUS - vz * s);
    const tint = TINTS[k % TINTS.length];
    col.push(tint); col.push(tint); col.push(tint);
    idx.push(base); idx.push(base + 1); idx.push(base + 2);
  }
  return new Mesh(pos, idx, [], [], col);
}
