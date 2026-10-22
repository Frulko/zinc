// Benchmark, in the spirit of lv_demo_benchmark (and of the zinc:ui tour's page): objects bouncing in an arena, drawn four ways (opaque
// rounded squares, translucent circles, text, a mix), with the live frame rate on top. "Run" measures each scene for three seconds and keeps
// the averages. Under it, what LVGL spends and sends a frame, and what the board's panel bus would need for it. The page scrolls.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT } from '../constants';
import { buttonRow, caption, card, infoRow, text } from '../components/ui';
import { BENCH_MAX, SCENES, boardFps, busMs, startRun, state } from '../state';

const ARENA_H: i32 = 136;   // the card fits a portrait page whole, Run included
const COLORS: i32[] = [0x6366f1, 0xec4899, 0xf59e0b, 0x10b981, 0x0ea5e9, 0xef4444, 0x8b5cf6, 0x14b8a6];
let boxes: i32[] = [];
let picks: i32[] = [];
let arena: i32 = 0;
let arenaW: i32 = 0;
let fpsLabel: i32 = 0;
let countLabel: i32 = 0;
let result: i32 = 0;
let lvglRow: i32 = 0;
let slowestRow: i32 = 0;
let pixelsRow: i32 = 0;
let busRow: i32 = 0;
let boardRow: i32 = 0;
let shownScene: i32 = -1;
let shownCount: i32 = -1;
let shownRun: i32 = -2;
let clock: number = 0;

function ms(v: number): string { return Math.round(v * 10) / 10 + ' ms'; }

/** The objects' look for the scene: kind 0 square, 1 translucent circle, 2 text. */
function showScene(): void {
  for (let i = 0; i < BENCH_MAX; i++) {
    const kind = state.scene === 3 ? i % 3 : state.scene;
    const b = boxes[i];
    lv.hidden(b, i >= state.count);
    lv.setText(b, kind === 2 ? 'Zinc' : '');
    const size = kind === 0 ? 22 : kind === 1 ? 28 : 34;
    lv.size(b, size, kind === 2 ? 16 : size);
    lv.radius(b, kind === 0 ? 5 : kind === 1 ? 14 : 0, 0);
    lv.style(b, lv.BG_OPA, kind === 0 ? 255 : kind === 1 ? 140 : 0, 0);
  }
  for (let i = 0; i < picks.length; i++) lv.state(picks[i], lv.STATE_CHECKED, i === state.scene);
  shownScene = state.scene;
  shownCount = state.count;
}

function showRun(): void {
  if (state.running >= 0) lv.setText(result, 'Measuring ' + SCENES[state.running] + '...');
  else if (state.results[0] < 0) lv.setText(result, 'Each scene for 3 s, its average fps');
  else {
    let s = '';
    for (let i = 0; i < SCENES.length; i++) s += (i > 0 ? '  ' : '') + SCENES[i] + ' ' + state.results[i];
    lv.setText(result, s);
  }
  shownRun = state.running;
}

