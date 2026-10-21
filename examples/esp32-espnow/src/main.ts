// esp32-espnow: boards that talk with no access point. Each one broadcasts a hello every two seconds and shows what the others send;
// the screen's button sends one at once. With a single board, the counts show its packets going on air.
// `zinc run examples/esp32-espnow --target esp32` on each board (the network firmware is written by itself the first time).
import { start } from 'zinc:espnow';
import { onFrame, keep, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, CHANNEL, HELLO_MS } from './constants';
import { heard, hello, state } from './state';
import { draw } from './view';

start(heard, { channel: CHANNEL });
setInterval(() => { hello(); }, HELLO_MS);

let wasDown: boolean = false;
onFrame((dt: number) => {
  const down = pointerDown() && pointerX() >= BUTTON_X && pointerX() < BUTTON_X + BUTTON_W && pointerY() >= BUTTON_Y && pointerY() < BUTTON_Y + BUTTON_H;
  if (down && !wasDown) hello();
  if (down !== wasDown) state.dirty = true;
  wasDown = down;
  if (!state.dirty) { keep(); return; }
  state.dirty = false;
  draw(down);
});

console.log('esp32-espnow ready: ' + state.me + ' on channel ' + CHANNEL);
