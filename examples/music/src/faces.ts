// The drawings of the home's other slides (main.ts): a watch face in the spirit of iOS StandBy and the Apple Watch, and activity rings.
// Strokes and polygons of zinc:gfx, nothing cached: a frame of either costs less than the player's.
import { stroke, rrect, rect, gradientPaint, clip, unclip, font, fontAscent } from 'zinc:gfx';
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

// ---------------------------------------------------------------- Aurora and the odometer (flip clocks)
const MID = font('sans-bold', 92);
const ODO = font('sans-bold', 170);
const nowS = (): number => performance.now() / 1000;

/** Aurora (the soft colour fields of Apple's wallpapers and watch faces): four large radial blobs of the ring colours drifting on slow
 *  paths over black, overlapping where they meet. Only the field: the caller draws the time over it. Always moving: the caller keeps the
 *  frames coming (ui.animating). */
export function aurora(W: number, H: number): void {
  const t = nowS();
  clip(0, 0, W, H);
  const cols = [0xfa114f, 0x7a3cff, 0x1eeaef, 0xff9f0a];
  for (let i = 0; i < 4; i++) {
    const R = Math.min(W, H) * (0.46 + 0.06 * Math.sin(t * 0.3 + i * 1.3));
    const x = W / 2 + Math.sin(t * (0.11 + i * 0.023) + i * 1.9) * W * 0.3;
    const y = H / 2 + Math.cos(t * (0.09 + i * 0.019) + i * 2.3) * H * 0.24;
    gradientPaint(x - R, y - R, R * 2, R * 2, R, [2, R, R, 0, R, R, R, 4, 0, cols[i], 200, 0.35, cols[i], 120, 0.7, cols[i], 34, 1, cols[i], 0], 255);
  }
  unclip();
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
