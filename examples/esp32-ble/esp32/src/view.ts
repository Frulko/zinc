// The screen: the name the board advertises, the link, the conversation and the button that sends a message.
import { clear, rrect, text } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, COLOR_BACKGROUND, COLOR_BUTTON, COLOR_BUTTON_DOWN, COLOR_ME, COLOR_MUTED, COLOR_OK, COLOR_PANEL,
  COLOR_TEXT, COLOR_WAIT } from './constants';
import { state } from './state';

export function draw(buttonDown: boolean): void {
  clear(COLOR_BACKGROUND);
  text(16, 14, 'BLE', COLOR_TEXT, 3);
  text(80, 22, state.name, COLOR_MUTED, 1);
  const on = state.link !== null;
  rrect(16, 46, 208, 24, 8, on ? COLOR_OK : COLOR_WAIT, 255);
  text(26, 54, on ? 'linked to ' + state.peer : 'advertising: open the Mac app', COLOR_BACKGROUND, 1);
  rrect(12, 78, 216, 182, 10, COLOR_PANEL, 255);
  for (let i = 0; i < state.lines.length; i++) {
    const l = state.lines[i];
    text(20, 88 + i * 19, (l.mine ? '> ' : '< ') + l.text.slice(0, 30), l.mine ? COLOR_ME : COLOR_TEXT, 1);
  }
  rrect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, 10, buttonDown ? COLOR_BUTTON_DOWN : on ? COLOR_BUTTON : COLOR_PANEL, 255);
  text(BUTTON_X + 40, BUTTON_Y + 16, on ? 'SEND "PRESS ' + (state.presses + 1) + '"' : 'NOT LINKED', on ? COLOR_TEXT : COLOR_MUTED, 1);
}
