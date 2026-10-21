// The screen: the LED, what the pins read and the on-screen button.
import { clear, rrect, text } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, BUTTON_PIN, COLOR_BACKGROUND, COLOR_BUTTON, COLOR_BUTTON_DOWN, COLOR_LED_OFF, COLOR_LED_ON,
  COLOR_MUTED, COLOR_PANEL, COLOR_TEXT, LED_PIN } from './constants';
import { state } from './state';

export function draw(buttonDown: boolean): void {
  clear(COLOR_BACKGROUND);
  text(16, 16, 'GPIO', COLOR_TEXT, 3);
  text(16, 48, 'LED on GPIO ' + LED_PIN + ', button on ' + BUTTON_PIN, COLOR_MUTED, 1);
  rrect(20, 72, 200, 140, 12, COLOR_PANEL, 255);
  rrect(80, 92, 80, 80, 40, state.led ? COLOR_LED_ON : COLOR_LED_OFF, 255);
  text(36, 186, (state.blinking ? 'blinking' : 'steady') + ', pin reads ' + state.readBack, COLOR_TEXT, 1);
  rrect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, 10, buttonDown ? COLOR_BUTTON_DOWN : COLOR_BUTTON, 255);
  text(BUTTON_X + 44, BUTTON_Y + 20, 'PRESS', COLOR_TEXT, 2);
  text(20, 304, 'presses: ' + state.presses, COLOR_MUTED, 1);
}
