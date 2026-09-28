// Status card over the mapped output, in the light zinc:ui/kit look. On display-gl the zinc:gfx frame is an overlay:
// black is the key colour (the GPU layers show through), so only the card covers them.
import { height, shadow, rrect, border, drawText, font, textWidth } from 'zinc:gfx';

// The build bakes the Tailwind text sizes named in the sources (gfx.font picks the nearest baked one):
// text-sm for the title and values, text-xs for labels.
const TITLE = font('sans-bold', 14);
const VALUE = font('sans-bold', 14);
const LABEL = font('sans', 12);
const STRONG: u32 = 0x18181b;    // zinc-900
const MUTED: u32 = 0x71717a;     // zinc-500
const ACCENT: u32 = 0x4f46e5;    // indigo-600

export interface HudStat { label: string; value: string }

/** Card at the bottom left: a title with an accent dot, stats side by side, a key hint. */
export function drawHud(stats: HudStat[], hint: string): void {
  const pad = 16, gap = 24, h = 72;
  let w = pad * 2 + gap * (stats.length - 1);
  for (const s of stats) w += Math.max(textWidth(LABEL, s.label, 0), textWidth(VALUE, s.value, 0));
  w = Math.max(w, pad * 2 + textWidth(TITLE, 'Mapper', 0) + 20 + textWidth(LABEL, hint, 0));
  const x = 16, y = height() - h - 16;
  shadow(x, y + 2, w, h, 12, 12, 0x000000, 80);
  rrect(x, y, w, h, 12, 0xffffff, 245);
  border(x, y, w, h, 12, 1, 0xe4e4e7, 255);

  rrect(x + pad, y + 15, 8, 8, 4, ACCENT, 255);
  drawText(TITLE, x + pad + 14, y + 10, 'Mapper', STRONG, 255, 0);
  drawText(LABEL, x + w - pad - textWidth(LABEL, hint, 0), y + 12, hint, MUTED, 255, 0);
  let cx = x + pad;
  for (const s of stats) {
    drawText(LABEL, cx, y + 34, s.label, MUTED, 255, 0);
    drawText(VALUE, cx, y + 49, s.value, STRONG, 255, 0);
    cx += Math.max(textWidth(LABEL, s.label, 0), textWidth(VALUE, s.value, 0)) + gap;
  }
}
