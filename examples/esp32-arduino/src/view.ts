// The screen: one row per value, its label under it.
import { clear, rect, text } from 'zinc:gfx';
import { COLOR_BACKGROUND, COLOR_MUTED, COLOR_RULE, COLOR_TEXT, COLOR_TITLE, ROW_H, ROW_X, ROW_Y } from './constants';
import { state } from './state';

function row(index: i32, value: string, label: string): void {
  const y = ROW_Y + index * ROW_H;
  text(ROW_X, y, value, COLOR_TEXT, 2);
  text(ROW_X, y + 20, label, COLOR_MUTED, 1);
  rect(ROW_X, y + ROW_H - 10, 240 - 2 * ROW_X, 1, COLOR_RULE);
}

export function draw(): void {
  clear(COLOR_BACKGROUND);
  text(ROW_X, 16, 'Arduino', COLOR_TITLE, 3);
  text(ROW_X, 46, 'a C++ sketch, read from TS', COLOR_MUTED, 1);
  row(0, '' + state.boots, 'boots (Preferences, NVS)');
  row(1, (state.millis / 1000).toFixed(1) + ' s', 'millis() since the start');
  row(2, state.loopsPerSecond + ' / s', 'loop() runs, one a frame');
  row(3, state.freeHeap > 0 ? Math.round(state.freeHeap / 1024) + ' KB' : '-', 'ESP.getFreeHeap()');
  text(ROW_X, ROW_Y + 4 * ROW_H, state.chip, COLOR_TEXT, 1);
  text(ROW_X, ROW_Y + 4 * ROW_H + 14, 'from the ESP class', COLOR_MUTED, 1);
}
