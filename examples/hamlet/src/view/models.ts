import { W, H, pix, zb, setView, Color, CachedModel, rgb, beginModel, captureModel, touchModelBuffer, box, capsule, sphere, plot, rampOf, hash, shadowMask, pine } from '../pixel';
import { ZOOM_SCALES } from './camera';
import { settings } from '../settings';
import { STONE, WOOD_HONEY, WOOD_BROWN, BARK, TERRACOTTA } from '../palettes';

// Every static object is lit and rasterised once into a CachedModel (same projection, light and ramps as the Pixel Plays games),
// then stamped on the scene wherever it stands. Add an object: write a function, push it in buildModels, give it an index.
export const MODEL_HOUSE = 0;
export const MODEL_SAWMILL = 1;
export const MODEL_LODGE = 2;
export const MODEL_FISHERY = 3;
/** The model id of each building type, in the order of assets/economy.json (a building's model sits at its own index). */
export const MODEL_IDS: string[] = ['house', 'sawmill', 'lodge', 'fishery'];
export const MODEL_GATE = 4;
export const MODEL_TREE = 5;            // 4 variants: 5..8
export const MODEL_ROCK = 9;            // 2 variants: 9..10
export const TREE_HEIGHT: number[] = [2.8, 3.3, 3.8, 3.2];
/** The models of the zoom level in use. Each level has its own set, baked once (the stamp depends on pixels per unit). */
export const models: CachedModel[] = [];
const modelSets: CachedModel[][] = ZOOM_SCALES.map((_s: number): CachedModel[] => []);

const flat = (c: Color): ((z: number) => Color) => (): Color => c;

/** A gable roof: ridge along y, slopes facing -x and +x, shingles in staggered rows. */
function gableRoof(x0: number, x1: number, y0: number, y1: number, base: number, rise: number, color: Color, seed: number): void {
  const tiles = rampOf(color), half = (x1 - x0) / 2, mid = (x0 + x1) / 2;
  for (let x = x0; x <= x1; x += .04) {
    const z = base + rise * (1 - Math.abs(x - mid) / half);
    for (let y = y0; y <= y1; y += .04) {
      const row = Math.floor((y - y0) * 6), tile = Math.floor(x * 5 + (row % 2) * .5) + seed;
      plot(x, y, z, tiles[x < mid ? 1 : (hash(tile, row) > .6 ? 4 : 3)]);
    }
  }
}
/** The triangular gable wall under that roof, on the +y face. */
function gableWall(x0: number, x1: number, y: number, base: number, rise: number, roofHalf: number, color: Color): void {
  const wall = rampOf(color), mid = (x0 + x1) / 2;
  for (let x = x0; x <= x1; x += .04) {
    const top = base + rise * (1 - Math.abs(x - mid) / roofHalf);
    for (let z = base; z <= top - .04; z += .04) plot(x, y, z, wall[2 + (hash(Math.floor(x * 6), Math.floor(z * 6)) > .8 ? 1 : 0)]);
  }
}

function house(): void {
  box(-.72, -.72, 0, .72, .72, 1.5, STONE);
  gableRoof(-.92, .92, -.86, .86, 1.45, 1.05, TERRACOTTA, 0);
  gableWall(-.72, .72, .72, 1.5, 1.05, .92, STONE);
  box(-.17, .71, 0, .17, .76, .95, [112, 84, 56]);                      // door
  box(.71, -.34, .6, .76, .12, 1.12, [70, 96, 92]);                    // window
  box(.7, -.38, .55, .8, .16, .6, [148, 124, 94]);                     // sill
  box(.32, -.42, 1.7, .62, -.14, 2.55, [186, 170, 140]);               // chimney
}

function sawmill(): void {
  box(-.95, -.85, 0, .95, .85, .16, WOOD_BROWN);                       // deck
  for (const x of [-.85, .8]) for (const y of [-.75, .7]) box(x, y, .16, x + .12, y + .12, 1.9, WOOD_BROWN);
  gableRoof(-1, 1, -.95, .95, 1.9, .55, [112, 100, 80], 3);
  box(-.2, -.5, .16, .5, .5, .52, WOOD_HONEY);                         // bench
  capsule([-.1, -.4, .66], [-.1, .45, .66], .15, .15, flat([150, 118, 80]), 'rough');
  for (let a = 0; a < Math.PI * 2; a += .06) {                         // saw blade, edge-on to the camera's right side
    const r = .38 + (Math.floor(a * 9) % 2) * .05;
    plot(.55, Math.cos(a) * r, .95 + Math.sin(a) * r, a > 3.4 ? rgb(182, 188, 184) : rgb(150, 156, 154));
  }
  for (let k = 0; k < 3; k++) capsule([-.8, -.55 + k * .22, .36], [-.8, .1 + k * .22, .36], .15, .15, flat(BARK), 'rough');
  for (let layer = 0; layer < 3; layer++) box(.15, .5 - layer * .02, .16 + layer * .09, .85, .8, .25 + layer * .09, [214, 180, 120], layer);
}

