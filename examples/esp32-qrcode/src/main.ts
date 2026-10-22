// esp32-qrcode: a C library in a TypeScript program on the ESP32. zinc:qrcode (plugins/qrcode) is Nayuki's QR Code generator behind one C
// file on Zinc's native ABI; zinc builds it into the board's mquickjs firmware the first time (ESP-IDF, a few minutes), and the same file
// runs on the computer. The button shows the next text; the time to encode is on the screen.
// `zinc run examples/esp32-qrcode --target esp32` on the ESP32-2432S022, or `zinc run examples/esp32-qrcode` on the computer.
import { onFrame, keep, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y } from './constants';
import { show, state } from './state';
import { draw } from './view';

show(0);
let wasDown: boolean = false;
onFrame((dt: number) => {
  const down = pointerDown() && pointerX() >= BUTTON_X && pointerX() < BUTTON_X + BUTTON_W && pointerY() >= BUTTON_Y && pointerY() < BUTTON_Y + BUTTON_H;
  if (down && !wasDown) show(state.index + 1);
  if (down !== wasDown) state.dirty = true;
  wasDown = down;
  if (!state.dirty) { keep(); return; }
  state.dirty = false;
  draw(down);
});

console.log('esp32-qrcode ready');
