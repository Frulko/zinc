// Tile label: a small white pill with a soft shadow (the zinc:ui/kit badge look), drawn over a video tile.
import { shadow, rrect, border, drawText, font, textWidth } from 'zinc:gfx';

// The build bakes the Tailwind text sizes named in the sources (gfx.font picks the nearest baked one): text-xs.
const LABEL_FONT = font('sans', 12);
const STRONG: u32 = 0x18181b;   // zinc-900
const MUTED: u32 = 0x71717a;    // zinc-500

/** Draws "title  detail" in a pill whose top-left corner is at (x, y). */
export function drawLabel(x: number, y: number, title: string, detail: string): void {
  const titleW = textWidth(LABEL_FONT, title, 0);
  const w = titleW + textWidth(LABEL_FONT, detail, 0) + 26, h = 22;
  shadow(x, y + 1, w, h, 11, 6, 0x000000, 70);
  rrect(x, y, w, h, 11, 0xffffff, 240);
  border(x, y, w, h, 11, 1, 0xe4e4e7, 255);
  drawText(LABEL_FONT, x + 10, y + 4, title, STRONG, 255, 0);
  drawText(LABEL_FONT, x + 16 + titleW, y + 4, detail, MUTED, 255, 0);
}
