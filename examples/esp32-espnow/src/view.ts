// The screen: this board's address, the counts, the last packets heard, the button that sends one now.
import { clear, rrect, text } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, COLOR_BACKGROUND, COLOR_BUTTON, COLOR_BUTTON_DOWN, COLOR_MUTED, COLOR_OK, COLOR_PANEL,
  COLOR_TEXT } from './constants';
import { state } from './state';

export function draw(buttonDown: boolean): void {
  clear(COLOR_BACKGROUND);
  text(16, 16, 'ESP-NOW', COLOR_TEXT, 3);
  text(16, 48, 'me ' + state.me, COLOR_MUTED, 1);
  text(16, 64, 'sent ' + state.sent + ', on air ' + state.delivered + ', heard ' + state.heard, COLOR_OK, 1);
  rrect(12, 84, 216, 166, 10, COLOR_PANEL, 255);
  if (state.lines.length === 0) {
    text(24, 100, 'No other board yet: start this', COLOR_MUTED, 1);
    text(24, 114, 'program on a second ESP32.', COLOR_MUTED, 1);
  }
  for (let i = 0; i < state.lines.length; i++) text(20, 96 + i * 18, state.lines[i].slice(0, 32), COLOR_TEXT, 1);
  rrect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, 10, buttonDown ? COLOR_BUTTON_DOWN : COLOR_BUTTON, 255);
  text(BUTTON_X + 52, BUTTON_Y + 14, 'HELLO', COLOR_TEXT, 2);
}
