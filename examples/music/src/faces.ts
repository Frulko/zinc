// The drawings of the home's other slides (main.ts): a watch face in the spirit of iOS StandBy and the Apple Watch, and activity rings.
// Strokes and polygons of zinc:gfx, nothing cached: a frame of either costs less than the player's.
import { stroke, rrect, rect, gradient, gradientPaint, imageFromBytes, destroyImage, drawImageRect, clip, unclip, font, fontAscent } from 'zinc:gfx';
import { ui, F, TEXT, TEXT3, centered } from './ui';

export const ORANGE = 0xff9f0a;
/** The rings' colours: Apple's Move, Exercise and Stand, then orange and purple. */
export const RINGS: u32[] = [0xfa114f, 0x92e82a, 0x1eeaef, 0xff9f0a, 0xbf5af2];
/** The StandBy time across the screen. */
export const HUGE = font('sans-bold', 250);

/** An arc from 12 o'clock, clockwise over `turn` (0..1) of the circle, `w` wide with round ends (a whole ring has none). */
export function arc(cx: number, cy: number, r: number, w: number, turn: number, color: u32, alpha: i32): void {
  if (turn <= 0) return;
  const t = Math.min(1, turn), n = Math.max(2, Math.ceil(t * 96)) as i32, pts: number[] = [];
  const whole = t >= 1;
  for (let i = 0; i < (whole ? n : n + 1); i++) {
    const a = ((i / n) * t - 0.25) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r); pts.push(cy + Math.sin(a) * r);
  }
  if (whole) { stroke(pts, w, color, alpha, true); return; }
  stroke(pts, w, color, alpha, false);
  rrect(pts[0] - w / 2, pts[1] - w / 2, w, w, w / 2, color, alpha);
  rrect(pts[n * 2] - w / 2, pts[n * 2 + 1] - w / 2, w, w, w / 2, color, alpha);
}

/** A hand at `turn` of the dial, from `back` behind the centre to `len`, round ended. */
function hand(cx: number, cy: number, turn: number, back: number, len: number, w: number, color: u32): void {
  const a = (turn - 0.25) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  const x0 = cx - c * back, y0 = cy - s * back, x1 = cx + c * len, y1 = cy + s * len;
  stroke([x0, y0, x1, y1], w, color, 255, false);
  rrect(x0 - w / 2, y0 - w / 2, w, w, w / 2, color, 255);
  rrect(x1 - w / 2, y1 - w / 2, w, w, w / 2, color, 255);
}

/** The watch face: minute ticks, hour numerals, the hour and minute hands of the Apple Watch (a thin stem, then the wide part) and an
 *  orange seconds hand. */
export function watchFace(cx: number, cy: number, r: number, h: number, m: number, s: number): void {
  rrect(cx - r, cy - r, r * 2, r * 2, r, 0x0e0e10, 255);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60 - 0.25) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), hour = i % 5 === 0;
    const r0 = r * (hour ? 0.87 : 0.92), r1 = r * 0.96;
    stroke([cx + c * r0, cy + sn * r0, cx + c * r1, cy + sn * r1], hour ? 5 : 2, hour ? TEXT : TEXT3, 255, false);
  }
  const f = F.title, asc = fontAscent(f);
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12 - 0.25) * Math.PI * 2;
    centered(f, cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74 - asc / 2 - 2, '' + k, TEXT);
  }
  const hs = ((h % 12) + m / 60) / 12, ms = (m + s / 60) / 60;
  hand(cx, cy, hs, 0, r * 0.12, 5, TEXT); hand(cx, cy, hs, -r * 0.12, r * 0.5, 13, TEXT);
  hand(cx, cy, ms, 0, r * 0.12, 5, TEXT); hand(cx, cy, ms, -r * 0.12, r * 0.84, 13, TEXT);
  rrect(cx - 9, cy - 9, 18, 18, 9, TEXT, 255);
  hand(cx, cy, s / 60, r * 0.16, r * 0.93, 3, ORANGE);
  rrect(cx - 6, cy - 6, 12, 12, 6, ORANGE, 255);
  rrect(cx - 2.5, cy - 2.5, 5, 5, 2.5, 0x000000, 255);
}

