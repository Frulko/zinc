// On-screen display: the idle and countdown screens (in the configured fgcolor), and the light overlays drawn over
// the video — title card, "Paused" pill and the info card — in the zinc:ui/kit look.
import { width, height, shadow, rrect, border, drawText, font, textWidth } from 'zinc:gfx';

// The build bakes the Tailwind text sizes named in the sources (gfx.font picks the nearest baked one):
// text-2xl for screen titles, text-base for screen subtitles, text-sm for overlay text, text-xs for labels.
const SCREEN_TITLE = font('sans-bold', 24);
const SCREEN_TEXT = font('sans', 16);
const BODY = font('sans', 14);
const BODY_BOLD = font('sans-bold', 14);
const LABEL = font('sans', 12);
const STRONG: u32 = 0x18181b;    // zinc-900
const MUTED: u32 = 0x71717a;     // zinc-500
const ACCENT: u32 = 0x4f46e5;    // indigo-600

/** White rounded card with a hairline border and a soft shadow. */
function card(x: number, y: number, w: number, h: number): void {
  shadow(x, y + 2, w, h, 10, 10, 0x000000, 70);
  rrect(x, y, w, h, 10, 0xffffff, 245);
  border(x, y, w, h, 10, 1, 0xe4e4e7, 255);
}

function centeredText(f: i32, y: number, s: string, color: u32, alpha: i32): void {
  drawText(f, Math.floor((width() - textWidth(f, s, 0)) / 2), y, s, color, alpha, 0);
}

/** Full-screen message on the background: a title and a dimmer line under it. */
export function drawScreen(title: string, subtitle: string, color: u32): void {
  const mid = height() / 2;
  centeredText(SCREEN_TITLE, mid - 30, title, color, 255);
  centeredText(SCREEN_TEXT, mid + 8, subtitle, color, 170);
}

/** Title of the current file, in a card at the bottom left. */
export function drawTitle(title: string): void {
  const w = textWidth(BODY_BOLD, title, 0) + 28;
  card(20, height() - 60, w, 38);
  drawText(BODY_BOLD, 34, height() - 49, title, STRONG, 255, 0);
}

/** Indigo "Paused" pill, top centre. */
export function drawPaused(): void {
  const w = textWidth(LABEL, 'Paused', 0) + 24;
  const x = Math.floor((width() - w) / 2);
  rrect(x, 20, w, 24, 12, ACCENT, 255);
  drawText(LABEL, x + 12, 25, 'Paused', 0xffffff, 255, 0);
}

export interface InfoRow { label: string; value: string }

/** Playback info card, top left: a heading and "label  value" rows. */
export function drawInfo(heading: string, rows: InfoRow[]): void {
  const labelW = 70;
  let w = textWidth(BODY_BOLD, heading, 0);
  for (const r of rows) w = Math.max(w, labelW + textWidth(BODY, r.value, 0));
  const h = 42 + rows.length * 20;
  card(12, 12, w + 32, h);
  drawText(BODY_BOLD, 28, 24, heading, STRONG, 255, 0);
  for (let i = 0; i < rows.length; i++) {
    const y = 48 + i * 20;
    drawText(LABEL, 28, y + 1, rows[i].label, MUTED, 255, 0);
    drawText(BODY, 28 + labelW, y, rows[i].value, STRONG, 255, 0);
  }
}
