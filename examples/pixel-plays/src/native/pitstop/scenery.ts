import {
  W, H, R2, COS, pix, zb, ground, groundZ, kinds, KIND_GRASS, bakedPix, bakedZ, staticShadow, shadowMask,
  Color, rgb, rgbColor, hash, noise, clamp, bayerAt, unproject, box, capsule, sphere, plot,
  growGrass, growTree, bakeOcclusion, applyShadows, copyInto, CachedModel, beginModel, captureModel,
} from '../renderer';
import { STONE, CREAM, BRICK, BLUE, WOOD } from '../harbor/palette';
import { CORNERS } from './state';
import { wheel, TYRE, SILVER, WHEEL_R } from './wheel';

export const RED: Color = [176, 62, 48];
export const INK: Color = [52, 50, 60];
export const HELMET: Color = [226, 184, 70];
export const KIND_ROAD = 2;
const ASPHALT: Color[] = [[92, 88, 102], [106, 101, 112], [121, 115, 124], [138, 130, 134]];
const GRASS_TONES: Color[] = [[60, 88, 63], [82, 108, 64], [112, 130, 75], [141, 149, 91]];

let carModel: CachedModel | null = null;

function terrain(x: number, y: number, ix: number, iy: number, i: number): u32 {
  const edge = (Math.abs(x / 17.5) ** 4 + Math.abs(y / 10.6) ** 4) ** .25;
  const rough = edge + (noise(x * 1.1, y * 1.1) - .5) * .10;
  if (rough > 1.03 || rough > .92 && hash(ix, iy) < (rough - .92) / .11) return 0;
  if (y > 7.1 + (noise(x * .3, 2) - .5) * .9) {
    kinds[i] = KIND_GRASS;
    return rgbColor(GRASS_TONES[clamp(Math.floor(noise(x * .9, y * .9) * 4 + hash(ix, iy) * .6), 0, 3)]);
  }
  if (Math.abs(y) < 4.45) {
    kinds[i] = KIND_ROAD;
    const ax = Math.abs(x), ay = Math.abs(y);
    // Painted lane edge, the team box and the line the nose stops at.
    if (Math.abs(ay - 4.3) < .11) return rgb(222, 214, 190);
    if (ax <= 5.0 && ay <= 2.65 && (ax > 4.87 || ay > 2.52)) return rgb(222, 214, 190);
    for (const wheel of CORNERS) if (Math.abs(x - wheel.x) < .5 && Math.abs(ay - Math.abs(wheel.y)) < .4 && (Math.abs(x - wheel.x) > .38 || Math.abs(ay - Math.abs(wheel.y)) > .28)) return rgb(212, 190, 110);
    const shade = clamp(Math.floor(1.5 + (noise(x * .5, y * .7) - .5) * 2.4 + (bayerAt(ix, iy) - .5) * .5), 0, 3);
    return rgbColor(ASPHALT[shade]);
  }
  kinds[i] = 0;
  const shade = clamp(Math.floor(1.6 + (noise(x * .6, y * .5) - .5) * 2.6 + (bayerAt(ix, iy) - .5) * .6), 0, 3);
  return rgbColor(STONE[shade]);
}

function tyreStack(x: number, y: number, count: number, band: Color): void {
  for (let j = 0; j < count; j++) wheel(x, y, .2 + j * .4, 2, j * 1.7, band, .62, .18);
}

function garage(): void {
  box(-14, -10.2, 0, 14, -6.4, 3.6, CREAM);
  for (let k = 0; k < 4; k++) {
    const x0 = -12.2 + k * 7;
    box(x0, -6.39, 0, x0 + 4.6, -6.37, 2.7, [44, 40, 52]);
    box(x0 + .3, -6.36, 0, x0 + 4.3, -6.35, .5, [86, 76, 88]);       // the lit floor inside
    box(x0 - .5, -6.38, 0, x0 - .1, -6.36, 3.5, BLUE);
  }
  box(-14.3, -10.5, 3.6, 14.3, -6.1, 3.85, BRICK);
  box(-14, -6.12, 2.8, 14, -6.1, 3.5, BRICK);
  // The team's Z, built from bars so it survives at this size.
  box(-1, -6.09, 3.3, 1, -6.07, 3.4, CREAM);
  box(-1, -6.09, 2.9, 1, -6.07, 3.0, CREAM);
  for (let k = 0; k < 6; k++) box(.78 - k * .31, -6.09, 3.22 - k * .06, 1 - k * .31, -6.07, 3.3 - k * .06, CREAM);
  capsule([-12.5, -8, 3.85], [-12.5, -8, 7.3], .06, .06, (): Color => SILVER, 'solid');
  // Racks of spare tyres at the doors: compounds by colour band.
  tyreStack(-8.7, -5.3, 3, [200, 66, 52]);
  tyreStack(-8.7, -4.2, 2, [200, 66, 52]);
  tyreStack(6.4, -5.3, 3, [226, 186, 70]);
  tyreStack(6.4, -4.2, 2, [226, 214, 176]);
  box(11.6, -5.9, 0, 13.4, -5.0, .75, INK);                          // tool chest
  box(11.6, -5.0, .75, 13.4, -4.95, .8, RED);
}

