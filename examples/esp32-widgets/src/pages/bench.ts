// Benchmark: squares that bounce while the page is shown, each one an LVGL object moved every frame, so LVGL redraws only the areas
// they leave and enter. The figures under them are LVGL's own: its time a frame and what it sent to the panel.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_COOL, COLOR_GOOD, COLOR_HOT, COLOR_MUTED_TEXT, COLOR_TEXT, SCREEN_W } from '../constants';
import { card, infoRow, row, text } from '../components/ui';
import { rand, state } from '../state';

const ARENA_H: i32 = 120;
const SIZE: i32 = 14;
const COLORS: i32[] = [COLOR_ACCENT, COLOR_GOOD, COLOR_HOT, COLOR_COOL];
const boxes: i32[] = [];
const xs: number[] = [];
const ys: number[] = [];
const vxs: number[] = [];
const vys: number[] = [];
let arena: i32 = 0;
let width: number = 0;
let count: i32 = 0;
let fps: i32 = 0;
let lvgl: i32 = 0;
let slowest: i32 = 0;
let areas: i32 = 0;
let clock: number = 0;

function addBoxes(n: i32): void {
  for (let i = 0; i < n; i++) {
    const b = lv.obj(arena);
    lv.size(b, SIZE, SIZE);
    lv.radius(b, 3, 0);
    lv.style(b, lv.BORDER_WIDTH, 0, 0);
    lv.bg(b, COLORS[boxes.length % COLORS.length], 0);
    lv.flag(b, lv.FLAG_CLICKABLE, false);
    boxes.push(b);
    xs.push(rand() * (width - SIZE));
    ys.push(rand() * (ARENA_H - SIZE));
    vxs.push((rand() < 0.5 ? -1 : 1) * (40 + 60 * rand()));
    vys.push((rand() < 0.5 ? -1 : 1) * (40 + 60 * rand()));
  }
  lv.setText(count, boxes.length + ' squares');
}

function removeBoxes(n: i32): void {
  for (let i = 0; i < n && boxes.length > 0; i++) {
    lv.remove(boxes.pop()!);
    xs.pop(); ys.pop(); vxs.pop(); vys.pop();
  }
  lv.setText(count, boxes.length + ' squares');
}

export function buildBench(page: i32): void {
  const top = card(page);
  arena = lv.obj(top);
  width = SCREEN_W - 2 * 8 - 2 * 10 - 2;   // the page's padding, the card's padding and its border
  lv.size(arena, lv.pct(100), ARENA_H);
  lv.style(arena, lv.BG_OPA, 0, 0);
  lv.style(arena, lv.BORDER_WIDTH, 0, 0);
  lv.pad(arena, 0);
  lv.flag(arena, lv.FLAG_SCROLLABLE, false);
  const line = row(top);
  count = text(line, '', 12, COLOR_MUTED_TEXT);
  const less = lv.button(line, '-4');
  const more = lv.button(line, '+4');
  lv.size(less, 44, 26);
  lv.size(more, 44, 26);
  lv.style(less, lv.SHADOW_WIDTH, 0, 0);
  lv.style(more, lv.SHADOW_WIDTH, 0, 0);
  lv.on(less, lv.EVENT_CLICKED, () => removeBoxes(4));
  lv.on(more, lv.EVENT_CLICKED, () => addBoxes(4));
  addBoxes(8);

  const figures = card(page);
  fps = infoRow(figures, 'Frame rate', '');
  lvgl = infoRow(figures, 'LVGL a frame', '');
  slowest = infoRow(figures, 'Slowest frame', '');
  areas = infoRow(figures, 'Areas, pixels a frame', '');
  lv.textColor(fps, COLOR_TEXT, 0);
}

/** Moves the squares; the page is shown. */
export function updateBench(dt: number): void {
  const d = Math.min(dt, 0.05);
  for (let i = 0; i < boxes.length; i++) {
    xs[i] += vxs[i] * d;
    ys[i] += vys[i] * d;
    if (xs[i] < 0) { xs[i] = 0; vxs[i] = -vxs[i]; }
    if (xs[i] > width - SIZE) { xs[i] = width - SIZE; vxs[i] = -vxs[i]; }
    if (ys[i] < 0) { ys[i] = 0; vys[i] = -vys[i]; }
    if (ys[i] > ARENA_H - SIZE) { ys[i] = ARENA_H - SIZE; vys[i] = -vys[i]; }
    lv.pos(boxes[i], Math.round(xs[i]), Math.round(ys[i]));
  }
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  lv.setText(fps, Math.round(state.fps) + ' fps');
  lv.setText(lvgl, Math.round(state.lvglMs * 10) / 10 + ' ms');
  lv.setText(slowest, Math.round(state.slowestMs * 10) / 10 + ' ms');
  lv.setText(areas, state.areas + ', ' + state.pixels);
}
