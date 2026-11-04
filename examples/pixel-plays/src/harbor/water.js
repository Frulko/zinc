import { W, H, pix, zb, groundZ, kinds, project, rgb } from '../renderer.js';
import { KIND_WATER, waterStreaks } from './scenery.js';

const LIGHT = rgb(171, 199, 166);
const DARK = rgb(51, 111, 111);

export function waterPixel(x, y, color = LIGHT) {
  const point = project(x, y, 0);
  const ix = Math.round(point.sx), iy = Math.round(point.sy);
  if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
  const index = iy * W + ix;
  if (kinds[index] === KIND_WATER && zb[index] === groundZ[index]) pix[index] = color;
}

export function waterRing(x, y, radius, broken = false) {
  for (let k = 0; k < 64; k++) {
    if (broken && k % 5 < 2) continue;
    const angle = k * Math.PI / 32;
    waterPixel(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .6);
  }
}

export function drawWater(time, boat) {
  for (const streak of waterStreaks) {
    const y = (streak.y + time * streak.speed + 17) % 17 - 8.5;
    for (let k = 0; k < streak.length; k++) {
      waterPixel(streak.x + Math.sin(y * .5 + streak.x) * .18, y + k * .12, k === 0 ? LIGHT : DARK);
    }
  }
  for (const postY of [-1.3, 1.2]) waterRing(.7, postY, .16 + (time * .18) % .42, true);
  for (let k = 0; k < 4; k++) {
    const age = (time * .38 + k * .25) % 1;
    waterRing(boat.x - 2.5 - age * 1.5, boat.y, .3 + age * .8, true);
  }
}
