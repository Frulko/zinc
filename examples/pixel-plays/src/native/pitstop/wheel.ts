import { COS, SIN, R2, Color, Vec3, rgb, rgbColor, rampOf, clamp, plot } from '../renderer';
export const TYRE: Color = [60, 58, 68];
export const SILVER: Color = [178, 176, 184];
export const WHEEL_R = .68;
export const WHEEL_HALF = .3;

const NUT = rgb(240, 200, 84);

/** A wheel as lit points: two faces and a tread, in the same projection and light as the volumes. axis 1 stands (axle along y), axis 2 lies flat. */
export function wheel(cx: number, cy: number, cz: number, axis: number, rot: number, compound: Color, R: number = WHEEL_R, half: number = WHEEL_HALF): void {
  const dark = rampOf(TYRE), silver = rampOf(SILVER), ring = rgbColor(compound);
  const at = (a: number, r: number, n: number): Vec3 => axis === 1 ? [cx + r * Math.cos(a), cy + n, cz + r * Math.sin(a)] : [cx + r * Math.cos(a), cy + r * Math.sin(a), cz + n];
  for (let r = .04; r < R; r += .04) {
    const steps = Math.ceil(6.2832 * r / .04) + 1;
    for (let k = 0; k < steps; k++) {
      const a = k * 6.2832 / steps;
      let color: u32;
      if (r < .12) color = NUT;
      else if (r < .4) color = Math.sin((a + rot) * 5) > .3 ? dark[1] : silver[3];
      else if (r > .5 && r < .55) color = ring;
      else color = r > .62 ? dark[1] : dark[2];
      const p = at(a, r, half);
      plot(p[0], p[1], p[2], color);
    }
  }
  const steps = Math.ceil(6.2832 * R / .04) + 1;
  for (let k = 0; k < steps; k++) {
    const a = k * 6.2832 / steps;
    // the tread shaded by its own normal, with the renderer's light
    const nx = Math.cos(a), ny = axis === 1 ? 0 : Math.sin(a), nz = axis === 1 ? Math.sin(a) : 0;
    const sx = (nx - ny) / R2, vb = (nx + ny) / R2, sy = vb * SIN - nz * COS, sz = vb * COS + nz * SIN;
    const l = clamp(-.55 * sx - .6 * sy + .58 * sz, 0, 1);
    const color = dark[clamp(Math.floor(l * 4.4 + .2), 1, 4)];
    for (let n = -half; n <= half; n += .04) {
      const p = at(a, R, n);
      plot(p[0], p[1], p[2], color);
    }
  }
}

