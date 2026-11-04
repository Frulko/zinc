import { W, H, pix, zb, groundZ, Color, rgb, rampOf, hash, ease, clamp, bayerAt } from '../renderer';

// The planet is baked once as an equirectangular map (land, ice, clouds) and a per-pixel table (map row, base column, light, atmosphere).
// A frame only turns the columns: land and clouds at their own speed, in the same lit ramps and Bayer dither as every volume of the renderer.
const TW = 192, TH = 96;
const OCEAN: Color = [38, 88, 150], SHALLOW: Color = [58, 128, 160], LAND: Color = [84, 126, 70], DESERT: Color = [182, 150, 98], ICE: Color = [232, 238, 242], CLOUD: Color = [242, 242, 246], AIR: Color = [124, 178, 240];
const land: number[] = Array.from({ length: TW * TH }, (): number => 0);
const cloud: number[] = Array.from({ length: TW * TH }, (): number => 0);
const spots: number[] = [];      // pixel index
const rows: number[] = [];
const cols: number[] = [];       // base column, in texels
const lights: number[] = [];     // ramp index 0..4
const rims: number[] = [];       // 1 on the atmosphere's edge
const thresholds: number[] = [];
let ramps: u32[][] = [];
const FLOOR_NIGHT = rgb(10, 14, 34);

function h3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function n3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = ease(x - ix), fy = ease(y - iy), fz = ease(z - iz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
function fbm(x: number, y: number, z: number): number {
  return n3(x, y, z) * .55 + n3(x * 2.1 + 5, y * 2.1 + 5, z * 2.1 + 5) * .3 + n3(x * 4.3 + 9, y * 4.3 + 9, z * 4.3 + 9) * .15;
}

function paintMaps(): void {
  for (let r = 0; r < TH; r++) {
    const lat = (r + .5) / TH * Math.PI - Math.PI / 2;
    for (let c = 0; c < TW; c++) {
      const lon = (c + .5) / TW * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
      const f = fbm(px * 2.1 + 3, py * 2.1, pz * 2.1), k = r * TW + c;
      let code = 0;
      if (f > .5) code = fbm(px * 4 + 11, py * 4, pz * 4) > .56 && Math.abs(lat) < .75 && Math.abs(lat) > .15 ? 3 : 2;
      else if (f > .46) code = 1;
      if (Math.abs(lat) > 1.3 + (n3(px * 6, py * 6, pz * 6) - .5) * .25) code = 4;
      land[k] = code;
      const band = Math.cos(lat * 3.2) * .08;
      const d = fbm(px * 3.3 + 17, py * 4.6 + 2, pz * 3.3 + 8) + band;
      cloud[k] = clamp((d - .54) * 4.2, 0, 1) * 255;
    }
  }
}

/** The planet is a disc of radius `radius` pixels at (cx, cy), clipped to the pixels where `inside` says the picture exists. Tilt in radians. */
export function bakeEarth(cx: number, cy: number, radius: number, tilt: number, inside: (ix: number, iy: number) => boolean): void {
  paintMaps();
  ramps = [OCEAN, SHALLOW, LAND, DESERT, ICE, CLOUD, AIR].map(rampOf);
  spots.length = 0; rows.length = 0; cols.length = 0; lights.length = 0; rims.length = 0; thresholds.length = 0;
  const cs = Math.cos(tilt), sn = Math.sin(tilt);
  for (let iy = Math.max(0, Math.floor(cy - radius - 2)); iy < Math.min(H, Math.ceil(cy + radius + 2)); iy++) {
    for (let ix = Math.max(0, Math.floor(cx - radius - 2)); ix < Math.min(W, Math.ceil(cx + radius + 2)); ix++) {
      const dx = (ix + .5 - cx) / radius, dy = (iy + .5 - cy) / radius, nn = dx * dx + dy * dy;
      if (!inside(ix, iy)) continue;
      const i = iy * W + ix;
      if (nn > 1) {
        // The thin glow of the atmosphere just outside the limb, on the lit side only.
        if (nn < 1.075 && -.55 * dx - .6 * dy > .05 && hash(ix, iy) > (Math.sqrt(nn) - 1) * 13) { spots.push(i); rows.push(-1); cols.push(0); lights.push(3); rims.push(1); thresholds.push(0); }
        continue;
      }
      const nz = Math.sqrt(1 - nn);
      const l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1);
      // camera space, y up, then the planet's axial tilt about the view axis
      const vx = dx * cs + dy * sn, vy = -(-dx * sn + dy * cs), vz = nz;
      const lat = Math.asin(clamp(vy, -1, 1)), lon = Math.atan2(vx, vz) + Math.PI;
      spots.push(i); rows.push(clamp(Math.floor((lat + Math.PI / 2) / Math.PI * TH), 0, TH - 1));
      cols.push(lon / (Math.PI * 2) * TW);
      lights.push(clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4));
      rims.push(nn > .86 && l > .08 && hash(ix * 3, iy) < (nn - .86) * 6 ? 1 : 0);
      thresholds.push(bayerAt(ix, iy) * 255);
      zb[i] = -5e6; groundZ[i] = -5e6;
    }
  }
}

/** The planet's pixels for a given spin of the land and the clouds, in columns of the map. */
export function drawEarth(landSpin: number, cloudSpin: number): void {
  for (let k = 0; k < spots.length; k++) {
    const i = spots[k], li = lights[k];
    if (rows[k] < 0) { pix[i] = ramps[6][3]; continue; }
    const base = rows[k] * TW;
    const c1 = (Math.floor(cols[k] + landSpin) % TW + TW) % TW, c2 = (Math.floor(cols[k] + cloudSpin) % TW + TW) % TW;
    let color: u32;
    const dense = cloud[base + c2];
    if (dense > 175 || dense > 95 && dense - 95 > thresholds[k] * .31) color = ramps[5][Math.max(1, li)];
    else if (rims[k] === 1) color = ramps[6][Math.min(4, li + 1)];
    else color = li === 0 && land[base + c1] === 0 ? FLOOR_NIGHT : ramps[land[base + c1]][li];
    pix[i] = color;
  }
}
