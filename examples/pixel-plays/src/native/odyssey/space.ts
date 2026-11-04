import { W, H, pix, zb, ground, groundZ, kinds, shadowMask, Color, rgb, rgbColor, hash, noise, clamp, bayerAt } from '../renderer';

const SPACE: Color[] = [[12, 10, 30], [20, 16, 46], [32, 26, 66], [46, 38, 90]];
export const SLAB = { cx: 180, cy: 140, hx: 160, hy: 106 };
const STAR_COLORS = [rgb(236, 230, 210), rgb(176, 196, 244), rgb(250, 214, 170)];
const bright: number[][] = [];     // the few stars that twinkle: pixel x, y, colour index

/** The panel of deep space the scene floats on: an irregular edge dissolving into the white page, a violet haze, a sprinkle of stars. */
export function bakeSpace(): void {
  zb.fill(-1e9); pix.fill(rgb(255, 255, 255)); ground.fill(0); kinds.fill(0); shadowMask.fill(0);
  bright.length = 0;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    if (!inSlab(ix, iy)) continue;
    const i = iy * W + ix;
    const haze = noise(ix * .018 + 3, iy * .03) * .75 + noise(ix * .05, iy * .07 + 9) * .25;
    const shade = clamp(Math.floor((haze - .22) * 3.4 + (bayerAt(ix, iy) - .5) * .8 + (iy / H) * .35), 0, 3);
    let color = rgbColor(SPACE[shade]);
    const h = hash(ix * 1.3, iy * 1.7);
    if (h > .9935) color = STAR_COLORS[Math.floor(hash(ix, iy) * 3)];
    else if (h > .985) color = rgb(88, 84, 130);
    pix[i] = color; ground[i] = 1; zb[i] = -1e7; groundZ[i] = -1e7;
  }
  for (let k = 0; k < 16; k++) {
    const x = 34 + Math.floor(hash(k, 1) * 292), y = 44 + Math.floor(hash(k, 2) * 190);
    if (inSlab(x - 3, y - 3) && inSlab(x + 3, y + 3)) bright.push([x, y, Math.floor(hash(k, 3) * 3)]);
  }
}

export function inSlab(ix: number, iy: number): boolean {
  const e = (Math.abs((ix - SLAB.cx) / SLAB.hx) ** 6 + Math.abs((iy - SLAB.cy) / SLAB.hy) ** 6) ** (1 / 6);
  const rough = e + (noise(ix * .09, iy * .09) - .5) * .05;
  return !(rough > 1.02 || rough > .94 && hash(ix, iy) < (rough - .94) / .08);
}

/** Twinkling stars: stepped, a few at a time, so the sky breathes without noise. */
export function drawStars(frame: number): void {
  for (let k = 0; k < bright.length; k++) {
    const s = bright[k], phase = Math.floor(frame / 6 + k * 3.7) % 5;
    const color = STAR_COLORS[s[2]];
    const reach = phase === 0 ? 1 : phase === 1 || phase === 4 ? 2 : 3;
    pix[s[1] * W + s[0]] = color;
    for (let d = 1; d <= reach; d++) {
      const faded = d === reach ? rgb(120, 118, 160) : color;
      pix[s[1] * W + s[0] + d] = faded; pix[s[1] * W + s[0] - d] = faded;
      pix[(s[1] + d) * W + s[0]] = faded; pix[(s[1] - d) * W + s[0]] = faded;
    }
  }
}

/** The sun, off the corner of the frame: a soft dithered bloom and a four-point star. */
export function drawSun(frame: number): void {
  const cx = 52, cy = 58;
  for (let iy = cy - 30; iy <= cy + 30; iy++) for (let ix = cx - 30; ix <= cx + 30; ix++) {
    if (!inSlab(ix, iy)) continue;
    const d = Math.hypot(ix - cx, iy - cy);
    if (d > 28) continue;
    const power = 1 - d / 28;
    if (power * power * 1.25 > bayerAt(ix, iy) + (d < 5 ? -1 : 0)) pix[iy * W + ix] = d < 4 ? rgb(255, 252, 235) : d < 10 ? rgb(255, 232, 170) : rgb(224, 168, 120);
  }
  const reach = 16 + (Math.floor(frame / 10) % 3) * 2;
  for (let d = 4; d < reach; d++) {
    const c = d < reach - 4 ? rgb(255, 240, 200) : rgb(214, 170, 130);
    pix[cy * W + cx + d] = c; pix[cy * W + cx - d] = c; pix[(cy + d) * W + cx] = c; pix[(cy - d) * W + cx] = c;
  }
}
