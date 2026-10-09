// Bottom soft-key strip: five 48 px slots on a 52 px pitch, chamfered top corners, outer slots flush.
import { rect } from 'zinc:gfx';
import { W, H, BTN_W, BTN_GAP, BTN_H, BLACK, WHITE, DISABLED_FG } from './theme';
import { TITLE, text, textCentre } from './panel';

function button(slot: i32, label: string, pressed: boolean): void {
  const x = slot * (BTN_W + BTN_GAP), y = H - BTN_H;
  const fl = slot === 0, fr = slot === 4;
  const ground: u32 = pressed ? BLACK : WHITE;
  const ink: u32 = pressed ? WHITE : BLACK;
  const l = (n: i32): i32 => (fl ? 0 : n), r = (n: i32): i32 => (fr ? 0 : n);
  rect(x + l(3), y, BTN_W - l(3) - r(3), 1, ground);
  rect(x + l(2), y + 1, BTN_W - l(2) - r(2), 1, ground);
  rect(x + l(1), y + 2, BTN_W - l(1) - r(1), 1, ground);
  rect(x, y + 3, BTN_W, BTN_H - 3, ground);
  rect(x + l(3), y, BTN_W - l(3) - r(3), 1, BLACK);
  if (!fl) { rect(x + 2, y + 1, 1, 1, BLACK); rect(x + 1, y + 2, 1, 1, BLACK); rect(x, y + 3, 1, BTN_H - 3, BLACK); }
  if (!fr) { rect(x + BTN_W - 3, y + 1, 1, 1, BLACK); rect(x + BTN_W - 2, y + 2, 1, 1, BLACK); rect(x + BTN_W - 1, y + 3, 1, BTN_H - 3, BLACK); }
  textCentre(TITLE, x, BTN_W, y + 2, label, ink);
}

/** One label per physical key (esc, view, power, edit, run); '' draws no button. */
export function drawSoftBar(labels: string[], pressed: i32): void {
  for (let i = 0; i < labels.length; i++) if (labels[i] !== '') button(i, labels[i], i === pressed);
}
