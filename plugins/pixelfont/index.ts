// zinc:pixelfont — crisp bitmap fonts for LED matrices and tiny screens (5x7 and 3x5, ASCII).
// Glyphs are column-major bytes (bit 0 = top row); drawing emits one gfx.rect per vertical run of lit pixels, so a
// scrolling line on a 32x8 matrix costs a few dozen draw commands. Proportional spacing: empty columns are trimmed.
import { rect } from 'zinc:gfx';

export const FONT_5X7: i32 = 0;
export const FONT_3X5: i32 = 1;

// 0x20..0x7E, 5 columns each (classic HD44780-style 5x7)
const F5 =
  '000000000000005f00000007000700147f147f14242a7f2a12231308646236495522500005030000001c2241000041221c00' +
  '082a1c2a0808083e080800503000000808080808006060000020100804023e5149453e00427f400042615149462141454b31' +
  '1814127f1027454545393c4a49493001710905033649494936064949291e0036360000005636000008142241001414141414' +
  '00412214080201510906324979413e7e1111117e7f494949363e414141227f4141221c7f494949417f090901013e41415132' +
  '7f0808087f00417f41002040413f017f081422417f404040407f0204027f7f0408107f3e4141413e7f090909063e4151215e' +
  '7f09192946464949493101017f01013f4040403f1f2040201f7f2018207f631408146303047804036151494543007f414100' +
  '02040810200041417f0004020102044040404040000102040020545454787f484444383844444420384444487f3854545418' +
  '087e090102085454543c7f0804047800447d40002040443d007f1028440000417f40007c041804787c080404783844444438' +
  '7c14141408081414187c7c080404084854545420043f4440203c4040207c1c2040201c3c4030403c44281028440c5050503c' +
  '4464544c44000836410000007f000000413608000804081008';
// 0x20..0x5F, 3 columns each; lowercase is drawn as uppercase
const F3 =
  '0000000017000300031f0a1f121f091904130a151a000300000e11110e00050205040e041008000404040010001804031f111f121f10' +
  '1d151715151f07041f17151d1f151d01011f1f151f17151f000a00100a00040a110a0a0a110a040115030e15161e051e1f150a0e1111' +
  '1f110e1f15111f05010e111d1f041f111f1108100f1f041b1f10101f061f1f0e1f0e110e1f05020e191e1f051a121509011f011f101f' +
  '0f100f1f0c1f1b041b031c031915131f110003041800111f020102101010';

/** Byte offset of a glyph in its table, -1 for characters the font does not have (drawn as '?'). */
function glyph(font: i32, c: i32): i32 {
  if (font === FONT_3X5) {
    if (c >= 97 && c <= 122) c -= 32;
    return c >= 32 && c <= 95 ? (c - 32) * 3 : (63 - 32) * 3;
  }
  return c >= 32 && c <= 126 ? (c - 32) * 5 : (63 - 32) * 5;
}
function cols(font: i32): i32 { return font === FONT_3X5 ? 3 : 5; }
function hex(c: i32): i32 { return c <= 57 ? c - 48 : c - 87; }
// tables are hex strings (two characters per column byte): large array literals do not suit the C++ backend
function col(font: i32, g: i32, i: i32): i32 {
  const t = font === FONT_3X5 ? F3 : F5, k = (g + i) * 2;
  return hex(t.charCodeAt(k)) * 16 + hex(t.charCodeAt(k + 1));
}

/** Glyph height in pixels (7 or 5). */
export function fontHeight(font: i32): i32 { return font === FONT_3X5 ? 5 : 7; }

/** Advance of one character: trimmed glyph width plus one column of spacing (space is 3 / 2 columns). */
function advance(font: i32, c: i32): i32 {
  if (c === 32) return font === FONT_3X5 ? 2 : 3;
  const g = glyph(font, c), n = cols(font);
  let first: i32 = n, last: i32 = -1;
  for (let i: i32 = 0; i < n; i++) if (col(font, g, i) !== 0) { if (last < 0) first = i; last = i; }
  return last < 0 ? n + 1 : last - first + 2;
}

/** Width in pixels of `s` (including the trailing spacing column). */
export function textWidth(s: string, font: i32): i32 {
  let w: i32 = 0;
  for (let k: i32 = 0; k < s.length; k++) w += advance(font, s.charCodeAt(k));
  return w;
}

/** Draws `s` with its top-left corner at (x, y); characters left of `clipX0` or right of `clipX1` are skipped. */
export function drawText(x: number, y: number, s: string, color: u32, font: i32, clipX0: number, clipX1: number): void {
  const n = cols(font), h = fontHeight(font);
  let cx = Math.floor(x);
  const top = Math.floor(y);
  for (let k: i32 = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    const adv = advance(font, c);
    if (c !== 32 && cx + adv > clipX0 && cx < clipX1) {
      const g = glyph(font, c);
      let skip: i32 = 0;
      while (skip < n && col(font, g, skip) === 0) skip++;
      for (let i: i32 = skip; i < n; i++) {
        const bits = col(font, g, i);
        let r: i32 = 0;
        while (r < h) {  // one rect per vertical run
          if (((bits >> r) & 1) === 0) { r++; continue; }
          let e = r;
          while (e < h && ((bits >> e) & 1) !== 0) e++;
          rect(cx + i - skip, top + r, 1, e - r, color);
          r = e;
        }
      }
    }
    cx += adv;
  }
}
