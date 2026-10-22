// esp32-widgets: the widgets tour on LVGL (zinc:lvgl), the light way to a smooth interface on a small board without PSRAM. Six pages
// (dashboard, controls, player, a Lottie animation, benchmark, system), built one at a time, under a title bar and above a navigation bar.
// LVGL draws only what changed, in 32-row areas sent straight to the panel; the program only sets values. `zinc run . --target esp32
// --engine mquickjs` on the ESP32-2432S022, `--emulator` in esp32sim, or `zinc run .` on the computer.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, PAGE_BENCH, PAGE_HOME, PAGE_INFO, PAGE_INPUT, PAGE_LOTTIE, PAGE_MUSIC, SCREEN_H, SCREEN_W, STATS_EVERY,
         TOUR_EVERY } from './constants';
import { buildShell, showPage, PAGES } from './components/shell';
import { buildDashboard, updateDashboard } from './pages/dashboard';
import { buildControls, updateControls } from './pages/controls';
import { buildMusic, updateMusic } from './pages/music';
import { buildLottie, updateLottie } from './pages/lottie';
import { buildBench, updateBench } from './pages/bench';
import { buildSystem, updateSystem } from './pages/system';
import { clockText, state, takeStats, tick } from './state';

lv.start(SCREEN_W, SCREEN_H, true, COLOR_ACCENT);
let shell = buildShell();
/** Builds a page's objects in its container; the state (state.ts) keeps what it shows between two visits. */
function build(page: i32): void {
  const box = shell.pages[page];
  if (page === PAGE_HOME) buildDashboard(box);
  else if (page === PAGE_INPUT) buildControls(box);
  else if (page === PAGE_MUSIC) buildMusic(box);
  else if (page === PAGE_LOTTIE) buildLottie(box);
  else if (page === PAGE_BENCH) buildBench(box);
  else if (page === PAGE_INFO) buildSystem(box);
}
// One page lives at a time: the page left is deleted and the next one built, so LVGL holds the shell and one page, what a board without
// PSRAM can hold (all six at once do not fit its heap)
function goTo(page: i32): void {
  if (page === state.page) return;
  lv.clean(shell.pages[state.page]);
  build(page);
  showPage(shell, state.page, page);
  state.page = page;
}
/** The whole screen at the display's size: the shell, its navigation and the page shown. */
function buildScreen(): void {
  for (let i = 0; i < PAGES.length; i++) {
    const page = i;
    lv.on(shell.items[i], lv.EVENT_CLICKED, () => { goTo(page); state.tourClock = 0; });
  }
  build(state.page);
  showPage(shell, -1, state.page);
}
buildScreen();
let shownTurn: i32 = 0;

let statsClock: number = 0;
let logClock: number = 0;
let shownSecond: i32 = -1;
lv.run((dt: number) => {
  tick(dt);
  if (state.turn !== shownTurn) {   // Info's Rotate: LVGL lays out at the turned size, the screen is built again for it
    lv.rotate(state.turn);
    lv.clean(lv.screen());
    shell = buildShell();
    buildScreen();
    shownTurn = state.turn;
  }
  if (state.tour) {
    state.tourClock += dt;
    if (state.tourClock >= TOUR_EVERY) { state.tourClock = 0; goTo((state.page + 1) % PAGES.length); }
  }
  if (state.page === PAGE_HOME) updateDashboard(dt);
  else if (state.page === PAGE_INPUT) updateControls(dt);
  else if (state.page === PAGE_MUSIC) updateMusic(dt);
  else if (state.page === PAGE_LOTTIE) updateLottie(dt);
  else if (state.page === PAGE_BENCH) updateBench(dt);
  else if (state.page === PAGE_INFO) updateSystem(dt);
  const second = Math.floor(state.uptime);
  if (second !== shownSecond) { lv.setText(shell.uptime, clockText(state.uptime)); shownSecond = second; }
  statsClock += dt;
  if (statsClock >= STATS_EVERY) {
    takeStats(lv.stats(), statsClock);
    statsClock = 0;
    lv.setText(shell.fps, Math.round(state.fps) + ' fps');
  }
  logClock += dt;
  if (logClock >= 5) {
    logClock = 0;
    console.log('widgets: page ' + PAGES[state.page].label + ', ' + Math.round(state.fps) + ' fps, LVGL ' + Math.round(state.lvglMs * 10) / 10 +
                ' ms a frame (slowest ' + Math.round(state.slowestMs * 10) / 10 + '), ' + state.pixels + ' px a frame, LVGL pool ' + state.poolUsed +
                ' (most ' + state.poolPeak + ') of ' + state.poolSize + ', free heap ' + state.freeHeap + ' (lowest ' + state.minHeap + ')');
  }
});
console.log('esp32-widgets ready');
