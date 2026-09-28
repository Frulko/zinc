// Status card drawn over the video, in the light zinc:ui/kit look: a white rounded card with a hairline border and a
// soft shadow, small grey labels above bold values, an indigo pill while paused.
import { shadow, rrect, border, drawText, font, textWidth } from 'zinc:gfx';

// The build bakes the Tailwind text sizes named in the sources (gfx.font picks the nearest baked size), so naming
// them here bakes the HUD's: text-xs (12 px labels) and text-sm (14 px values).
const LABEL_FONT = font('sans', 12);
const VALUE_FONT = font('sans-bold', 14);
const MUTED: u32 = 0x71717a;     // zinc-500
const STRONG: u32 = 0x18181b;    // zinc-900
const ACCENT: u32 = 0x4f46e5;    // indigo-600
const PAD = 14, GAP = 22, HEIGHT = 54;

export interface Stat { label: string; value: string }

/** White card with a border and a shadow. */
function card(x: number, y: number, w: number, h: number): void {
  shadow(x, y + 2, w, h, 10, 8, 0x000000, 60);
  rrect(x, y, w, h, 10, 0xffffff, 245);
  border(x, y, w, h, 10, 1, 0xe4e4e7, 255);
}

/** Width of one stat column: its widest line. */
function columnWidth(s: Stat): number {
  return Math.max(textWidth(LABEL_FONT, s.label, 0), textWidth(VALUE_FONT, s.value, 0));
}

/** Draws the stats side by side in a card whose bottom-left corner is at (x, bottom). */
export function drawHud(stats: Stat[], paused: boolean, x: number, bottom: number): void {
  let w = PAD * 2 + GAP * (stats.length - 1);
  for (const s of stats) w += columnWidth(s);
  const y = bottom - HEIGHT;
  card(x, y, w, HEIGHT);
  let cx = x + PAD;
  for (const s of stats) {
    drawText(LABEL_FONT, cx, y + 10, s.label, MUTED, 255, 0);
    drawText(VALUE_FONT, cx, y + 29, s.value, STRONG, 255, 0);
    cx += columnWidth(s) + GAP;
  }
  if (paused) {
    const pw = textWidth(LABEL_FONT, 'Paused', 0) + 16;
    rrect(x + w + 8, y + 17, pw, 20, 10, ACCENT, 255);
    drawText(LABEL_FONT, x + w + 16, y + 20, 'Paused', 0xffffff, 255, 0);
  }
}
