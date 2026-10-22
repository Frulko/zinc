// A round's report: the distortion (where a finger aimed at each point of a grid lands, the affine model, and where it lifted on average
// at each cross), how far off the taps are before and after the map, the confidence in it, and what to do next.
import * as lv from 'zinc:lvgl';
import { BUTTON_W, BUTTONS_Y, COLOR_AIM, COLOR_CARD, COLOR_DOT, COLOR_FAIR, COLOR_GOOD, DOT_SIZE, FAIR_PX, GOOD_PX, GRID_COLUMNS,
         GRID_MARGIN, GRID_ROWS, SCREEN_H, SCREEN_W, TARGET_X } from '../constants';
import { button, dot, fixed, mark, placeDot, text } from '../components/marks';
import { distance, invert } from '../core/fit';
import { Report } from '../state';

let page: i32 = 0;
let summary: i32 = 0;
const aims: i32[] = [];     // the grid
const lands: i32[] = [];    // where the model says each grid point is reported
const means: i32[] = [];    // where the finger lifted on average, a cross each

function gridX(c: i32): number { return GRID_MARGIN + c * (SCREEN_W - 2 * GRID_MARGIN) / (GRID_COLUMNS - 1); }
function gridY(r: i32): number { return GRID_MARGIN + r * (SCREEN_H - 2 * GRID_MARGIN) / (GRID_ROWS - 1); }

/** `reset` forgets the taps; held, `restore` gives the touch the controller's own pixels again. */
export function buildResult(parent: i32, again: () => void, apply: () => void, reset: () => void, restore: () => void): i32 {
  page = mark(parent, lv.pct(100), lv.pct(100), 0);
  lv.style(page, lv.BG_OPA, 0, 0);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLUMNS; c++) {
      const aim = dot(page, 4, COLOR_AIM);
      placeDot(aim, 4, gridX(c), gridY(r));
      aims.push(aim);
      lands.push(dot(page, DOT_SIZE, COLOR_GOOD));
    }
  }
  for (let i = 0; i < TARGET_X.length; i++) means.push(dot(page, DOT_SIZE, COLOR_DOT));
  const card = mark(page, SCREEN_W - 2 * 28, lv.SIZE_CONTENT, COLOR_CARD);
  lv.style(card, lv.BG_OPA, 230, 0);
  lv.radius(card, 8, 0);
  lv.pad(card, 8);
  lv.pos(card, 28, 64);
  summary = text(card, '', SCREEN_W - 2 * 28 - 16);
  lv.font(summary, 12);
  const step = (SCREEN_W - 2 * 28 - BUTTON_W) / 2;
  const again_ = button(page, 'Again', BUTTON_W), apply_ = button(page, 'Apply', BUTTON_W), forget = button(page, 'Reset', BUTTON_W);
  lv.pos(again_, 28, BUTTONS_Y);
  lv.pos(apply_, 28 + step, BUTTONS_Y);
  lv.pos(forget, 28 + 2 * step, BUTTONS_Y);
  lv.on(again_, lv.EVENT_CLICKED, again);
  lv.on(apply_, lv.EVENT_CLICKED, apply);
  lv.on(forget, lv.EVENT_SHORT_CLICKED, reset);
  lv.on(forget, lv.EVENT_LONG_PRESSED, restore);
  return page;
}

export function showResult(r: Report, note: string): void {
  const back = invert(r.map);   // from where a finger aims to where the touch reports it
  for (let i = 0; i < aims.length; i++) {
    const x = gridX(i % GRID_COLUMNS), y = gridY((i / GRID_COLUMNS) | 0);
    const lx = back.x(x, y), ly = back.y(x, y), off = distance(x, y, lx, ly);
    placeDot(lands[i], DOT_SIZE, lx, ly);
    lv.bg(lands[i], off <= GOOD_PX ? COLOR_GOOD : off <= FAIR_PX ? COLOR_FAIR : COLOR_DOT, 0);
  }
  for (let i = 0; i < means.length; i++) placeDot(means[i], DOT_SIZE, r.meanX[i], r.meanY[i]);
  lv.setText(summary, r.taps + ' taps, ' + r.rounds + (r.rounds === 1 ? ' round' : ' rounds') + '\nOff by ' + fixed(r.meanError, 1) +
                      ' px, ' + fixed(r.maxError, 0) + ' at most\nCorrected: ' + fixed(r.meanFitted, 1) + ' px, ' + fixed(r.maxFitted, 0) +
                      ' at most\nConfidence ' + Math.round(r.confidence * 100) + '%: known to ' + fixed(r.known, 1) + ' px' +
                      (r.moved < 0 ? '' : '\nThe round moved it ' + fixed(r.moved, 1) + ' px') + (note === '' ? '' : '\n' + note));
}
