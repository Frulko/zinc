// esp32-widgets: the widgets tour on LVGL (zinc:lvgl), the light way to a smooth interface on a small board without PSRAM. Five pages
// (dashboard, controls, player, benchmark, system) under a title bar and above a navigation bar. LVGL draws only what changed, in 32-row
// areas sent straight to the panel; the program only sets values. `zinc run . --target esp32 --engine mquickjs` on the ESP32-2432S022,
// `--emulator` in esp32sim, or `zinc run .` on the computer.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, SCREEN_H, SCREEN_W, STATS_EVERY } from './constants';
import { buildShell, showPage, PAGES } from './components/shell';
import { buildDashboard, updateDashboard } from './pages/dashboard';
import { buildControls, updateControls } from './pages/controls';
import { buildMusic, updateMusic } from './pages/music';
import { buildBench, updateBench } from './pages/bench';
import { buildSystem, updateSystem } from './pages/system';
import { clockText, state, takeStats, tick } from './state';

lv.start(SCREEN_W, SCREEN_H, true, COLOR_ACCENT);
const shell = buildShell();
buildDashboard(shell.pages[0]);
buildControls(shell.pages[1]);
buildMusic(shell.pages[2]);
buildBench(shell.pages[3]);
buildSystem(shell.pages[4]);
for (let i = 0; i < PAGES.length; i++) {
  const page = i;
  lv.on(shell.items[i], lv.EVENT_CLICKED, () => {
    if (page === state.page) return;
    showPage(shell, state.page, page);
    state.page = page;
  });
}
showPage(shell, -1, 0);

let statsClock: number = 0;
let logClock: number = 0;
let shownSecond: i32 = -1;
lv.run((dt: number) => {
  tick(dt);
  if (state.page === 0) updateDashboard(dt);
  else if (state.page === 1) updateControls(dt);
  else if (state.page === 2) updateMusic(dt);
  else if (state.page === 3) updateBench(dt);
  else updateSystem(dt);
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
                ' ms a frame (slowest ' + Math.round(state.slowestMs * 10) / 10 + '), ' + state.pixels + ' px a frame, free heap ' + state.freeHeap);
  }
});
console.log('esp32-widgets ready');
