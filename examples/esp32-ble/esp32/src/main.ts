// esp32-ble, the board's side: it advertises "Zinc xxxx" with the Nordic UART Service; the Mac's app (../mac) connects and they talk.
// The board answers each message, and "led on" / "led off" from the Mac drive the LED on GPIO 26; its button sends a message.
// `zinc run examples/esp32-ble/esp32 --target esp32` (the network firmware is written by itself the first time), then
// `zinc run examples/esp32-ble/mac` on the Mac.
import { advertise } from 'zinc:ble';
import { onFrame, keep, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { info } from 'zinc:wifi';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, NAME_PREFIX } from './constants';
import { closed, initLed, opened, received, say, state } from './state';
import { draw } from './view';

initLed();
state.name = NAME_PREFIX + info().name.slice(5);   // "Zinc e3d8": the board's name without "zinc-"
advertise(state.name, opened, received, closed);

let wasDown: boolean = false;
onFrame((dt: number) => {
  const down = pointerDown() && pointerX() >= BUTTON_X && pointerX() < BUTTON_X + BUTTON_W && pointerY() >= BUTTON_Y && pointerY() < BUTTON_Y + BUTTON_H;
  if (down && !wasDown && state.link !== null) say('press ' + ++state.presses);
  if (down !== wasDown) state.dirty = true;
  wasDown = down;
  if (!state.dirty) { keep(); return; }
  state.dirty = false;
  draw(down);
});

console.log('esp32-ble ready: advertising ' + state.name);