export function buildBench(page: i32): void {
  boxes = []; picks = []; clock = 0.5;
  const top = card(page);
  arena = lv.obj(top);
  arenaW = lv.width() - 2 * 8 - 2 * 10 - 2;   // the page's padding, the card's padding and its border
  lv.size(arena, lv.pct(100), ARENA_H);
  lv.style(arena, lv.BG_OPA, 0, 0);
  lv.style(arena, lv.BORDER_WIDTH, 0, 0);
  lv.pad(arena, 0);
  lv.flag(arena, lv.FLAG_SCROLLABLE, false);
  for (let i = 0; i < BENCH_MAX; i++) {   // one label each: a label has a background too, so a square, a circle and a word are one object
    const b = text(arena, '', 12, COLORS[i % COLORS.length]);
    lv.bg(b, COLORS[i % COLORS.length], 0);
    lv.style(b, lv.TEXT_ALIGN, lv.TEXT_CENTER, 0);
    boxes.push(b);
  }
  const pill = lv.obj(arena);
  lv.size(pill, lv.SIZE_CONTENT, lv.SIZE_CONTENT);
  lv.pos(pill, 4, 4);
  lv.bg(pill, COLOR_MUTED, 0);
  lv.style(pill, lv.BG_OPA, 220, 0);
  lv.style(pill, lv.BORDER_WIDTH, 0, 0);
  lv.radius(pill, 8, 0);
  lv.style(pill, lv.PAD_LEFT, 8, 0);
  lv.style(pill, lv.PAD_RIGHT, 8, 0);
  lv.style(pill, lv.PAD_TOP, 2, 0);
  lv.style(pill, lv.PAD_BOTTOM, 2, 0);
  lv.flag(pill, lv.FLAG_SCROLLABLE, false);
  fpsLabel = text(pill, '-- fps', 20, COLOR_TEXT);

  // the scene picker: four buttons, the chosen one checked
  const scenes = buttonRow(top);
  lv.gap(scenes, 4, 4);
  for (let i = 0; i < SCENES.length; i++) {
    const b = lv.button(scenes, SCENES[i]);
    lv.size(b, 0, 26);
    lv.grow(b, 1);
    lv.pad(b, 0);
    lv.radius(b, 6, 0);
    lv.style(b, lv.SHADOW_WIDTH, 0, 0);
    lv.bg(b, COLOR_MUTED, 0);
    lv.bg(b, COLOR_ACCENT, lv.STATE_CHECKED);
    lv.font(lv.buttonLabel(b), 12);
    const scene = i;
    lv.on(b, lv.EVENT_CLICKED, () => { if (state.running < 0) state.scene = scene; });
    picks.push(b);
  }
  const objects = buttonRow(top);
  text(objects, 'Objects', 12, COLOR_MUTED_TEXT);
  const slider = lv.slider(objects, 1, BENCH_MAX / 4, state.count / 4);   // steps of four
  lv.size(slider, 0, 6);
  lv.grow(slider, 1);
  countLabel = text(objects, '' + state.count, 12, COLOR_TEXT);
  lv.on(slider, lv.EVENT_VALUE_CHANGED, () => { state.count = lv.value(slider) * 4; lv.setText(countLabel, '' + state.count); });
  const go = lv.button(objects, 'Run');
  lv.size(go, 52, 28);
  lv.style(go, lv.SHADOW_WIDTH, 0, 0);
  lv.font(lv.buttonLabel(go), 12);
  lv.on(go, lv.EVENT_CLICKED, () => { if (state.running < 0) startRun(); });

  const figures = card(page);
  caption(figures, 'RUN');
  result = text(figures, '', 12, COLOR_TEXT);
  lv.size(result, lv.pct(100), lv.SIZE_CONTENT);
  caption(figures, 'A FRAME');
  lvglRow = infoRow(figures, 'LVGL', '');
  slowestRow = infoRow(figures, 'Slowest', '');
  pixelsRow = infoRow(figures, 'Pixels sent', '');
  busRow = infoRow(figures, 'Panel bus (10 MHz)', '');
  boardRow = infoRow(figures, 'Board, estimated', '');
  showScene();
  showRun();
}

/** Moves the objects; the page is shown. */
export function updateBench(dt: number): void {
  if (state.scene !== shownScene || state.count !== shownCount) showScene();
  if (state.running !== shownRun) showRun();
  const w = arenaW - 24, h = ARENA_H - 24, xs = state.xs, ys = state.ys;
  for (let i = 0; i < state.count; i++) {
    const kind = state.scene === 3 ? i % 3 : state.scene, half = kind === 0 ? 11 : kind === 1 ? 14 : 17;
    lv.pos(boxes[i], 12 + ((xs[i] * w) >> 12) - half, 12 + ((ys[i] * h) >> 12) - half);   // >> 12: a BENCH_UNIT
  }
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  lv.setText(fpsLabel, Math.round(state.fps) + ' fps');
  lv.setText(lvglRow, ms(state.lvglMs));
  lv.setText(slowestRow, ms(state.slowestMs));
  lv.setText(pixelsRow, '' + state.pixels);
  lv.setText(busRow, ms(busMs()));
  lv.setText(boardRow, Math.round(boardFps()) + ' fps' + (state.freeHeap < 0 ? ' at most' : ''));
}
