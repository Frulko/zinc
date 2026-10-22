// System: what the program runs on and what it costs, refreshed twice a second. The heap is the board's (the computer reports none).
import * as lv from 'zinc:lvgl';
import { COLOR_GOOD, SCREEN_H, SCREEN_W } from '../constants';
import { caption, card, infoRow } from '../components/ui';
import { clockText, state } from '../state';

let fps: i32 = 0;
let lvgl: i32 = 0;
let slowest: i32 = 0;
let pixels: i32 = 0;
let free: i32 = 0;
let low: i32 = 0;
let uptime: i32 = 0;
let clock: number = 0;

function kb(bytes: i32): string { return bytes < 0 ? 'n/a here' : Math.round(bytes / 1024) + ' KiB'; }

export function buildSystem(page: i32): void {
  const ui = card(page);
  caption(ui, 'INTERFACE');
  infoRow(ui, 'Library', 'LVGL 9.6');
  infoRow(ui, 'Display', SCREEN_W + ' x ' + SCREEN_H + ', RGB565');
  infoRow(ui, 'Rendering', 'partial, 32-row buffers');
  fps = infoRow(ui, 'Frame rate', '');
  lv.textColor(fps, COLOR_GOOD, 0);
  lvgl = infoRow(ui, 'LVGL a frame', '');
  slowest = infoRow(ui, 'Slowest frame', '');
  pixels = infoRow(ui, 'Pixels a frame', '');

  const mem = card(page);
  caption(mem, 'MEMORY');
  free = infoRow(mem, 'Free heap', '');
  low = infoRow(mem, 'Lowest free heap', '');

  const run = card(page);
  caption(run, 'RUN');
  infoRow(run, 'Engine', 'Zinc on MicroQuickJS');
  uptime = infoRow(run, 'Uptime', '');
}

export function updateSystem(dt: number): void {
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  lv.setText(fps, Math.round(state.fps) + ' fps');
  lv.setText(lvgl, Math.round(state.lvglMs * 10) / 10 + ' ms');
  lv.setText(slowest, Math.round(state.slowestMs * 10) / 10 + ' ms');
  lv.setText(pixels, '' + state.pixels);
  lv.setText(free, kb(state.freeHeap));
  lv.setText(low, kb(state.minHeap));
  lv.setText(uptime, clockText(state.uptime));
}
