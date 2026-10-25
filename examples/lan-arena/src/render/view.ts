// The 3D view: a Wolfenstein-style raycaster drawn with zinc:gfx rectangles, which every console core's GPU replay draws: one wall slice
// per screen column band (a DDA through the grid, fog by distance, the y faces darker), then the players and the paint balls as billboards
// cut against the walls' depths, far to near. Nothing is allocated per frame: the depth and sprite buffers are reused.
import { rect, text, width, height } from 'zinc:gfx';
import { World, Player } from '../world';
import { WALL_LIT, WALL_DARK, PAINT, SKY, SKY_LOW, FLOOR, FLOOR_NEAR, FOV_PLANE, FOG_DISTANCE } from '../constants';

/** A colour scaled by f (0..1), on 16 steps so a slow walk does not shimmer. */
export function shade(c: u32, f: number): u32 {
  const k = Math.round(Math.max(0.2, Math.min(1, f)) * 16) as i32;
  const r = ((((c >> 16) & 255) as i32) * k) >> 4, g = ((((c >> 8) & 255) as i32) * k) >> 4, b = (((c & 255) as i32) * k) >> 4;
  return ((r << 16) | (g << 8) | b) as u32;
}

export class View {
  colW: i32 = 4;
  cols: i32 = 0;
  zbuf: number[] = [];
  // the sprites of a frame: depth, screen x, size, kind (0 player, 1 ball), index
  depth: number[] = [];
  sx: number[] = [];
  kind: i32[] = [];
  ref: i32[] = [];
  order: i32[] = [];
  count: i32 = 0;

  /** Column bands of 4 px on a large screen (240 at 960), 3 px on the PSP and the 3DS (160 and 133). */
  fit(): void {
    this.colW = width() >= 900 ? 4 : 3;
    const cols = Math.floor(width() / this.colW) as i32;
    if (cols === this.cols) return;
    this.cols = cols;
    this.zbuf = [];
    for (let i = 0; i < cols; i++) this.zbuf.push(0);
  }
  push(depth: number, sx: number, kind: i32, ref: i32): void {
    if (this.count === this.depth.length) { this.depth.push(0); this.sx.push(0); this.kind.push(0); this.ref.push(0); this.order.push(0); }
    const i = this.count;
    this.depth[i] = depth; this.sx[i] = sx; this.kind[i] = kind; this.ref[i] = ref;
    this.count++;
  }
}

function backdrop(w: number, h: number): void {
  const half = Math.floor(h / 2);
  rect(0, 0, w, half * 0.6, SKY);
  rect(0, half * 0.6, w, half * 0.4 + 1, SKY_LOW);
  rect(0, half, w, half * 0.35, FLOOR);
  rect(0, half + half * 0.35, w, h - half - half * 0.35, FLOOR_NEAR);
}

/** Draws the arena as `me` sees it. */
export function drawView(world: World, me: Player, view: View): void {
  view.fit();
  const w = width(), h = height(), cols = view.cols, cw = view.colW;
  backdrop(w, h);
  const px = me.x, py = me.y;
  const dirX = Math.cos(me.angle), dirY = Math.sin(me.angle);
  const planeX = -dirY * FOV_PLANE, planeY = dirX * FOV_PLANE;
  const half = h / 2;
  for (let c = 0; c < cols; c++) {
    const camX = (2 * c + 1) / cols - 1;
    const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
    let mapX = Math.floor(px) as i32, mapY = Math.floor(py) as i32;
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    const stepX: i32 = rdx < 0 ? -1 : 1, stepY: i32 = rdy < 0 ? -1 : 1;
    let sideX = rdx < 0 ? (px - mapX) * ddx : (mapX + 1 - px) * ddx;
    let sideY = rdy < 0 ? (py - mapY) * ddy : (mapY + 1 - py) * ddy;
    let side = 0, cell = 0;
    for (let n = 0; n < 48 && cell === 0; n++) {
      if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; } else { sideY += ddy; mapY += stepY; side = 1; }
      cell = world.cell(mapX, mapY);
    }
    const dist = Math.max(0.05, side === 0 ? sideX - ddx : sideY - ddy);
    view.zbuf[c] = dist;
    const lineH = h / dist;
    const top = Math.max(0, half - lineH / 2), bottom = Math.min(h, half + lineH / 2);
    const base = side === 0 ? WALL_LIT[cell - 1] : WALL_DARK[cell - 1];
    const along = side === 0 ? py + dist * rdy : px + dist * rdx, frac = along - Math.floor(along);
    const edge = frac < 0.03 || frac > 0.97 ? 0.7 : 1.0;   // the seams between blocks
    rect(c * cw, top, cw, bottom - top, shade(base, (1.05 - dist / FOG_DISTANCE) * edge));
  }
  sprites(world, me, view, px, py, dirX, dirY, planeX, planeY);
}

