// The static table, painted once into an image (render-to-image) at the screen's pixel density: space backdrop,
// cabinet, the playfield art (nebulas, a planet, hyperspace streaks, a deck grid), unlit inserts, shadows, metal
// rails and guides with lit and shaded faces, rubber posts, bumper bases, the wormhole, slingshot plastics. Per frame
// the scene draws this image once (a row copy where it is damaged) and only the moving and lit parts over it.
import { polygon, path, stroke, rrect, gradient, drawText, font, textWidth } from 'zinc:gfx';
import { Camera } from './camera';
import { pts, disc, ring, cylinder, flat, face, mix } from './draw';
import { Inserts, Insert } from './inserts';
import { Table, Rail, RAIL_METAL, RAIL_RUBBER, RAIL_GUIDE, RAIL_FLAP, TABLE_W, TABLE_L } from '../table/layout';

const SHADOW_DX: number = 0.32, SHADOW_DY: number = 0.22;   // shadow offset per inch of height
const LX: number = -0.6, LY: number = -0.8;                  // light direction on the table (upper left)

/** Small deterministic generator for the art (keeps Math.random's sequence for the game). */
let seed: i32 = 12345;
function rnd(): number { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 2147483647; }

/** Outline of the playfield (the area inside the outer rails), clockwise. */
function outline(xs: number[], ys: number[]): void {
  xs.push(0.25); ys.push(TABLE_L);
  xs.push(0.25); ys.push(10.4);
  for (let i: i32 = 1; i < 32; i++) { const a = Math.PI + Math.PI * i / 32; xs.push(10.45 + 10.2 * Math.cos(a)); ys.push(10.4 + 10.2 * Math.sin(a)); }
  xs.push(20.65); ys.push(10.4);
  xs.push(20.65); ys.push(TABLE_L);
}

/** Paints the whole static layer through `cam` into a w x h target (an image being rendered, s = pixel scale). */
export function paintTable(cam: Camera, t: Table, ins: Inserts, w: number, h: number, s: number): void {
  seed = 12345;
  // space backdrop around the cabinet
  gradient(0, 0, w, h, 0, 0x02030a, 0x0d0826, true, 255);
  for (let i: i32 = 0; i < 160; i++) {
    const sz = (0.6 + rnd() * 1.4) * s;
    rrect(rnd() * w, rnd() * h, sz, sz, sz / 2, mix(0x8fa8ff, 0xffffff, rnd()), Math.round(60 + rnd() * 160));
  }

  // cabinet floor
  const cx: number[] = [-1.1, TABLE_W + 1.1, TABLE_W + 1.1, -1.1], cy: number[] = [-0.9, -0.9, TABLE_L + 0.9, TABLE_L + 0.9];
  flat(cam, cx, cy, 0, 0x141726, 255);

  paintPlayfield(cam, t, ins, s);

  // everything outside the playfield outline within the cabinet: the dark corners behind the arch
  const ox: number[] = [], oy: number[] = [];
  outline(ox, oy);
  const contours: number[] = [4];
  for (let i: i32 = 0; i < 4; i++) { cam.project(cx[i], cy[i], 0); contours.push(cam.x); contours.push(cam.y); }
  contours.push(ox.length);
  for (let i: i32 = ox.length - 1; i >= 0; i--) { cam.project(ox[i], oy[i], 0); contours.push(cam.x); contours.push(cam.y); }
  path(contours, 0x0e0f1a, 255);

  paintShadows(cam, t);
  paintMechanisms(cam, t, s);
  paintRails(cam, t, s);
  for (const p of t.posts) paintPost(cam, p.x, p.y, p.r);
  paintSlings(cam, t);
  paintCabinet(cam, s);
}