function lodge(): void {
  box(-.68, -.68, 0, .68, .68, 1.5, [104, 76, 52]);
  for (let z = .1; z < 1.5; z += .24) {                                // stacked logs, visible on the two faces the camera sees
    capsule([-.72, .7, z], [.72, .7, z], .13, .13, flat([132, 96, 62]), 'rough');
    capsule([.7, -.72, z], [.7, .72, z], .13, .13, flat([118, 86, 56]), 'rough');
  }
  gableRoof(-.92, .92, -.86, .86, 1.5, .95, [92, 108, 70], 7);
  gableWall(-.7, .7, .7, 1.5, .95, .92, [104, 76, 52]);
  box(-.2, .72, 0, .2, .78, .98, [70, 52, 38]);                        // door
  for (const side of [-1, 1]) {                                        // antlers above the door
    capsule([0, .8, 1.15], [side * .3, .8, 1.5], .03, .02, flat([226, 212, 176]), 'solid');
    capsule([side * .17, .8, 1.32], [side * .35, .8, 1.28], .02, .015, flat([226, 212, 176]), 'solid');
  }
  box(.74, -.5, .7, .8, .1, 1.3, [200, 160, 110]);                     // hide drying on the wall
  box(.74, .2, .6, .8, .55, 1.15, [168, 126, 88]);
  box(.3, -.46, 1.7, .56, -.2, 2.4, [150, 140, 120]);                  // chimney
}

/** A fishing hut: planked cabin on a small landing, a net drying on a frame, a barrel and a catch basket. */
function fishery(): void {
  box(-.9, -.8, 0, .9, .8, .14, WOOD_BROWN);                                // landing
  box(-.6, -.55, .14, .6, .55, 1.3, [150, 126, 92]);                        // cabin
  for (let x = -.55; x < .6; x += .2) box(x, .55, .14, x + .02, .56, 1.3, [112, 90, 62]);   // plank seams on the +y face
  gableRoof(-.78, .78, -.7, .7, 1.25, .8, [104, 124, 128], 11);
  gableWall(-.6, .6, .55, 1.3, .8, .78, [150, 126, 92]);
  box(-.15, .54, .14, .15, .6, .9, [70, 52, 38]);                           // door
  box(.59, -.3, .6, .64, .2, 1.0, [70, 96, 92]);                            // window
  box(.7, -.78, .14, .78, -.7, 1.5, WOOD_BROWN); box(.7, .5, .14, .78, .58, 1.5, WOOD_BROWN);   // net frame posts
  for (let k = 0; k < 24; k++) {                                            // the net: a loose mesh of pale pixels between the posts
    const y = -.7 + (k % 12) * .105, z = 1.45 - Math.floor(k / 12) * .35 - Math.sin((k % 12) / 12 * Math.PI) * .12;
    for (let j = 0; j < 7; j++) plot(.74, y, z - j * .1, rgb(206, 196, 164));
  }
  capsule([-.75, .55, .3], [-.75, .55, .8], .17, .17, flat([128, 92, 60]), 'rough');          // barrel
  sphere(-.75, .55, .82, .15, [96, 70, 48], 'rough');
  sphere(-.35, .72, .25, .16, [180, 150, 96], 'rough');                                       // basket
  sphere(-.3, .72, .36, .06, [176, 190, 184], 'solid');                                       // a silver fish on top
}

/** The entrance of the hamlet: two posts, a beam and a banner over the road (which runs along x). */
function gate(): void {
  for (const y of [-.92, .78]) box(-.12, y, 0, .12, y + .16, 2.3, WOOD_BROWN);
  box(-.15, -.96, 2.1, .15, .96, 2.38, WOOD_HONEY);
  box(-.04, -.4, 1.45, .04, .4, 2.1, [170, 90, 70]);
}

function tree(variant: number): void {
  const greens: Color[] = [[56, 92, 62], [48, 82, 58], [70, 104, 64]];
  if (variant < 3) { pine(0, 0, TREE_HEIGHT[variant], greens[variant], false, variant * 7); return; }
  capsule([0, 0, 0], [.05, 0, 2.3], .13, .07, flat([216, 210, 192]), 'rough');          // birch
  for (const [x, y, z, r] of [[0, 0, 2.7, .62], [.42, .2, 2.25, .46], [-.4, -.2, 2.35, .5], [0, .32, 3.05, .42]]) {
    sphere(x, y, z, r, [118, 148, 76], 'rough');
    sphere(x + .12, y - .1, z + .2, r * .6, [146, 168, 92], 'rough');
  }
}
function rock(variant: number): void {
  const grey: Color = variant === 0 ? [158, 152, 134] : [132, 128, 112];
  sphere(0, 0, .3, .55, grey, 'rough');
  sphere(.4, .25, .2, .35, [grey[0] + 14, grey[1] + 12, grey[2] + 10], 'rough');
  sphere(-.3, .3, .18, .28, grey, 'rough');
}