function sprites(world: World, me: Player, view: View, px: number, py: number, dirX: number, dirY: number, planeX: number, planeY: number): void {
  const w = width();
  const inv = 1 / (planeX * dirY - dirX * planeY);
  view.count = 0;
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    if (p === me) continue;
    const sx = p.x - px, sy = p.y - py;
    const depth = inv * (-planeY * sx + planeX * sy);
    if (depth < 0.15) continue;
    view.push(depth, (w / 2) * (1 + inv * (dirY * sx - dirX * sy) / depth), 0, i);
  }
  for (let i = 0; i < world.balls.length; i++) {
    const b = world.balls[i];
    const sx = b.x - px, sy = b.y - py;
    const depth = inv * (-planeY * sx + planeX * sy);
    if (depth < 0.6) continue;   // a ball just fired is not drawn over the whole view
    view.push(depth, (w / 2) * (1 + inv * (dirY * sx - dirX * sy) / depth), 1, i);
  }
  // far to near (insertion sort: a handful of sprites)
  for (let i = 0; i < view.count; i++) {
    let j = i;
    while (j > 0 && view.depth[view.order[j - 1]] < view.depth[i]) { view.order[j] = view.order[j - 1]; j--; }
    view.order[j] = i;
  }
  for (let k = 0; k < view.count; k++) {
    const i = view.order[k];
    if (view.kind[i] === 0) drawPlayer(world.players[view.ref[i]], view.depth[i], view.sx[i], view);
    else drawBall(PAINT[world.balls[view.ref[i]].owner % 8], view.depth[i], view.sx[i], view);
  }
}

/** A rectangle of a sprite at depth d, cut into the runs of columns where no wall is nearer. */
function cut(x0: number, y: number, x1: number, h: number, d: number, color: u32, view: View): void {
  const cw = view.colW;
  const c0 = Math.max(0, Math.floor(x0 / cw)) as i32, c1 = Math.min(view.cols - 1, Math.floor((x1 - 0.001) / cw)) as i32;
  let run = -1;
  for (let c = c0; c <= c1 + 1; c++) {
    const open = c <= c1 && view.zbuf[c] > d;
    if (open && run < 0) run = c;
    if (!open && run >= 0) {
      const a = Math.max(x0, run * cw), b = Math.min(x1, c * cw);
      if (b > a) rect(a, y, b - a, h, color);
      run = -1;
    }
  }
}

function drawPlayer(p: Player, d: number, sx: number, view: View): void {
  const h = height();
  const size = h / d, floorY = h / 2 + size / 2;
  const paint = PAINT[p.id % 8];
  if (p.dead) {   // a splat on the floor
    cut(sx - size * 0.45, floorY - size * 0.06, sx + size * 0.45, size * 0.06, d, paint, view);
    return;
  }
  const bw = size * 0.5, top = floorY - size * 0.72;
  cut(sx - bw / 2, top + size * 0.08, sx + bw / 2, size * 0.64, d, paint, view);             // the body
  cut(sx - bw * 0.38, top, sx + bw * 0.38, size * 0.1, d, paint, view);                        // a rounder head
  cut(sx - bw * 0.5, floorY - size * 0.12, sx + bw * 0.5, size * 0.12, d, shade(paint, 0.6), view);   // its feet
  const eye = size * 0.09;
  cut(sx - bw * 0.3, top + size * 0.14, sx - bw * 0.3 + eye, eye, d, 0xffffff, view);
  cut(sx + bw * 0.3 - eye, top + size * 0.14, sx + bw * 0.3, eye, d, 0xffffff, view);
  cut(sx - bw * 0.3 + eye * 0.35, top + size * 0.17, sx - bw * 0.3 + eye * 0.8, eye * 0.55, d, 0x111111, view);
  cut(sx + bw * 0.3 - eye * 0.65, top + size * 0.17, sx + bw * 0.3 - eye * 0.2, eye * 0.55, d, 0x111111, view);
  const c = Math.floor(sx / view.colW) as i32;
  if (d < 9 && c >= 0 && c < view.cols && view.zbuf[c] > d) {   // the name over a visible player
    const s = h >= 500 ? 2 : 1;
    text(sx - p.name.length * 4 * s, top - 10 * s, p.name, paint, s);
  }
}

function drawBall(paint: u32, d: number, sx: number, view: View): void {
  const h = height();
  const size = h / d, r = Math.max(2, size * 0.05), cy = h / 2 + size / 2 - size * 0.45;
  cut(sx - r, cy - r * 0.6, sx + r, r * 1.2, d, paint, view);   // a rounder blob: two crossed rectangles
  cut(sx - r * 0.6, cy - r, sx + r * 0.6, r * 2, d, paint, view);
}
