// The crosses: one at a time, a dot where each tap of the round landed, and the round's progress.
import * as lv from 'zinc:lvgl';
import { COLOR_CROSS, COLOR_DOT, CROSS_ARM, DOT_SIZE, SCREEN_W, TARGET_X, TARGET_Y } from '../constants';
import { dot, mark, placeDot, text } from '../components/marks';
import { state, Tap } from '../state';

let page: i32 = 0;
let across: i32 = 0;
let down: i32 = 0;
let info: i32 = 0;
const dots: i32[] = [];   // one a cross

export function buildMeasure(parent: i32): i32 {
  page = mark(parent, lv.pct(100), lv.pct(100), 0);
  lv.style(page, lv.BG_OPA, 0, 0);
  across = mark(page, 2 * CROSS_ARM + 1, 1, COLOR_CROSS);
  down = mark(page, 1, 2 * CROSS_ARM + 1, COLOR_CROSS);
  for (let i = 0; i < TARGET_X.length; i++) dots.push(dot(page, DOT_SIZE, COLOR_DOT));
  info = text(page, '', SCREEN_W - 2 * 36);
  lv.pos(info, 36, 96);
  return page;
}

/** The next cross; the round's dots so far. */
export function showMeasure(note: string): void {
  lv.pos(across, TARGET_X[state.target] - CROSS_ARM, TARGET_Y[state.target]);
  lv.pos(down, TARGET_X[state.target], TARGET_Y[state.target] - CROSS_ARM);
  for (let i = 0; i < dots.length; i++) lv.hidden(dots[i], i >= state.target);
  lv.setText(info, 'Cross ' + (state.target + 1) + ' of ' + TARGET_X.length + ', round ' + state.round + '\nTap its centre.' +
                   (note === '' ? '' : '\n\n' + note));
}

export function markTap(t: Tap): void { placeDot(dots[t.target], DOT_SIZE, t.lastX, t.lastY); }
