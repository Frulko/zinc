// A panel: the description of a point of interest on a card of paper with an accent edge, and, when the point leads to a sequence, a
// button to it. The object viewer and the panorama open the same one.
import { rrect, drawText, textWidth } from 'zinc:gfx';
import { Colours } from './project';
import { sans, bold, wrap, leading, reading } from './type';

/** Draws the panel, its top-left corner at (px, py) pixels, `pw` pixels wide, at `k` pixels per unit. `button` is what its button says
 *  ('' for none). Returns the box of the button in pixels, [x, y, w, h], or [] without one. */
export function drawPanel(px: number, py: number, pw: number, k: number, title: string, text: string, button: string, c: Colours): number[] {
  const pad = 22 * k, head = bold(22 * k), body = sans(17 * k), s = reading();
  const lines = wrap(body, text, pw - 2 * pad, 0), titles = wrap(head, title, pw - 2 * pad, Math.round(2 * s));
  // what the button says, on two lines when the text is larger than designed
  const label = wrap(body, button, pw - 2 * pad - 60 * k, s > 1 ? 2 : 1), bh = button.length > 0 ? 50 * k * s + (label.length - 1) * leading(body) : 0;
  const ph = 2 * pad + titles.length * leading(head) + 8 * k + lines.length * leading(body) + (bh > 0 ? bh + 16 * k : 0);
  rrect(px, py, pw, ph, 4 * k, c.paper, 255);
  rrect(px, py, 5 * k, ph, 2 * k, c.accent, 255);
  let ty = py + pad;
  for (const line of titles) { drawText(head, px + pad, ty, line, c.ink, 255, 0); ty += leading(head); }
  ty += 8 * k;
  for (const line of lines) { drawText(body, px + pad, ty, line, c.ink, 255, 0); ty += leading(body); }
  if (bh === 0) return [];
  const bx = px + pad, by = ty + 16 * k, bw = pw - 2 * pad;
  rrect(bx, by, bw, bh, Math.min(bh / 2, 25 * k * s), c.accent, 255);
  for (let i = 0; i < label.length; i++) drawText(body, bx + 22 * k, by + (bh - label.length * leading(body)) / 2 + i * leading(body) + k, label[i], c.ink, 255, 0);
  // an arrow at the right end: the button leads somewhere
  drawText(body, bx + bw - 22 * k - textWidth(body, '→', 0), by + (bh - leading(body)) / 2 + k, '→', c.ink, 255, 0);
  return [bx, by, bw, bh];
}
