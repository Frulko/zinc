// Dice faces on an 8x8 matrix: pips are 2x2 blocks on a 3x3 grid at columns/rows 0, 3 and 6.
import { rect } from 'zinc:gfx';

// pips per face as 3x3 grid cells, "col,row" pairs (0..2); index = face value - 1
const PIPS: string[] = ['11', '0022', '001122', '00200222', '0020110222', '002001210222'];
const COLORS: u32[] = [0xff3030, 0xff9a20, 0xffe030, 0x30e050, 0x30a0ff, 0xb050ff];

/** Colour of a face (1..6). */
export function faceColor(value: i32): u32 { return COLORS[value - 1]; }

/** Draws face `value` (1..6) with its top-left corner at (x, y). */
export function drawFace(value: i32, x: number, y: number, color: u32): void {
  const p = PIPS[value - 1];
  for (let i: i32 = 0; i < p.length; i += 2) {
    const col = p.charCodeAt(i) - 48, row = p.charCodeAt(i + 1) - 48;
    rect(x + col * 3, y + row * 3, 2, 2, color);
  }
}

/** Scales a colour's brightness (k in 0..1). */
export function dim(c: u32, k: number): u32 {
  const r = Math.floor(((c >> 16) & 255) * k), g = Math.floor(((c >> 8) & 255) * k), b = Math.floor((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}
