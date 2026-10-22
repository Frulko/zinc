// System: the auto tour and the backlight, then live figures refreshed twice a second: the memory (LVGL's, the JavaScript heap, the board's
// heap), what a frame costs and what the board's panel bus would need for it, and the hardware as zinc:device reads it. The page scrolls.
// On the computer LVGL draws from a pool of the board's size and there is no heap to report; on the board LVGL takes the heap. The
// figures that only the board has (CPU, flash, firmware) say "on the board" on the computer.
import * as lv from 'zinc:lvgl';
import * as device from 'zinc:device';
import { COLOR_GOOD, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT, SCREEN_H, SCREEN_W, SYMBOL_REFRESH } from '../constants';
import { caption, card, infoRow, kitButton, row, text } from '../components/ui';
import { boardFps, busMs, clockText, state } from '../state';

let poolBar: i32 = 0;
let poolUsed: i32 = 0;
let poolPeak: i32 = 0;
let jsHeap: i32 = 0;
let free: i32 = 0;
let low: i32 = 0;
let fps: i32 = 0;
let lvgl: i32 = 0;
let slowest: i32 = 0;
let pixels: i32 = 0;
let bus: i32 = 0;
let board: i32 = 0;
let uptime: i32 = 0;
let light: i32 = 0;
let clock: number = 0.5;

function kib(bytes: i32): string { return Math.round(bytes / 1024) + ' KiB'; }
function ms(v: number): string { return Math.round(v * 10) / 10 + ' ms'; }
function showLight(): void { lv.setText(light, Math.round(device.backlight() * 100) + '%' + (device.hasBacklight() ? '' : ', on the board')); }

export function buildSystem(page: i32): void {
  clock = 0.5;
  const display = card(page);
  caption(display, 'DISPLAY');
  const tourRow = row(display);
  text(tourRow, 'Auto tour', 14, COLOR_TEXT);
  const tour = lv.toggle(tourRow, state.tour);
  lv.size(tour, 40, 22);
  lv.on(tour, lv.EVENT_VALUE_CHANGED, () => { state.tour = lv.checked(tour); state.tourClock = 0; });
  const turnRow = row(display);
  text(turnRow, 'Screen', 14, COLOR_TEXT);
  const turn = kitButton(turnRow, SYMBOL_REFRESH + (state.turn === 0 ? '  Landscape' : '  Portrait'), COLOR_MUTED, false);
  lv.on(turn, lv.EVENT_CLICKED, () => { state.turn = 1 - state.turn; });   // the frame turns the display and builds the screen again
  const lightRow = row(display);
  text(lightRow, 'Backlight', 14, COLOR_TEXT);
  light = text(lightRow, '', 12, COLOR_MUTED_TEXT);
  const level = lv.slider(display, 5, 100, 100);   // never quite dark: the screen would look dead
  lv.size(level, lv.pct(100), 6);
  lv.on(level, lv.EVENT_VALUE_CHANGED, () => { device.setBacklight(lv.value(level) / 100); showLight(); });
  showLight();

  const mem = card(page);
  caption(mem, 'MEMORY');
  poolBar = lv.bar(mem, 0, 1000, 0);
  lv.size(poolBar, lv.pct(100), 6);
  poolUsed = infoRow(mem, 'LVGL', '');
  poolPeak = infoRow(mem, 'LVGL, most', '');
  jsHeap = infoRow(mem, 'JavaScript heap', '');
  free = infoRow(mem, 'Free heap', '');
  low = infoRow(mem, 'Lowest free heap', '');

  const run = card(page);
  caption(run, 'A FRAME');
  fps = infoRow(run, 'Frame rate', '');
  lv.textColor(fps, COLOR_GOOD, 0);
  lvgl = infoRow(run, 'LVGL', '');
  slowest = infoRow(run, 'Slowest', '');
  pixels = infoRow(run, 'Pixels sent', '');
  bus = infoRow(run, 'Panel bus (10 MHz)', '');
  board = infoRow(run, 'Board, estimated', '');
  uptime = infoRow(run, 'Uptime', '');

  const hw = card(page);
  caption(hw, 'HARDWARE');
  const flash = device.flashSize(), mhz = device.cpuMhz(), idf = device.idfVersion(), firmware = device.firmware();
  infoRow(hw, 'Board', 'ESP32-2432S022');
  infoRow(hw, 'Chip', device.chip());
  infoRow(hw, 'CPU', mhz > 0 ? mhz + ' MHz' : 'on the board');
  infoRow(hw, 'Flash', flash > 0 ? Math.round(flash / 1048576) + ' MiB' : 'on the board');
  infoRow(hw, 'Display', 'ST7789 ' + SCREEN_W + 'x' + SCREEN_H + ', i80');
  infoRow(hw, 'Touch', device.hasTouch() ? 'CST820, I2C' : 'none');
  infoRow(hw, 'Firmware', firmware.length > 0 ? firmware : 'on the board');
  if (idf.length > 0) infoRow(hw, 'ESP-IDF', idf);
  infoRow(hw, 'Interface', 'LVGL 9.6');
  infoRow(hw, 'Engine', firmware.length > 0 ? 'MicroQuickJS' : 'Zinc');
  updateSystem(0);
}

export function updateSystem(dt: number): void {
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  const m = device.memory();
  const pooled = state.poolSize > 0;   // the computer: LVGL's pool; the board: LVGL takes the heap, counted in "Free heap"
  lv.setValue(poolBar, pooled ? Math.round(state.poolUsed * 1000 / state.poolSize) : 0, false);
  lv.hidden(poolBar, !pooled);
  lv.setText(poolUsed, pooled ? kib(state.poolUsed) + ' of ' + kib(state.poolSize) : 'in the heap');
  lv.setText(poolPeak, pooled ? kib(state.poolPeak) : 'in the heap');
  lv.setText(jsHeap, m.zincSize > 0 ? kib(m.zincUsed) + ' of ' + kib(m.zincSize) : 'no limit here');
  lv.setText(free, m.chipFree < 0 ? 'no limit here' : kib(m.chipFree));
  lv.setText(low, m.chipMinFree < 0 ? 'no limit here' : kib(m.chipMinFree));
  lv.setText(fps, Math.round(state.fps) + ' fps');
  lv.setText(lvgl, ms(state.lvglMs));
  lv.setText(slowest, ms(state.slowestMs));
  lv.setText(pixels, '' + state.pixels);
  lv.setText(bus, ms(busMs()));
  lv.setText(board, Math.round(boardFps()) + ' fps' + (state.freeHeap < 0 ? ' at most' : ''));
  lv.setText(uptime, clockText(state.uptime));
}
