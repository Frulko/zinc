// widgets2432: an LVGL-widgets-style tour of Zinc on the ESP32-2432S022 (2.2" 240x320 ST7789 + CST820 touch).
// Five pages behind a bottom navigation bar: a live dashboard, controls, a music player, a benchmark and the
// system page (backlight, theme, memory and frame figures). One frame callback drives the clock, the simulated
// sensors, the animations and the optional auto tour.
//
//   zinc run examples/boards/esp32-2432s022                       macOS emulator, the mouse is the finger
//   zinc flash examples/boards/esp32-2432s022 --target esp32 --port /dev/cu.usbserial-XXXX
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import * as ui from 'zinc:ui';
import { Shell, Page } from './components/Shell';
import * as device from 'zinc:device';
import { setTheme, DARK, LIGHT } from 'zinc:ui/kit';
import { PAGES, page, fps, frameMs, HOME, CONTROLS, MUSIC, BENCH, SYSTEM, go, stepClock, stepTour, brightness, setBrightness, setDark, dark, setTour, stepNav, live } from './app/state';
import { stepMotion } from './app/motion';
import { stepSensors } from './app/sensors';
import { stepMusic, toggle } from './app/music';
import { stepBench } from './app/bench';
import { Home } from './pages/Home';
import { Controls, stepControls, keyCenter, isUnlocked } from './pages/Controls';
import { Music } from './pages/Music';
import { Bench } from './pages/Bench';
import { System, stepSystem } from './pages/System';

/** The emulator has no backlight (setBacklight did not reach a PWM pin): a black veil stands in for a dimmed panel. */
function emulated(): boolean { return !device.hasBacklight(); }
/** On the board (a real CPU clock): figures go to the serial console every 5 s. */
const BOARD: boolean = device.cpuMhz() > 0;

function App(): i32 {
  return <View class="h-full">
    <Show when={live()}><Shell>
      <Page index={HOME}><Home /></Page>
      <Page index={CONTROLS}><Controls /></Page>
      <Page index={MUSIC}><Music /></Page>
      <Page index={BENCH}><Bench /></Page>
      <Page index={SYSTEM}><System /></Page>
    </Shell></Show>
    <Show when={emulated() && brightness() < 0.99}>
      <View class="absolute inset-0 bg-black" style={{ opacity: (1 - brightness()) * 0.85 }} />
    </Show>
  </View>;
}

// Emulator-only scripting for screenshots and measurements (the board has no environment):
//   ZINC_DEMO=<page>[:<scroll px>]  opens a page (the music one playing), optionally scrolled
//   ZINC_DEMO=tour                  starts the auto tour      ZINC_DEMO=light   light theme
//   ZINC_DEMO=pin                   types 2432 + OK on the keypad with synthetic taps and prints the result
const demo = env('ZINC_DEMO');
let demoScroll: number = -1, demoFrames: i32 = 0;
if (demo === 'tour') setTour(true);
else if (demo === 'pin') { go(CONTROLS); demoScroll = 600; }
else if (demo === 'light') setDark(false);
else if (demo !== '') {
  const parts = demo.split(':');
  go(parseInt(parts[0]));
  if (parts.length > 1) demoScroll = parseInt(parts[1]);
  if (page() === MUSIC) toggle();
}
const PIN_TAPS: string[] = ['2', '4', '3', '2', 'OK'];
/** Synthetic taps on the keypad (ZINC_DEMO=pin), then the page scroll once the page is mounted (a few frames in). */
function stepDemo(): void {
  demoFrames++;
  if (demo === 'pin' && demoFrames >= 40 && demoFrames < 40 + PIN_TAPS.length * 4) {
    const k = Math.floor((demoFrames - 40) / 4), phase = (demoFrames - 40) % 4;
    const c = keyCenter(PIN_TAPS[k]);
    if (phase === 0) ui.pointerAt(c[0], c[1], true);
    else if (phase === 1) ui.pointerAt(c[0], c[1], false);
  }
  if (demo === 'pin' && demoFrames === 40 + PIN_TAPS.length * 4) console.log(`keypad check: ${isUnlocked() ? 'unlocked' : 'FAILED'}`);
  if (demoScroll < 0 || demoFrames < 30) return;
  const n = firstScroller(ui.inspectRoot());
  if (n >= 0) ui.scrollTo(n, 0, demoScroll);
  demoScroll = -1;
}
function firstScroller(h: i32): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if ((n as ui.UiNode).scroll !== 0) return h;
  for (const c of (n as ui.UiNode).children) { const s = firstScroller(c); if (s >= 0) return s; }
  return -1;
}

// Serial log of the figures (always on the board: `zinc monitor`; ZINC_STATS=1 in the emulator)
const STATS: boolean = BOARD || env('ZINC_STATS') !== '';
let statsClock: number = 0, maxCmds: i32 = 0, peakHeap: i32 = 0;
function logStats(dt: number): void {
  maxCmds = Math.max(maxCmds, device.drawCmds());
  peakHeap = Math.max(peakHeap, device.zincHeapUsed());
  statsClock += dt;
  if (statsClock < (BOARD ? 5 : 1)) return;
  statsClock = 0;
  const m = device.memory();
  console.log(`${PAGES[page()].label}: ${fps()} fps, slowest frame ${frameMs().toFixed(1)} ms, draw cmds max ${maxCmds}, zinc heap peak ${Math.round(peakHeap / 1024)}/${Math.round(m.zincSize / 1024)} KiB, chip RAM free ${Math.round(m.chipFree / 1024)} KiB (min ${Math.round(m.chipMinFree / 1024)})`);
  maxCmds = 0; peakHeap = 0;
}

function tick(dt: number): void {
  if (STATS) logStats(dt);
  stepDemo();
  stepClock(dt);
  stepTour(dt);
  stepMotion(dt);
  stepNav();
  stepSensors(dt);
  stepControls(dt);
  stepMusic(dt);
  stepBench(dt);
  stepSystem(dt);
}

setTheme(dark() ? DARK : LIGHT);
setBrightness(brightness());
// no touch controller (the ESP32-2432S022N variant, or QEMU): the demo shows itself
if (!device.hasTouch()) setTour(true);
render(App, -1, tick);
