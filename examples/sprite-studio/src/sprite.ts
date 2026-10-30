// The sprite and the pure operations on it: no state, no drawing. Plain data, so it crosses a worker port as it is.
import { SPRITE_SIZE, TRANSPARENT } from './constants';

/** One frame of the animation: SPRITE_SIZE * SPRITE_SIZE palette indices, row by row. */
export interface Frame { pixels: i32[] }
/** The whole document: an indexed sprite (editing a palette colour recolours every frame, as in Aseprite's indexed mode). */
export interface Sprite { size: i32; palette: i32[]; frames: Frame[] }

export function blankFrame(): Frame {
  const p: i32[] = [];
  for (let i: i32 = 0; i < SPRITE_SIZE * SPRITE_SIZE; i++) p.push(TRANSPARENT);
  return { pixels: p };
}
export function copyFrame(f: Frame): Frame { return { pixels: f.pixels.slice() }; }
export function copySprite(s: Sprite): Sprite {
  const frames: Frame[] = [];
  for (const f of s.frames) frames.push(copyFrame(f));
  return { size: s.size, palette: s.palette.slice(), frames: frames };
}

function inside(x: i32, y: i32): boolean { return x >= 0 && y >= 0 && x < SPRITE_SIZE && y < SPRITE_SIZE; }
export function pixelAt(f: Frame, x: i32, y: i32): i32 { return inside(x, y) ? f.pixels[y * SPRITE_SIZE + x] : TRANSPARENT; }

/** A square brush of `brush` pixels whose top-left is at x,y (the brush grows right and down, as Aseprite's square brush does). */
export function stamp(f: Frame, x: i32, y: i32, brush: i32, index: i32): boolean {
  let changed = false;
  for (let dy: i32 = 0; dy < brush; dy++)
    for (let dx: i32 = 0; dx < brush; dx++) {
      const px = x + dx, py = y + dy;
      if (!inside(px, py) || f.pixels[py * SPRITE_SIZE + px] === index) continue;
      f.pixels[py * SPRITE_SIZE + px] = index;
      changed = true;
    }
  return changed;
}

/** Stamps every pixel of the line from x0,y0 to x1,y1 (Bresenham), so a fast stroke leaves no gaps. */
export function strokeLine(f: Frame, x0: i32, y0: i32, x1: i32, y1: i32, brush: i32, index: i32): boolean {
  const dx = Math.abs(x1 - x0) as i32, dy = -(Math.abs(y1 - y0) as i32);
  const sx: i32 = x0 < x1 ? 1 : -1, sy: i32 = y0 < y1 ? 1 : -1;
  let err: i32 = dx + dy, x = x0, y = y0, changed = false;
  for (;;) {
    if (stamp(f, x, y, brush, index)) changed = true;
    if (x === x1 && y === y1) break;
    const e2: i32 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return changed;
}

/** Fills the 4-connected area of the colour under x,y with `index`. */
export function floodFill(f: Frame, x: i32, y: i32, index: i32): boolean {
  if (!inside(x, y)) return false;
  const from = f.pixels[y * SPRITE_SIZE + x];
  if (from === index) return false;
  const todo: i32[] = [y * SPRITE_SIZE + x];
  while (todo.length > 0) {
    const at = todo.pop() as i32;
    if (f.pixels[at] !== from) continue;
    f.pixels[at] = index;
    const px = at % SPRITE_SIZE, py = (at - px) / SPRITE_SIZE;
    if (px > 0) todo.push(at - 1);
    if (px < SPRITE_SIZE - 1) todo.push(at + 1);
    if (py > 0) todo.push(at - SPRITE_SIZE);
    if (py < SPRITE_SIZE - 1) todo.push(at + SPRITE_SIZE);
  }
  return true;
}

/** The sprite as the JSON the studio saves: palette as #rrggbb strings, each frame as rows of hex digits (one digit per pixel). */
export function spriteToJson(s: Sprite): string {
  const palette: string[] = [], frames: string[] = [];
  for (const c of s.palette) palette.push('"' + hexColor(c) + '"');
  for (const f of s.frames) {
    const rows: string[] = [];
    for (let y: i32 = 0; y < SPRITE_SIZE; y++) {
      let row = '';
      for (let x: i32 = 0; x < SPRITE_SIZE; x++) row += f.pixels[y * SPRITE_SIZE + x].toString(16);
      rows.push('    "' + row + '"');
    }
    frames.push('[\n' + rows.join(',\n') + '\n  ]');
  }
  return '{\n"size": ' + s.size + ',\n"palette": [' + palette.join(', ') + '],\n"frames": [\n  ' + frames.join(',\n  ') + '\n]\n}\n';
}

/** The sprite of a saved file, or null when the text is not one. */
export function spriteFromJson(text: string): Sprite | null {
  const v = JSON.parse(text);
  if (v === null || v.size !== SPRITE_SIZE || !Array.isArray(v.palette) || !Array.isArray(v.frames) || v.frames.length === 0) return null;
  const palette: i32[] = [];
  for (const c of v.palette) { const k = parseColor(c as string); if (k < 0) return null; palette.push(k); }
  const frames: Frame[] = [];
  for (const rows of v.frames) frames.push(frameFromRows(rows as string[]));
  return { size: SPRITE_SIZE, palette: palette, frames: frames };
}

/** A frame from SPRITE_SIZE rows of hex digits; a short row or a missing one is transparent. */
export function frameFromRows(rows: string[]): Frame {
  const f = blankFrame();
  for (let y: i32 = 0; y < SPRITE_SIZE && y < rows.length; y++)
    for (let x: i32 = 0; x < SPRITE_SIZE && x < rows[y].length; x++) {
      const d = parseInt(rows[y].charAt(x), 16);
      f.pixels[y * SPRITE_SIZE + x] = isNaN(d) ? TRANSPARENT : d as i32;
    }
  return f;
}

export function hexColor(c: i32): string { return '#' + (c & 0xffffff).toString(16).padStart(6, '0'); }
/** '#rrggbb' or 'rrggbb' to a colour; -1 when it is not one. */
export function parseColor(s: string): i32 {
  const t = s.startsWith('#') ? s.slice(1) : s;
  if (t.length !== 6) return -1;
  const v = parseInt(t, 16);
  return isNaN(v) ? -1 : v as i32;
}
