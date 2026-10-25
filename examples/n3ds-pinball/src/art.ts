// The static table of one screen, cached at loading for each stereo view: Nova Patrol's own art (examples/pinball/src/render/art.ts) seen from straight
// above, then the plastic ramp, the wire habitrail and the apron, which the desktop table draws every frame (here they are part of the
// picture: a ball rolling under the ramp shows over it, the price of a frame with no gradient or stroke). Painting uses everything zinc:gfx
// has (gradients, strokes, paths): it happens only at loading, in software; a frame draws its cached view as one textured quad on the GPU.
import { createImage, beginImage, endImage, resetTransform, polygon, drawText, font, textWidth } from 'zinc:gfx';
import { Camera } from '../../pinball/src/render/camera';
import { pts, line3, flat } from '../../pinball/src/render/draw';
import { Inserts } from '../../pinball/src/render/inserts';
import { paintTable } from '../../pinball/src/render/art';
import { Table, Rail, RAIL_RAMP, RAIL_WIRE } from '../../pinball/src/table/layout';
import { Ramp } from '../../pinball-kit/physics/bodies';
import { K, EYE_HEIGHT, CENTER_X, DEPTH_PER_INCH } from './constants';

/** A camera straight above the table point (cx, cy), shown at screen point (sx, sy), `s` image pixels per screen pixel. */
export function topDown(cy: number, sx: number, sy: number, s: number): Camera {
  const c = new Camera();
  c.fy = 0; c.fz = -1; c.uy = -1; c.uz = 0;
  c.ex = CENTER_X; c.ey = cy; c.ez = EYE_HEIGHT;
  c.focal = K * EYE_HEIGHT * s;
  c.ox = sx * s; c.oy = sy * s;
  return c;
}

/** The height of a ramp at a table point (the nearest point of its centreline). */
function heightOn(r: Ramp, x: number, y: number): number {
  let best: number = 1e9, z: number = 0;
  for (let i: i32 = 0; i + 1 < r.xs.length; i++) {
    const ax = r.xs[i], ay = r.ys[i], dx = r.xs[i + 1] - ax, dy = r.ys[i + 1] - ay;
    const l2 = dx * dx + dy * dy;
    let u = l2 > 1e-6 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const ex = ax + dx * u - x, ey = ay + dy * u - y, d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * u; }
  }
  return z;
}

function heights(rail: Rail, ramp: Ramp): number[] {
  const zs: number[] = [];
  for (let i: i32 = 0; i < rail.xs.length; i++) zs.push(heightOn(ramp, rail.xs[i], rail.ys[i]));
  return zs;
}

/** The ramp: a translucent floor between its rails, clear walls with bright edges (as the desktop scene draws it). */
function paintRamp(cam: Camera, t: Table, s: number): void {
  const rails: Rail[] = [];
  for (const r of t.rails) if (r.style === RAIL_RAMP) rails.push(r);
  if (rails.length < 2) return;
  const a = rails[0], b = rails[1], za = heights(a, t.ramp), zb = heights(b, t.ramp);
  pts.length = 0;
  for (let i: i32 = 0; i < a.xs.length; i++) { cam.project(a.xs[i], a.ys[i], za[i]); pts.push(cam.x); pts.push(cam.y); }
  for (let i: i32 = b.xs.length - 1; i >= 0; i--) { cam.project(b.xs[i], b.ys[i], zb[i]); pts.push(cam.x); pts.push(cam.y); }
  polygon(pts, 0x2fb8ff, 70);
  for (let k: i32 = 0; k < 2; k++) {
    const r = k === 0 ? a : b, zs = k === 0 ? za : zb;
    line3(cam, r.xs, r.ys, 0.55, zs, 2 * s, 0xc8f4ff, 230);
    line3(cam, r.xs, r.ys, 0, zs, 1.5 * s, 0x5fc8f0, 200);
  }
}

/** The wire habitrail: two pairs of wires and the hoops that tie them. */
function paintWire(cam: Camera, t: Table, s: number): void {
  const rails: Rail[] = [];
  for (const r of t.rails) if (r.style === RAIL_WIRE) rails.push(r);
  for (const r of rails) {
    const zs = heights(r, t.wire);
    line3(cam, r.xs, r.ys, 0.02, zs, 2.2 * s, 0x3a4058, 255);
    line3(cam, r.xs, r.ys, 0, zs, 1.4 * s, 0xe8ecf4, 255);
    line3(cam, r.xs, r.ys, 0.5, zs, 1.4 * s, 0xe8ecf4, 255);
  }
  if (rails.length < 2) return;
  const a = rails[0], b = rails[1], za = heights(a, t.wire), zb = heights(b, t.wire);
  for (let i: i32 = 0; i < a.xs.length; i++) line3(cam, [a.xs[i], b.xs[i]], [a.ys[i], b.ys[i]], 0.5, [za[i], zb[i]], 1.4 * s, 0xb8c0d4, 255);
}

/** The apron under the flippers, with the table's name. */
function paintApron(cam: Camera, s: number): void {
  const xs: number[] = [0.25, 6.0, 7.3, 12.3, 13.6, 19.1, 19.1, 0.25], ys: number[] = [40.35, 40.35, 41.2, 41.2, 40.35, 40.35, 42.7, 42.7];
  flat(cam, xs, ys, 0.5, 0x0d1230, 255);
  const f = font('sans-bold', 12);
  cam.project(3.4, 41.4, 0.5);
  drawText(f, cam.x - textWidth(f, 'NOVA PATROL', 1) / 2, cam.y - 7 * s, 'NOVA PATROL', 0x7fe0ff, 220, 1);
  cam.project(16.3, 41.4, 0.5);
  drawText(f, cam.x - textWidth(f, '3 BALLS', 1) / 2, cam.y - 7 * s, '3 BALLS', 0xffd23f, 200, 1);
}

/** One screen's picture of the table: w x h screen pixels at `s` image pixels each, the table point (CENTER_X, cy) at its centre. */
export function bakeHalf(t: Table, cy: number, w: number, h: number, s: number, stereo: number = 0): i32 {
  const iw: i32 = Math.ceil(w * s), ih: i32 = Math.ceil(h * s);
  const cam = topDown(cy, w / 2, h / 2, s);
  cam.parallax = stereo * DEPTH_PER_INCH * s / 2;
  const ins = new Inserts(t);
  const image = createImage(iw, ih);
  if (image < 0) throw new Error('Not enough memory for the pinball view');
  resetTransform();
  beginImage(image);
  paintTable(cam, t, ins, iw, ih, s);
  paintRamp(cam, t, s);
  paintWire(cam, t, s);
  paintApron(cam, s);
  endImage();
  return image;
}