// ---------------------------------------------------------------- Lava lamp and the odometer (flip clocks)
const MID = font('sans-bold', 92);
const ODO = font('sans-bold', 170);
const nowS = (): number => performance.now() / 1000;

/** A lava lamp: seven blobs of the ring colours rise, sink and stretch in a warm glow. Each is an elliptical radial gradient with a dense
 *  core and a soft rim, so where two meet they melt into one (no offscreen picture: it came out pixelated). Only the lamp: the caller
 *  draws the time over it. Always moving: the caller keeps the frames coming (ui.animating). */
function lavaGradients(W: number, H: number): void {
  const t = nowS();
  clip(0, 0, W, H);
  gradient(0, 0, W, H, 0, 0x12050b, 0x3a0c18, true, 255);   // the bulb's glow, hotter at the foot
  const cols = [0xfa114f, 0xff9f0a, 0x7a3cff, 0xfa114f, 0x1eeaef, 0xff9f0a, 0x7a3cff];
  for (let i = 0; i < cols.length; i++) {
    const k = 0.5 + i * 0.37, ph = i * 2.1;
    const y = H * (0.5 + 0.4 * Math.sin(t * 0.16 * k + ph) * Math.cos(t * 0.07 + ph));   // a slow rise and fall
    const x = W * (0.12 + (i / (cols.length - 1)) * 0.76) + Math.sin(t * 0.11 * k + ph) * W * 0.06;
    const r = H * (0.19 + 0.04 * Math.sin(t * 0.2 + ph)), stretch = 1 + 0.4 * Math.abs(Math.cos(t * 0.16 * k + ph));   // longer while it moves
    // stretched = two round blobs pulled apart (a gradient does not follow a transform): their soft rims melt into one body
    const R = r * 1.5, gap = r * 0.5 * (stretch - 1) / 0.4;
    for (let k = 0; k < 2; k++) {
      const by = y + (k === 0 ? -gap : gap);
      gradientPaint(x - R, by - R, R * 2, R * 2, R, [2, R, R, 0, R, R, R, 3, 0, cols[i], 255, 0.5, cols[i], 150, 1, cols[i], 0], 255);
    }
  }
  unclip();
  ui.animating = true;
}