function paintPlayfield(cam: Camera, t: Table, ins: Inserts, s: number): void {
  const xs: number[] = [], ys: number[] = [];
  outline(xs, ys);
  flat(cam, xs, ys, 0, 0x0a1033, 255);
  // a smooth vertical wash: deep at the top, lighter violet towards the flippers
  const bands: i32 = 28;
  for (let i: i32 = 0; i < bands; i++) {
    const y0 = TABLE_L * i / bands, y1 = TABLE_L * (i + 1) / bands + 0.05;
    const bx: number[] = [0, TABLE_W, TABLE_W, 0], by: number[] = [y0, y0, y1, y1];
    flat(cam, bx, by, 0, mix(0x070a26, 0x1b1552, i / bands), 255);
  }
  // nebulas: layered translucent discs
  const nx: number[] = [5.5, 14.5, 9.0, 16.5, 3.5], ny: number[] = [8.0, 14.0, 24.0, 30.5, 31.0];
  const nr: number[] = [5.5, 6.5, 7.0, 4.5, 4.0];
  const nc: u32[] = [0x7a2bd6, 0x1f6bff, 0xd62b8c, 0x18c0c8, 0x6b2bd6];
  for (let i: i32 = 0; i < nx.length; i++) {
    for (let k: i32 = 0; k < 7; k++) {
      const r = nr[i] * (1 - k * 0.12);
      disc(cam, nx[i] + (rnd() - 0.5) * 0.8, ny[i] + (rnd() - 0.5) * 0.8, 0, r, nc[i], 12 + k * 4);
    }
  }
  // hyperspace streaks from the centre
  for (let i: i32 = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r0 = 2 + rnd() * 5, r1 = r0 + 2 + rnd() * 7;
    const sx: number[] = [9.8 + Math.cos(a) * r0, 9.8 + Math.cos(a) * r1], sy: number[] = [22 + Math.sin(a) * r0 * 1.6, 22 + Math.sin(a) * r1 * 1.6];
    pts.length = 0;
    for (let j: i32 = 0; j < 2; j++) { cam.project(sx[j], sy[j], 0); pts.push(cam.x); pts.push(cam.y); }
    stroke(pts, (0.5 + rnd()) * s, mix(0x6fd8ff, 0xffffff, rnd()), 20 + Math.round(rnd() * 40), false);
  }
  // stars
  for (let i: i32 = 0; i < 220; i++) {
    cam.project(0.4 + rnd() * 20, 1 + rnd() * 40, 0);
    const sz = (0.5 + rnd() * rnd() * 2.2) * s;
    rrect(cam.x - sz / 2, cam.y - sz / 2, sz, sz, sz / 2, mix(0xbfd0ff, 0xffffff, rnd()), 80 + Math.round(rnd() * 175));
  }
  // the planet with its ring
  const px = 4.6, py = 24.4, pr = 2.2;
  ring(cam, px, py, 0, pr * 1.75, 3 * s, 0x9fb8ff, 40);
  disc(cam, px, py, 0, pr, 0x1a2f7a, 255);
  disc(cam, px - 0.25, py - 0.3, 0, pr * 0.86, 0x2a4bb0, 255);
  disc(cam, px - 0.55, py - 0.65, 0, pr * 0.62, 0x3f6bd8, 255);
  disc(cam, px - 0.8, py - 0.9, 0, pr * 0.35, 0x7aa0ff, 200);
  disc(cam, px + 0.5, py + 0.55, 0, pr * 0.7, 0x0c1640, 110);
  // the ring's front half passes over the planet
  pts.length = 0;
  for (let i: i32 = 0; i <= 20; i++) {
    const a = Math.PI * i / 20;
    cam.project(px + Math.cos(a) * pr * 1.75, py + Math.sin(a) * pr * 1.75 * 0.42 + 0.1, 0); pts.push(cam.x); pts.push(cam.y);
  }
  stroke(pts, 2.2 * s, 0xc8d6ff, 150, false);
  // deck grid in front of the flippers
  for (let i: i32 = 0; i <= 12; i++) {
    const gx: number[] = [0.3 + i * 1.7, 0.3 + i * 1.7], gy: number[] = [34.5, 42.4];
    pts.length = 0;
    for (let j: i32 = 0; j < 2; j++) { cam.project(gx[j], gy[j], 0); pts.push(cam.x); pts.push(cam.y); }
    stroke(pts, 1 * s, 0x3fe7ff, 22, false);
  }
  for (let i: i32 = 0; i <= 5; i++) {
    pts.length = 0;
    cam.project(0.3, 34.5 + i * 1.6, 0); pts.push(cam.x); pts.push(cam.y);
    cam.project(20.6, 34.5 + i * 1.6, 0); pts.push(cam.x); pts.push(cam.y);
    stroke(pts, 1 * s, 0x3fe7ff, 22, false);
  }
  // hexagonal base plate under the bumpers
  pts.length = 0;
  for (let i: i32 = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; cam.project(9.5 + Math.cos(a) * 3.9, 11.6 + Math.sin(a) * 3.3, 0); pts.push(cam.x); pts.push(cam.y); }
  polygon(pts, 0x2a1f6a, 120);
  stroke(pts, 1.5 * s, 0x7f6bff, 90, true);
  // top lane decals and the shooter lane floor
  for (const l of t.lanes) {
    const lx: number[] = [l.ax + 0.1, l.ax + l.len - 0.1, l.ax + l.len - 0.1, l.ax + 0.1], ly: number[] = [2.2, 2.2, 6.6, 6.6];
    flat(cam, lx, ly, 0, 0x05071a, 150);
  }
  const sx2: number[] = [19.1, 20.4, 20.4, 19.1], sy2: number[] = [11.2, 11.2, TABLE_L, TABLE_L];
  flat(cam, sx2, sy2, 0, 0x060818, 255);
  for (let i: i32 = 0; i < 6; i++) {
    const y = 33 - i * 3.2;
    const chx: number[] = [19.75, 20.2, 20.2, 19.75, 19.3, 19.3], chy: number[] = [y - 0.6, y - 0.1, y + 0.35, y - 0.1, y + 0.35, y - 0.1];
    flat(cam, chx, chy, 0, 0xffd23f, 50 + i * 20);
  }
  // the wormhole's spiral
  const h = t.hole;
  for (let arm: i32 = 0; arm < 3; arm++) {
    pts.length = 0;
    for (let i: i32 = 0; i <= 24; i++) {
      const a = arm * Math.PI * 2 / 3 + i * 0.26, r = 0.7 + i * 0.075;
      cam.project(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, 0); pts.push(cam.x); pts.push(cam.y);
    }
    stroke(pts, 2.5 * s, 0xff4fa3, 70, false);
  }
  // unlit inserts
  for (const i of ins.all) paintInsert(cam, i, s);
  // labels
  const f = s > 1 ? font('sans-bold', 20) : font('sans-bold', 10);
  const labels: string[] = ['2X', '3X', '4X', '5X'];
  for (let i: i32 = 0; i < 4; i++) {
    const b = ins.bonusX[i];
    cam.project(b.x, b.y, 0);
    drawText(f, cam.x - textWidth(f, labels[i], 0) / 2, cam.y - 6 * s, labels[i], 0xc8ffd8, 150, 0);
  }
  label(cam, f, 'SHOOT AGAIN', 9.8, 36.6, 0xffb0b0, s);
  label(cam, f, 'RANK', 9.8, 30.9, 0xa8f4ff, s);
  label(cam, f, 'MISSIONS', 9.6, 17.7, 0xffc89a, s);
}