function pitWall(): void {
  box(-16, 5.4, 0, 16, 6.1, .9, CREAM);
  box(-16.1, 5.35, .9, 16.1, 6.15, 1.0, STONE[1]);
  box(-16, 6.11, .25, 16, 6.13, .55, BLUE);
  for (let x = -15; x < 15; x += 3) box(x, 6.12, .26, x + 1.2, 6.14, .54, CREAM);
  // Timing desk on the wall: two screens with a cool glow.
  box(-9, 5.5, 1.0, -4.5, 6.0, 1.1, WOOD);
  for (const x of [-8.4, -6.4]) {
    box(x, 5.6, 1.1, x + 1.0, 5.68, 1.75, INK);
    box(x + .08, 5.69, 1.2, x + .92, 5.7, 1.68, [70, 156, 160]);
  }
  // Signal pole at the pit exit: the lamps are lit per frame.
  capsule([9, 4.9, 0], [9, 4.9, 3.5], .09, .09, (): Color => SILVER, 'solid');
  box(8.7, 4.72, 2.75, 9.3, 5.12, 4.35, INK);
}

function carBody(): void {
  const red = (): Color => RED, ink = (): Color => INK, cream = (): Color => CREAM;
  box(-3.2, -1.15, .1, 2.9, 1.15, .28, INK);
  for (const s of [-1, 1]) {
    capsule([-1.9, s * .95, .62], [.9, s * .85, .56], .46, .36, red, 'solid');
    sphere(1.0, s * .84, .6, .24, INK, 'solid');
    capsule([-1.5, s * 1.22, .62], [-.5, s * 1.2, .62], .05, .05, cream, 'solid');   // livery stripe
  }
  capsule([-.2, 0, .62], [3.0, 0, .46], .52, .24, red, 'solid');
  capsule([3.0, 0, .46], [4.75, 0, .3], .24, .12, red, 'solid');
  sphere(4.78, 0, .3, .13, CREAM, 'solid');
  capsule([-3.2, 0, .72], [-.4, 0, .96], .46, .34, red, 'solid');
  capsule([-3.1, 0, 1.12], [-.9, 0, 1.2], .07, .07, cream, 'solid');
  sphere(-.45, 0, 1.28, .3, INK, 'solid');
  sphere(.5, 0, .98, .34, INK, 'solid');
  sphere(.42, 0, 1.2, .27, HELMET, 'gloss');
  sphere(.62, 0, 1.2, .17, [40, 46, 62], 'solid');
  // Halo
  capsule([1.35, -.42, .92], [.9, 0, 1.55], .05, .05, ink, 'solid');
  capsule([1.35, .42, .92], [.9, 0, 1.55], .05, .05, ink, 'solid');
  capsule([.9, 0, 1.55], [1.7, 0, .98], .05, .05, ink, 'solid');
  // Wings
  box(4.0, -1.75, .1, 4.75, 1.75, .22, INK);
  box(4.45, -1.75, .22, 4.75, 1.75, .3, CREAM);
  for (const s of [-1.8, 1.72]) box(4.0, s, .08, 4.75, s + .08, .5, RED);
  box(-3.95, -1.35, 1.25, -3.25, 1.35, 1.4, RED);
  box(-3.95, -1.35, 1.4, -3.25, 1.35, 1.46, CREAM);
  for (const s of [-1.43, 1.35]) box(-3.95, s, .7, -3.25, s + .08, 1.5, INK);
  capsule([-3.0, 0, .9], [-3.6, 0, 1.25], .06, .06, ink, 'solid');
  // Wishbones to every hub: the wheels come and go, these stay.
  for (const c of CORNERS) {
    capsule([c.x - .15, 0, .5], [c.x, c.side * (Math.abs(c.y) - .06), WHEEL_R], .04, .04, ink, 'solid');
    capsule([c.x + .15, 0, .62], [c.x, c.side * (Math.abs(c.y) - .06), WHEEL_R], .04, .04, ink, 'solid');
  }
  // Roundel on the near sidepod
  for (let a = 0; a < 6.3; a += .08) for (let r = 0; r < .3; r += .05) plot(-.55 + Math.cos(a) * r, 1.3, .64 + Math.sin(a) * r, rgb(224, 215, 186));
}

export function carAt(x: number, z: number): void { if (carModel !== null) carModel.drawAt(x, 0, z); }

export function bakePit(): void {
  zb.fill(-1e9); pix.fill(rgb(255, 255, 255));
  ground.fill(0); kinds.fill(0); shadowMask.fill(0);
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const p = unproject(ix + .5, iy + .5), i = iy * W + ix;
    const color = terrain(p.x, p.y, ix, iy, i);
    if (color === 0) continue;
    pix[i] = color; ground[i] = 1; zb[i] = (p.x + p.y) / R2 * COS;
  }
  copyInto(groundZ, zb);
  growGrass();
  garage(); pitWall();
  growTree(-13.6, 9.2, .9, 260, 11);
  growTree(14.2, 9.1, .8, 240, 29);
  bakeOcclusion(); copyInto(staticShadow, shadowMask); applyShadows(groundZ);
  copyInto(bakedPix, pix); copyInto(bakedZ, zb);
  beginModel(); carBody(); carModel = captureModel();
}

