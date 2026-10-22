// esp32-arduino: a C++ sketch on Arduino's core in a TypeScript program on the ESP32. The project's own plugin (plugins/sketch) is the
// sketch: its setup() starts Arduino's core and counts the boots with Preferences, its loop() runs once per frame; TypeScript reads what it
// keeps. zinc builds the firmware with arduino-esp32 as an ESP-IDF component the first time (a few minutes), and the same file runs on the
// computer without Arduino.
// `zinc run examples/esp32-arduino --target esp32` on the ESP32-2432S022, or `zinc run examples/esp32-arduino` on the computer.
import { onFrame, keep } from 'zinc:gfx';
import { REFRESH_MS } from './constants';
import { refresh, state } from './state';
import { draw } from './view';

refresh(performance.now());
onFrame((dt: number) => {
  const now = performance.now();
  if (now - state.lastRead >= REFRESH_MS) refresh(now);
  if (!state.dirty) { keep(); return; }
  state.dirty = false;
  draw();
});

console.log('esp32-arduino ready: boot ' + state.boots + ' on ' + state.chip);
