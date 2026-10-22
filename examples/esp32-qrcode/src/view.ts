// The screen: the code on white, what it holds, the button.
import { clear, rect, rrect, text } from 'zinc:gfx';
import { AREA_SIZE, AREA_X, AREA_Y, BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, COLOR_BACKGROUND, COLOR_BUTTON, COLOR_BUTTON_DOWN, COLOR_DARK,
  COLOR_LIGHT, COLOR_MUTED, COLOR_TEXT, LABELS } from './constants';
import { state } from './state';

export function draw(buttonDown: boolean): void {
  clear(COLOR_BACKGROUND);
  text(16, 16, 'QR code', COLOR_TEXT, 3);
  const qr = state.code;
  const scale = Math.floor(AREA_SIZE / (qr.size + 8));   // 4 modules of quiet zone on each side
  const side = scale * (qr.size + 8);
  const x0 = AREA_X + Math.floor((AREA_SIZE - side) / 2), y0 = AREA_Y + Math.floor((AREA_SIZE - side) / 2);
  rect(x0, y0, side, side, COLOR_LIGHT);
  for (let y: i32 = 0; y < qr.size; y++) {   // one rectangle per dark run: about 10 per row, not one per module
    const runs = qr.runs(y);
    for (let i = 0; i < runs.length; i += 2) rect(x0 + scale * (4 + runs[i]), y0 + scale * (4 + y), scale * runs[i + 1], scale, COLOR_DARK);
  }
  text(20, 258, LABELS[state.index] + ', ' + qr.size + ' x ' + qr.size + ', ' + state.encodeMs.toFixed(1) + ' ms', COLOR_MUTED, 1);
  rrect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, 10, buttonDown ? COLOR_BUTTON_DOWN : COLOR_BUTTON, 255);
  text(BUTTON_X + 72, BUTTON_Y + 14, 'NEXT', COLOR_TEXT, 2);
}