// ---- metaballs, the way a lava lamp really merges: a small field computed in Zinc (what a fragment shader would do), made into a picture
// that is stretched to the screen; the field is smooth, so linear sampling shows no pixels. (zinc:gl would be the GPU's way, but its
// WebGL module is not part of the webOS build: docs/reports/hardware/hp-touchpad-webos.md.)
const LAMP_W: i32 = 80, LAMP_H: i32 = 60, LAMP_N: i32 = 4;   // small and few: the tablet's CPU computes it every frame
/** The lamps' colours (a touch on the lamp changes them; main.ts keeps the choice): four blobs each, the first one also tints the glass. */
export const LAMPS: number[][][] = [
  [[200, 14, 63], [214, 120, 8], [96, 48, 204], [24, 170, 180]],    // lava
  [[190, 20, 20], [220, 90, 10], [230, 160, 20], [120, 10, 60]],    // magma
  [[10, 90, 200], [20, 170, 190], [90, 60, 200], [10, 40, 120]],    // ocean
  [[60, 200, 40], [190, 210, 20], [20, 150, 110], [10, 90, 60]],    // acid
  [[220, 60, 150], [240, 120, 90], [150, 60, 200], [90, 30, 120]],  // candy
];
export const LAMP_NAMES: string[] = ['Lave', 'Magma', 'Océan', 'Acide', 'Bonbon'];
let lampPal: i32 = 0;
export function lampPalette(): i32 { return lampPal; }
export function setLampPalette(i: i32): void { lampPal = i % LAMPS.length; }
const CRC: number[] = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); CRC.push(c >>> 0); }
function be32(o: u8[], v: number): void { o.push((v >>> 24) & 255); o.push((v >>> 16) & 255); o.push((v >>> 8) & 255); o.push(v & 255); }
/** A PNG chunk: length, type, data, CRC of type and data. */
function chunk(o: u8[], type: string, data: u8[]): void {
  be32(o, data.length);
  let c = 0xffffffff;
  const body: u8[] = [];
  for (let i = 0; i < 4; i++) body.push(type.charCodeAt(i) as u8);
  for (const d of data) body.push(d);
  for (const b of body) { c = CRC[(c ^ b) & 255] ^ (c >>> 8); o.push(b); }
  be32(o, (c ^ 0xffffffff) >>> 0);
}
/** An RGB PNG whose pixels are stored uncompressed (zlib stored block): the decoder is the engine's own, no encoder needed. */
function pngOf(rgb: u8[], w: i32, h: i32): u8[] {
  const raw: u8[] = [];
  let a1 = 1, a2 = 0;
  const z: u8[] = [0x78, 0x01];
  for (let y = 0; y < h; y++) { raw.push(0); for (let x = 0; x < w * 3; x++) raw.push(rgb[y * w * 3 + x]); }
  for (const b of raw) { a1 = (a1 + b) % 65521; a2 = (a2 + a1) % 65521; }
  z.push(1); z.push(raw.length & 255); z.push((raw.length >> 8) & 255); z.push(~raw.length & 255); z.push((~raw.length >> 8) & 255);
  for (const b of raw) z.push(b);
  be32(z, (a2 * 65536 + a1) >>> 0);
  const o: u8[] = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr: u8[] = [];
  be32(ihdr, w); be32(ihdr, h); ihdr.push(8); ihdr.push(2); ihdr.push(0); ihdr.push(0); ihdr.push(0);
  chunk(o, 'IHDR', ihdr); chunk(o, 'IDAT', z); chunk(o, 'IEND', []);
  return o;
}
const lampRgb: u8[] = [];
let lampPrev: i32 = -1;
/** A lava lamp behind the time: four metaballs of the ring colours that rise, stretch and melt into each other. Always moving: the caller
 *  keeps the frames coming (ui.animating). */
export function lava(W: number, H: number): void {
  const t = nowS() % 1200, asp = LAMP_W / LAMP_H, cols = LAMPS[lampPal];
  const cx: number[] = [], cy: number[] = [], r2: number[] = [], st: number[] = [];
  for (let i = 0; i < LAMP_N; i++) {
    const sp = 1 + 0.31 * i;
    cx.push(asp * (0.18 + 0.64 * i / (LAMP_N - 1)) + 0.07 * Math.sin(t * 0.17 + i * 1.9));
    cy.push(0.5 + 0.4 * Math.sin(t * 0.13 * sp + i * 2.1) * Math.cos(t * 0.05 + i));
    const r = 0.12 + 0.03 * Math.sin(t * 0.21 + i * 1.3);
    r2.push(r * r);
    st.push(0.8 + 0.25 * Math.sin(t * 0.13 * sp + i * 2.1 + 1));   // stretches while it moves
  }
  lampRgb.length = 0;
  for (let y = 0; y < LAMP_H; y++) {
    const v = 1 - y / (LAMP_H - 1);   // top row first; v = 0 at the bottom
    for (let x = 0; x < LAMP_W; x++) {
      const px = (x / LAMP_W) * asp;
      let field = 0, cr = 0, cg = 0, cb = 0;
      for (let i = 0; i < LAMP_N; i++) {
        const dx = px - cx[i], dy = (v - cy[i]) * st[i];
        const f = r2[i] / (dx * dx + dy * dy + 0.0008);
        field += f; cr += cols[i][0] * f; cg += cols[i][1] * f; cb += cols[i][2] * f;
      }
      const k = field > 0.0001 ? 1 / field : 0;
      cr *= k; cg *= k; cb *= k;
      const body = Math.min(1, Math.max(0, (field - 0.85) / 0.4)), glow = Math.min(1, Math.max(0, (field - 0.15) / 0.7));
      const bgk = 1 - v, br = cols[0][0] * (0.05 + bgk * 0.13), bgc = cols[0][1] * (0.05 + bgk * 0.13), bb = cols[0][2] * (0.05 + bgk * 0.13);
      const lit = 0.7 + 0.2 * Math.min(1, Math.max(0, (field - 1.2) / 1.8));
      const gr = body * body * (3 - 2 * body);   // smoothstep
      const rr = (br + cr * glow * 0.22) * (1 - gr) + cr * lit * gr;
      const gg = (bgc + cg * glow * 0.22) * (1 - gr) + cg * lit * gr;
      const bl = (bb + cb * glow * 0.22) * (1 - gr) + cb * lit * gr;
      lampRgb.push(Math.min(255, rr) as u8); lampRgb.push(Math.min(255, gg) as u8); lampRgb.push(Math.min(255, bl) as u8);
    }
  }
  const img = imageFromBytes(pngOf(lampRgb, LAMP_W, LAMP_H));
  if (img >= 0) {
    // the picture is small: four taps of it, half a texel apart and averaged (alphas 1, 1/2, 1/3, 1/4 stack to equal weights), melt the
    // grid that one bilinear stretch leaves visible
    const dx = W / LAMP_W * 0.5, dy = H / LAMP_H * 0.5;
    drawImageRect(img, 0, 0, LAMP_W, LAMP_H, -dx * 2, -dy * 2, W + dx * 4, H + dy * 4, 255, 0, 0, 0xffffff);
    drawImageRect(img, 0, 0, LAMP_W, LAMP_H, -dx, -dy, W + dx * 4, H + dy * 4, 128, 0, 0, 0xffffff);
    drawImageRect(img, 0, 0, LAMP_W, LAMP_H, -dx * 2, -dy, W + dx * 4, H + dy * 4, 85, 0, 0, 0xffffff);
    drawImageRect(img, 0, 0, LAMP_W, LAMP_H, -dx, -dy * 2, W + dx * 4, H + dy * 4, 64, 0, 0, 0xffffff);
  }
  if (lampPrev >= 0) destroyImage(lampPrev);   // drawing is recorded: the picture of this frame must outlive it
  lampPrev = img;
  ui.animating = true;
}