function label(cam: Camera, f: i32, text: string, x: number, y: number, color: u32, s: number): void {
  cam.project(x, y, 0);
  drawText(f, cam.x - textWidth(f, text, 0) / 2, cam.y - 6 * s, text, color, 140, 0);
}

function paintInsert(cam: Camera, i: Insert, s: number): void {
  i.outline(cam, 1.12);
  polygon(pts, 0x02030a, 200);
  i.outline(cam, 1);
  polygon(pts, mix(i.color, 0x000000, 0.72), 255);
  stroke(pts, 1 * s, mix(i.color, 0x000000, 0.35), 200, true);
  i.outline(cam, 0.55);
  polygon(pts, mix(i.color, 0x000000, 0.55), 180);
}

function paintShadows(cam: Camera, t: Table): void {
  for (const r of t.rails) {
    if (r.layer !== 0) continue;
    const dx = SHADOW_DX * r.height, dy = SHADOW_DY * r.height;
    for (let i: i32 = 0; i + 1 < r.xs.length; i++) {
      const sx: number[] = [r.xs[i], r.xs[i + 1], r.xs[i + 1] + dx, r.xs[i] + dx], sy: number[] = [r.ys[i], r.ys[i + 1], r.ys[i + 1] + dy, r.ys[i] + dy];
      flat(cam, sx, sy, 0, 0x000000, 70);
    }
  }
  for (const p of t.posts) disc(cam, p.x + 0.25, p.y + 0.18, 0, p.r + 0.08, 0x000000, 80);
  for (const b of t.bumpers) { disc(cam, b.x + 0.35, b.y + 0.25, 0, 1.25, 0x000000, 60); disc(cam, b.x + 0.3, b.y + 0.2, 0, 1.05, 0x000000, 60); }
}

