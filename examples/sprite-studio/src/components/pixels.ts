// Drawing a frame with zinc:gfx at a scale, for the canvas grid and the thumbnails: one rect per run of a colour along a row.
import { rect, rrect } from 'zinc:gfx';
import { SPRITE_SIZE, TRANSPARENT, COLOR_CHECK_LIGHT, COLOR_CHECK_DARK } from '../constants';
import type { Sprite, Frame } from '../sprite';

/** The transparency checker under a sprite of `side` points, `cell` points a square. */
export function drawChecker(x: number, y: number, side: number, cell: number): void {
  rect(x, y, side, side, COLOR_CHECK_DARK);
  const n = Math.ceil(side / cell) as i32;
  for (let j: i32 = 0; j < n; j++) for (let i: i32 = (j & 1); i < n; i += 2)
    rect(x + i * cell, y + j * cell, Math.min(cell, side - i * cell), Math.min(cell, side - j * cell), COLOR_CHECK_LIGHT);
}

/** The pixels of `f` at x,y, `scale` points a pixel; with alpha < 255 every pixel takes `tint` (the onion skin). */
export function drawPixels(s: Sprite, f: Frame, x: number, y: number, scale: number, alpha: i32, tint: u32): void {
  const px = f.pixels;
  for (let row: i32 = 0; row < SPRITE_SIZE; row++) {
    let col: i32 = 0;
    while (col < SPRITE_SIZE) {
      const index = px[row * SPRITE_SIZE + col];
      let end = col + 1;
      while (end < SPRITE_SIZE && px[row * SPRITE_SIZE + end] === index) end++;
      if (index !== TRANSPARENT) {
        if (alpha >= 255) rect(x + col * scale, y + row * scale, (end - col) * scale, scale, s.palette[index] as u32);
        else rrect(x + col * scale, y + row * scale, (end - col) * scale, scale, 0, tint, alpha);
      }
      col = end;
    }
  }
}
