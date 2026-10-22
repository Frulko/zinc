// touch-check: how precise a touch screen is, and the map that corrects it. Tap the centre of each cross; after each round the screen
// shows the distortion (where a finger aimed at each point of a grid lands, green within 5 px, amber within 15, red beyond; the red dots
// are where it lifted on average at each cross), how far off the taps were and how far once the best affine map (a scale, a shear, a
// turn or a mirror, an offset) corrects them, and the confidence in that map, which rises with the rounds (state.ts). Apply hands the map
// to the touch (the board keeps it); Reset forgets the taps, and held, the board's map too. On the ESP32-2432S022 (`zinc run . --target
// esp32`), in esp32sim and on the computer (`zinc run .`: the mouse is exact and the system owns the touch, so nothing is applied).
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, SCREEN_H, SCREEN_W } from './constants';
import { fixed, signed } from './components/marks';
import { buildMeasure, markTap, showMeasure } from './pages/measure';
import { buildResult, showResult } from './pages/result';
import { applyMap, nextRound, report, reset, state, track, Tap } from './state';

lv.start(SCREEN_W, SCREEN_H, true, COLOR_ACCENT);
const screen = lv.screen();
lv.flag(screen, lv.FLAG_SCROLLABLE, false);

function logTap(t: Tap): void {
  console.log('touch: cross ' + (t.target + 1) + ' at ' + t.meantX + ',' + t.meantY + ' landed at ' + t.firstX + ',' + t.firstY + ' lifted at ' +
              t.lastX + ',' + t.lastY + ' (' + signed(t.lastX - t.meantX, 0) + ',' + signed(t.lastY - t.meantY, 0) + '), moved ' + t.moved +
              ' px over ' + t.frames + ' frames');
}

function showRound(note: string): void {
  const r = report();
  const m = r.map;
  console.log('touch: round ' + state.round + ', ' + r.taps + ' taps: off by ' + fixed(r.meanError, 1) + ' px (' + fixed(r.maxError, 1) +
              ' at most); x = ' + fixed(m.a, 3) + ' rx ' + signed(m.b, 3) + ' ry ' + signed(m.c, 1) + ', y = ' + fixed(m.d, 3) + ' rx ' +
              signed(m.e, 3) + ' ry ' + signed(m.f, 1) + ' leaves ' + fixed(r.meanFitted, 1) + ' px (' + fixed(r.maxFitted, 1) + ' at most); ' +
              'confidence ' + Math.round(r.confidence * 100) + '%, known to ' + fixed(r.known, 1) + ' px' + (r.moved < 0 ? '' : ', moved ' + fixed(r.moved, 1) + ' px'));
  showResult(r, note);
  lv.hidden(measure, true);
  lv.hidden(result, false);
}

function showCrosses(note: string): void {
  showMeasure(note);
  lv.hidden(result, true);
  lv.hidden(measure, false);
}

const measure = buildMeasure(screen);
const result = buildResult(screen, () => { nextRound(); showCrosses(''); }, () => {
  const m = report().map;
  const done = applyMap(m);
  console.log(done ? 'touch: the map is applied; the taps start again through it' : 'touch: the system owns this touch: the map is shown, not applied');
  if (done) showCrosses('Applied: now through the map.');
  else { state.measuring = false; showRound('The system owns this touch.'); }
}, () => { reset(false); showCrosses(''); }, () => {
  reset(true);
  console.log('touch: the touch has its controller\'s own pixels again');
  showCrosses('The touch is raw again.');
});
showCrosses('');
console.log('touch: tap the centre of each cross');

lv.run((dt: number) => {
  if (!state.measuring) return;
  const tap = track(lv.pointerDown(), lv.pointerX(), lv.pointerY());
  if (tap === null) return;
  logTap(tap);
  markTap(tap);
  if (state.measuring) showCrosses('');
  else showRound('');
});