function paintMechanisms(cam: Camera, t: Table, s: number): void {
  // bumper bases: a dark plate and the metal skirt the ball hits
  for (const b of t.bumpers) {
    disc(cam, b.x, b.y, 0.01, 1.3, 0x10131f, 255);
    ring(cam, b.x, b.y, 0.01, 1.3, 1.5 * s, 0x5a6480, 255);
    cylinder(cam, b.x, b.y, 0, 0.32, b.r, 0x9aa3b8, 255);
    disc(cam, b.x, b.y, 0.32, b.r, 0xd9dee8, 255);
  }
  // wormhole: a metal rim around a deep hole
  const h = t.hole;
  disc(cam, h.x, h.y, 0, 0.95, 0x6c7690, 255);
  disc(cam, h.x, h.y, 0, 0.82, 0x2a2f40, 255);
  disc(cam, h.x, h.y, 0, 0.72, 0x09050f, 255);
  disc(cam, h.x + 0.08, h.y + 0.1, 0, 0.5, 0x1a0a2a, 255);
  disc(cam, h.x + 0.12, h.y + 0.15, 0, 0.3, 0x000000, 255);
  ring(cam, h.x, h.y, 0, 0.9, 1.2 * s, 0xc8d0e0, 180);
  // drop target slots
  for (const g of t.targets) {
    const sx: number[] = [g.ax - 0.22, g.ax + 0.22, g.ax + 0.22, g.ax - 0.22], sy: number[] = [g.by - 0.05, g.by - 0.05, g.ay + 0.05, g.ay + 0.05];
    flat(cam, sx, sy, 0, 0x020308, 255);
  }
  // spinner brackets
  const sp = t.spinner;
  for (let k: i32 = 0; k < 2; k++) {
    const x = k === 0 ? sp.ax : sp.ax + sp.len;
    cylinder(cam, x, sp.ay, 0, 1.25, 0.1, 0x8a93a8, 255);
  }
  // gate wire
  pts.length = 0;
  cam.project(t.gate.ax, t.gate.ay, 0.7); pts.push(cam.x); pts.push(cam.y);
  cam.project(t.gate.bx, t.gate.by, 0.7); pts.push(cam.x); pts.push(cam.y);
  stroke(pts, 2 * s, 0xc8d0e0, 255, false);
}

/** Walls, far ones first: each segment's face (shaded by the angle to the light), then the rounded metal top. */
function paintRails(cam: Camera, t: Table, s: number): void {
  const order: Rail[] = [];
  for (const r of t.rails) if (r.layer === 0 && r.style !== RAIL_RUBBER) order.push(r);
  order.sort((a: Rail, b: Rail): number => maxY(a) - maxY(b));
  for (const r of order) {
    const flap = r.style === RAIL_FLAP;
    const thick = r.style === RAIL_METAL ? 0.28 : r.style === RAIL_GUIDE ? 0.2 : 0.14;
    for (let i: i32 = 0; i + 1 < r.xs.length; i++) {
      const ax = r.xs[i], ay = r.ys[i], bx = r.xs[i + 1], by = r.ys[i + 1];
      const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-4) continue;
      // the face normal turned towards the camera, lit from the upper left
      let nx = dy / len, ny = -dx / len;
      cam.project((ax + bx) / 2, (ay + by) / 2, 0);
      if (nx * (cam.ex - (ax + bx) / 2) + ny * (cam.ey - (ay + by) / 2) < 0) { nx = -nx; ny = -ny; }
      const lit = Math.max(0, nx * LX + ny * LY);
      const base: u32 = flap ? 0x2fb8d8 : 0x4a5268;
      face(cam, ax, ay, bx, by, 0, r.height, mix(base, flap ? 0xb8f4ff : 0xc8d0e0, 0.15 + lit * 0.6), flap ? 150 : 255);
    }
    for (let i: i32 = 0; i + 1 < r.xs.length; i++) {
      const ax = r.xs[i], ay = r.ys[i], bx = r.xs[i + 1], by = r.ys[i + 1];
      cam.project((ax + bx) / 2, (ay + by) / 2, r.height);
      const wpx = Math.max(1.5 * s, thick * cam.k);
      pts.length = 0;
      cam.project(ax, ay, r.height); pts.push(cam.x); pts.push(cam.y);
      cam.project(bx, by, r.height); pts.push(cam.x); pts.push(cam.y);
      stroke(pts, wpx, flap ? 0x7fe8ff : 0x9aa4bc, 255, false);
      stroke(pts, wpx * 0.4, flap ? 0xe8fcff : 0xf0f4ff, flap ? 200 : 230, false);
    }
  }
}

