// Seam test of ScrollLayer: a window assembled from 128 x 96 chunks must equal, pixel for pixel, the same region baked in one piece.
// A deterministic world (grass ground, trees with captured leaves, rocks, long shadows) is painted by position only, as a game's painter must.
// tests/t0/scroll_seam.sh runs it and expects "seams ok".
import { configureRenderer, setVegetation, unproject, project, hash, GRASS, KIND_GRASS, ground, groundZ, kinds, pix, zb, growGrass, growTree, sphere, castShadow, R2, COS, PX, PY, W, H } from '../../../examples/pixel-plays/src/native/renderer';
import { ScrollLayer } from '../../../examples/pixel-plays/src/native/scroll';
import type { ScrollPainter } from '../../../examples/pixel-plays/src/native/scroll';

const CELL = 5, REACH = 90;

class World implements ScrollPainter {
  steps(): number { return 2; }
  paint(k: number, x0: number, y0: number, x1: number, y1: number): void {
    if (k === 0) this.ground(); else this.objects(x0, y0, x1, y1);
  }
  private ground(): void {
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const i = iy * W + ix, wx = ix + PX, wy = iy + PY, p = unproject(ix + .5, iy + .5), v = (p.x + p.y) / R2;
      const t = hash(wx, wy), g = GRASS[(t * 3 | 0) + 1];
      pix[i] = 0xFF000000 | g[2] << 16 | g[1] << 8 | g[0]; ground[i] = 1; zb[i] = v * COS; groundZ[i] = zb[i];
      kinds[i] = hash(wx >> 3, wy >> 3) > .25 ? KIND_GRASS : 0;
    }
    growGrass();
  }
  private objects(x0: number, y0: number, x1: number, y1: number): void {
    // cells of the world (in world units), found from the corners of the rectangle; each object then keeps or drops itself by its own projection
    let lo = 1e9, hi = -1e9, lo2 = 1e9, hi2 = -1e9;
    for (const c of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const p = unproject(c[0] - PX, c[1] - PY);
      lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); lo2 = Math.min(lo2, p.y); hi2 = Math.max(hi2, p.y);
    }
    const pad = 12;
    for (let gy = Math.floor((lo2 - pad) / CELL); gy <= Math.floor((hi2 + pad) / CELL); gy++) for (let gx = Math.floor((lo - pad) / CELL); gx <= Math.floor((hi + pad) / CELL); gx++) {
      const h = hash(gx * 7 + 3, gy * 13 + 5);   // raster order of the cells: the same subsequence in every window
      if (h < .25) continue;
      const x = (gx + hash(gx, gy)) * CELL, y = (gy + hash(gy, gx + 9)) * CELL;
      const p = project(x, y, 0), wx = p.sx + PX, wy = p.sy + PY;
      if (wx < x0 - REACH || wx > x1 + REACH || wy < y0 - REACH || wy > y1 + REACH) continue;
      if (h > .6) { growTree(x, y, .7, 90, gx * 31 + gy * 17); castShadow(x, y, 3, 1.6); }
      else { sphere(x, y, .5, .7, [150, 146, 138], 'rough'); castShadow(x, y, .8, 1); }
    }
  }
}

configureRenderer(0, 1.3, -.12);
setVegetation([[30, 58, 46], [44, 80, 50], [66, 104, 54], [104, 136, 60], [150, 168, 72]], [30, 66, 50], [54, 100, 56], [104, 142, 66]);
const CW = 128, CH = 96, M = 12, COLS = 3, ROWS = 2;
const world = new World();
const parts = new ScrollLayer(world, CW, CH, M);
const whole = new ScrollLayer(world, CW * COLS, CH * ROWS, M);
const ref = whole.bake(0, 0);
const fail: string[] = [];
let tufts = 0, leaves = 0;
for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
  const c = parts.bake(cx, cy);
  const names = ['baked', 'depth', 'ground', 'groundZ', 'kinds', 'shade'];
  const diffs = [0, 0, 0, 0, 0, 0];
  let first = '';
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const a = y * CW + x, b = (cy * CH + y) * CW * COLS + cx * CW + x;
    const av: number[] = [c.baked[a], c.depth[a], c.ground[a], c.groundZ[a], c.kinds[a], c.shade[a]];
    const bv: number[] = [ref.baked[b], ref.depth[b], ref.ground[b], ref.groundZ[b], ref.kinds[b], ref.shade[b]];
    // colours, masks and kinds must be equal; a depth may differ by float rounding (the projection subtracts the layer origin before a sphere's per-pixel depth)
    for (let q = 0; q < 6; q++) if (q === 1 || q === 3 ? Math.abs(av[q] - bv[q]) > 1e-9 : av[q] !== bv[q]) { diffs[q]++; if (!first) first = names[q] + ' at ' + (cx * CW + x) + ',' + (cy * CH + y) + ': ' + av[q] + ' vs ' + bv[q]; }
  }
  for (let q = 0; q < 6; q++) if (diffs[q] > 0) fail.push('chunk ' + cx + ',' + cy + ' ' + names[q] + ' differs at ' + diffs[q] + ' pixels (first ' + first + ')');
  tufts += c.tufts.length; leaves += c.leaves.length;
}
let refTufts = ref.tufts.length, refLeaves = ref.leaves.length;
if (tufts !== refTufts) fail.push('tufts: ' + tufts + ' in chunks, ' + refTufts + ' whole');
if (leaves !== refLeaves) fail.push('leaves: ' + leaves + ' in chunks, ' + refLeaves + ' whole');
if (refTufts === 0 || refLeaves === 0) fail.push('the test world has no tufts or leaves');
console.log(fail.length === 0 ? 'seams ok (' + refTufts + ' tufts, ' + refLeaves + ' leaves)' : fail.join('\n'));
