import { W, H, pix, zb, groundZ, kinds, project } from '../renderer';

export function waterPoint(x: number, y: number, color: u32): void {
  const point = project(x,y,0), ix = Math.round(point.sx), iy = Math.round(point.sy);
  if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
  const index = iy * W + ix;
  if (kinds[index] === 2 && zb[index] === groundZ[index]) pix[index] = color;
}
export function ripple(x: number, y: number, radius: number, color: u32, broken: boolean = false): void {
  for (let k = 0; k < 64; k++) {
    if (broken && k % 5 < 2) continue;
    const angle = k * Math.PI / 32;
    waterPoint(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .6, color);
  }
}