function maxY(r: Rail): number {
  let m: number = -1e9;
  for (const y of r.ys) m = Math.max(m, y);
  return m;
}

/** A rubber-ringed post: metal body, white rubber ring, polished cap. */
function paintPost(cam: Camera, x: number, y: number, r: number): void {
  cylinder(cam, x, y, 0, 0.8, r * 0.7, 0x5a6480, 255);
  cylinder(cam, x, y, 0.2, 0.55, r + 0.05, 0xb8bcc8, 255);
  disc(cam, x, y, 0.55, r + 0.05, 0xf4f4f6, 255);
  disc(cam, x, y, 0.82, r * 0.55, 0xe0e6f2, 255);
  disc(cam, x - r * 0.15, y - r * 0.2, 0.83, r * 0.25, 0xffffff, 220);
}

function paintSlings(cam: Camera, t: Table): void {
  for (const r of t.rails) {
    if (r.style !== RAIL_RUBBER) continue;
    // rubber band around the three posts, then the plastic cover above it
    pts.length = 0;
    for (let i: i32 = 0; i < r.xs.length; i++) { cam.project(r.xs[i], r.ys[i], 0.4); pts.push(cam.x); pts.push(cam.y); }
    const w = 0.3 * cam.k;
    stroke(pts, w, 0x1a1a1a, 255, true);
    stroke(pts, w * 0.75, 0xf2f2f2, 255, true);
    const mx = (r.xs[0] + r.xs[1] + r.xs[2]) / 3, my = (r.ys[0] + r.ys[1] + r.ys[2]) / 3;
    const px: number[] = [], py: number[] = [];
    for (let i: i32 = 0; i < 3; i++) { px.push(mx + (r.xs[i] - mx) * 0.72); py.push(my + (r.ys[i] - my) * 0.72); }
    flat(cam, px, py, 0.95, 0x000000, 60);
    flat(cam, px, py, 1.0, 0xff5a1f, 215);
    pts.length = 0;
    for (let i: i32 = 0; i < 3; i++) { cam.project(px[i], py[i], 1.0); pts.push(cam.x); pts.push(cam.y); }
    stroke(pts, 1.4, 0xffc8a0, 200, true);
  }
}

/** Side rails and the back of the cabinet, at the height of the lock-down bar. */
function paintCabinet(cam: Camera, s: number): void {
  const H = 1.5;
  const lx: number[] = [-1.1, 0.12, 0.12, -1.1], ly: number[] = [-0.9, -0.9, TABLE_L + 0.9, TABLE_L + 0.9];
  // inner faces (visible from the player), then the tops
  face(cam, 0.12, -0.9, 0.12, TABLE_L + 0.9, 0, H, 0x2a2f44, 255);
  face(cam, TABLE_W - 0.12, -0.9, TABLE_W - 0.12, TABLE_L + 0.9, 0, H, 0x1c2033, 255);
  face(cam, -1.1, 0.12, TABLE_W + 1.1, 0.12, 0, H, 0x242a3e, 255);
  flat(cam, lx, ly, H, 0x3a4058, 255);
  const rx: number[] = [TABLE_W - 0.12, TABLE_W + 1.1, TABLE_W + 1.1, TABLE_W - 0.12];
  flat(cam, rx, ly, H, 0x3a4058, 255);
  const bx: number[] = [-1.1, TABLE_W + 1.1, TABLE_W + 1.1, -1.1], by: number[] = [-0.9, -0.9, 0.12, 0.12];
  flat(cam, bx, by, H, 0x3a4058, 255);
  // chrome edges
  for (let k: i32 = 0; k < 3; k++) {
    pts.length = 0;
    if (k === 0) { cam.project(0.12, TABLE_L + 0.9, H); pts.push(cam.x); pts.push(cam.y); cam.project(0.12, 0.12, H); pts.push(cam.x); pts.push(cam.y); }
    else if (k === 1) { cam.project(TABLE_W - 0.12, TABLE_L + 0.9, H); pts.push(cam.x); pts.push(cam.y); cam.project(TABLE_W - 0.12, 0.12, H); pts.push(cam.x); pts.push(cam.y); }
    else { cam.project(0.12, 0.12, H); pts.push(cam.x); pts.push(cam.y); cam.project(TABLE_W - 0.12, 0.12, H); pts.push(cam.x); pts.push(cam.y); }
    stroke(pts, 2 * s, 0xc8d0e8, 220, false);
  }
}