let odoPrev = '', odoCur = '', odoAt = 0;
const ROLL = 0.65;   // seconds a changed digit takes to roll
/** Four digit cards; a digit that changes rolls up out of its card and the next one rolls in (easing out), only for ROLL seconds each
 *  minute: the rest of the time nothing moves and no frame is asked for. */
export function odometer(cx: number, cy: number, h: number, m: number): void {
  const s = `${h < 10 ? '0' : ''}${h}${m < 10 ? '0' : ''}${m}`;
  if (s !== odoCur) { odoPrev = odoCur === '' ? s : odoCur; odoCur = s; odoAt = nowS(); }
  const p0 = (nowS() - odoAt) / ROLL, rolling = p0 < 1;
  const p = rolling ? 1 - Math.pow(1 - p0, 3) : 1;
  const cw = 170, ch = 250, gap = 18, colon = 56, total = cw * 4 + gap * 2 + colon + gap * 2;
  let x = cx - total / 2;
  const y = cy - ch / 2;
  for (let i = 0; i < 4; i++) {
    rrect(x, y, cw, ch, 22, 0x1b1e26, 255);
    clip(x, y, cw, ch, 22);
    const cur = odoCur.charAt(i), prev = odoPrev.charAt(i);
    if (rolling && prev !== cur) {
      centered(ODO, x + cw / 2, y + (ch - fontAscent(ODO)) / 2 - 20 - p * ch, prev, TEXT);
      centered(ODO, x + cw / 2, y + (ch - fontAscent(ODO)) / 2 - 20 + (1 - p) * ch, cur, TEXT);
    } else centered(ODO, x + cw / 2, y + (ch - fontAscent(ODO)) / 2 - 20, cur, TEXT);
    unclip();
    rect(x, cy - 1.5, cw, 3, 0x000000);   // the hinge of a flip clock
    x += cw + gap;
    if (i === 1) {
      rrect(x + colon / 2 - 6, cy - 36, 12, 12, 6, RINGS[0], 255); rrect(x + colon / 2 - 6, cy + 24, 12, 12, 6, RINGS[0], 255);
      x += colon + gap;
    }
  }
  if (rolling) ui.animating = true;
}