/** Reads the four bytes of a packed colour (whatever their order) so channels can be averaged. */
function mix(sum: number[], c: u32, w: number): void {
  sum[0] += (c & 255) * w; sum[1] += ((c >> 8) & 255) * w; sum[2] += ((c >> 16) & 255) * w; sum[3] += ((c >>> 24) & 255) * w;
}
/**
 * Rescales the picture in the buffer by f around the bake origin, for the "fixed detail" modes. Nearest sample per destination pixel, or (settings.resample = 1)
 * averaged: a 3 x 3 box when shrinking and a bilinear blend when enlarging, only over pixels the model covers, so its edges stay clean and its style is kept.
 */
function reduceBuffer(f: number, ox: number, oy: number): void {
  const reducedPix: u32[] = Array.from({ length: W * H }, (): u32 => 0);
  const reducedDepth: number[] = Array.from({ length: W * H }, (): number => -1e9);
  const smooth = settings.resample === 1, sum: number[] = [0, 0, 0, 0];
  for (let j = 0; j < pix.length; j++) {
    const sx = ox + (j % W - ox) / f, sy = oy + (Math.floor(j / W) - oy) / f;
    if (!smooth) {
      const x = Math.round(sx), y = Math.round(sy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (zb[i] <= -1e8) continue;
      reducedDepth[j] = zb[i]; reducedPix[j] = pix[i];
      continue;
    }
    sum[0] = 0; sum[1] = 0; sum[2] = 0; sum[3] = 0;
    let weight = 0, total = 0, depth = -1e9;
    if (f < 1) {                                                   // shrinking: average the source pixels under the destination pixel
      const r = .5 / f;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const x = Math.round(sx + a * r * .66), y = Math.round(sy + b * r * .66);
        total++;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (zb[i] <= -1e8) continue;
        mix(sum, pix[i], 1); weight++; depth = Math.max(depth, zb[i]);
      }
    } else {                                                       // enlarging: blend the four nearest source pixels
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const w = (a === 0 ? 1 - fx : fx) * (b === 0 ? 1 - fy : fy), x = x0 + a, y = y0 + b;
        total += w;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (zb[i] <= -1e8) continue;
        mix(sum, pix[i], w); weight += w; depth = Math.max(depth, zb[i]);
      }
    }
    if (weight * 2 < total || weight === 0) continue;               // the model covers less than half of this pixel: leave it empty
    const c0 = Math.round(sum[0] / weight), c1 = Math.round(sum[1] / weight), c2 = Math.round(sum[2] / weight), c3 = Math.round(sum[3] / weight);
    reducedPix[j] = (c0 | (c1 << 8) | (c2 << 16) | (c3 << 24)) >>> 0; reducedDepth[j] = depth;
  }
  for (let i = 0; i < pix.length; i++) { pix[i] = reducedPix[i]; zb[i] = reducedDepth[i]; }
  touchModelBuffer();
}

/** Forgets the baked sets (the detail mode changed). */
export function resetModels(): void { for (let i = 0; i < modelSets.length; i++) modelSets[i] = []; }

/**
 * Makes `models` the set of a zoom level, baking it first if needed. `reduceFrom` is the scale of the sharp set to shrink instead of
 * lighting again at this level (0 = light it at its own scale). The caller points the renderer back at the camera afterwards.
 */
export function useModels(level: number, scale: number, reduceFrom: number): void {
  if (modelSets[level].length === 0) {
    const bakeScale = reduceFrom > 0 ? reduceFrom : scale;
    const set = modelSets[level];
    const bake = (draw: () => void): void => {
      setView(bakeScale, W / 2, H * .6);            // bake in the middle of the buffer; a stamp only keeps offsets from the origin
      beginModel(); draw();
      if (reduceFrom > 0) { reduceBuffer(scale / reduceFrom, W / 2, H * .6); setView(scale, W / 2, H * .6); }
      set.push(captureModel()); shadowMask.fill(0);
    };
    bake(house); bake(sawmill); bake(lodge); bake(fishery); bake(gate);
    for (let v = 0; v < 4; v++) bake((): void => tree(v));
    for (let v = 0; v < 2; v++) bake((): void => rock(v));
  }
  models.length = 0;
  for (const m of modelSets[level]) models.push(m);
}
