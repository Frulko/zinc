// A button of the table: a pill with its label, or the ring of a hotspot with its label beside it. Buttons live in the visitor's frame
// (frame.ts) and grow with the text size the visitor reads at (type.ts).
import { rrect, border, polygon, drawText, textWidth } from 'zinc:gfx';
import { Link, Colours } from './project';
import { Frame } from './frame';
import { sans, bold, leading, reading, faint } from './type';

/** Something a touch presses, in the visitor's frame: a link of the sequence, or a control of the player or of a view (`act`). */
export class Button {
  x = 0;
  y = 0;
  w = 0;
  h = 56;
  label = '';
  link: Link | null = null;
  act = '';
  /** A hotspot on a model or a panorama: a ring instead of a pill, the label beside it. */
  ring = false;
  /** A triangle before the label: the button plays something. */
  play = false;
  /** One of the buttons of a view, which are a size under the others. */
  small = false;
  /** The finger pressing it (0: none). */
  finger: i32 = 0;
  /** A box at least 150 by 76 units takes the touch (75 mm on a 43-inch table), whatever is drawn. */
  takes(px: number, py: number): boolean { return Math.abs(px - this.x) <= Math.max(this.w, 150) / 2 && Math.abs(py - this.y) <= Math.max(this.h, 76) / 2; }

  /** Gives the pill the size of its label at the text size being read: `label`, `play` and `small` are set. */
  fit(): void {
    const s = reading();
    this.h = (this.small ? 52 : 56) * s;
    this.w = textWidth(sans(this.small ? 18 : 20), this.label, 0) + (this.small ? 52 : 64) + (this.play ? 26 : 0);
  }
}

/** The width of buttons set side by side, `gap` apart. */
export function rowWidth(row: Button[], gap: number): number {
  let w = 0;
  for (let i = 0; i < row.length; i++) w += (i > 0 ? gap : 0) + row[i].w;
  return w;
}

/** Sets `row` in lines of at most `wide` units, `gap` apart: the first line at height `y`, the next ones above it. `x` is the left end
 *  of the lines, or with `centred` their middle. Returns the top of the highest line (`y` for no button). */
export function setInRows(row: Button[], x: number, y: number, wide: number, gap: number, centred: boolean): number {
  let from = 0, top = y;
  while (from < row.length) {
    let to = from + 1;
    while (to < row.length && rowWidth(row.slice(from, to + 1), gap) <= wide) to++;
    let at = centred ? x - rowWidth(row.slice(from, to), gap) / 2 : x;
    for (let i = from; i < to; i++) { row[i].x = at + row[i].w / 2; row[i].y = y; at += row[i].w + gap; }
    top = y - row[from].h / 2;
    y -= row[from].h + 16;
    from = to;
  }
  return top;
}

/** Whether two pills lie on each other, or closer than `margin`. */
export function touching(a: Button, b: Button, margin: number): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + margin;
}

/** A button in the visitor's frame (which is on). */
export function drawButton(b: Button, F: Frame, k: number, c: Colours): void {
  const held = b.finger !== 0;
  if (b.ring) {
    const x = F.ox + b.x * k, y = F.oy + b.y * k, r = 15 * k, f = bold(15 * k), lw = textWidth(f, b.label, 0) + 24 * k, lh = 30 * k * reading();
    rrect(x + r + 8 * k, y - lh / 2, lw, lh, lh / 2, c.background, faint(215));
    drawText(f, x + r + 20 * k, y - leading(f) / 2 + k, b.label, c.text, 255, 0);
    rrect(x - r, y - r, 2 * r, 2 * r, r, held ? c.accent : c.background, held ? 255 : 150);
    border(x - r, y - r, 2 * r, 2 * r, r, Math.max(1.5, 2.5 * k), c.accent, 255);
    rrect(x - 5 * k, y - 5 * k, 10 * k, 10 * k, 5 * k, held ? c.background : c.accent, 255);
    return;
  }
  const f = sans((b.small ? 18 : 20) * k), x = F.ox + (b.x - b.w / 2) * k, top = F.oy + (b.y - b.h / 2) * k, w = b.w * k, h = b.h * k;
  rrect(x, top, w, h, h / 2, held ? c.accent : c.background, held ? 255 : faint(235));
  border(x, top, w, h, h / 2, Math.max(1, 1.5 * k), c.accent, 255);
  const lead = b.play ? 26 * k : 0, tx = x + (w - textWidth(f, b.label, 0) - lead) / 2;
  if (b.play) polygon([tx, top + h / 2 - 9 * k, tx + 15 * k, top + h / 2, tx, top + h / 2 + 9 * k], held ? c.background : c.accent, 255);
  drawText(f, tx + lead, top + (h - leading(f)) / 2 + k, b.label, held ? c.background : c.text, 255, 0);
}
