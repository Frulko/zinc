// esp32-wifi: WiFiManager's way on zinc:wifi. The first time (or after "forget"), the board opens an open network named after it; a
// phone that joins it gets the setup page, picks the home network and types its password; the board keeps it and joins it at each start.
// Then the clock comes from the network (SNTP) and `zinc run <app> --host <name>.local` sends programs over Wi-Fi.
// `zinc run examples/esp32-wifi --target esp32` on the ESP32-2432S022 (the network firmware is written by itself the first time).
import { start, forget } from 'zinc:wifi';
import { onFrame, keep, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, CLOCK_MS, TIMEZONE } from './constants';
import { changed, state, tick } from './state';
import { draw } from './view';

start(changed, { timezone: TIMEZONE });
setInterval(() => { tick(); }, CLOCK_MS);

let wasDown: boolean = false;
onFrame((dt: number) => {
  const down = pointerDown() && pointerX() >= BUTTON_X && pointerX() < BUTTON_X + BUTTON_W && pointerY() >= BUTTON_Y && pointerY() < BUTTON_Y + BUTTON_H;
  if (down && !wasDown) {
    console.log('wifi: forgetting the network');
    forget();
    start(changed, { timezone: TIMEZONE });   // no network saved: the portal opens
  }
  if (down !== wasDown) state.dirty = true;
  wasDown = down;
  if (!state.dirty) { keep(); return; }
  state.dirty = false;
  draw(down);
});

console.log('esp32-wifi ready');
